import { ethers } from "ethers"
import { addresses } from "../config"
import {
  type BridgeDeposit,
  ChainKind,
  type MPCSignature,
  type OmniAddress,
  type OmniTransferMessage,
  type TokenMetadata,
  type TransferMessagePayload,
} from "../types"
import { getChain } from "../utils"

// Type helpers for EVM chains
export type EVMChainKind = ChainKind.Eth | ChainKind.Base | ChainKind.Arb

// Contract ABI for the bridge token factory
const BRIDGE_TOKEN_FACTORY_ABI = [
  "function deployToken(bytes signatureData, tuple(string token, string name, string symbol, uint8 decimals) metadata) external returns (address)",
  "function finTransfer(bytes signature, tuple(uint64 destinationNonce, uint8 originChain, uint64 originNonce, address tokenAddress, uint128 amount, address recipient, string feeRecipient) transferPayload) external",
  "function initTransfer(address tokenAddress, uint128 amount, uint128 fee, uint128 nativeFee, string recipient, string message) external",
  "function nearToEthToken(string nearTokenId) external view returns (address)",
  "function logMetadata(address tokenAddress) external returns (string)",
] as const

/**
 * Gas limits for EVM transactions mapped by chain tag
 * @internal
 */
const GAS_LIMIT = {
  DEPLOY_TOKEN: {
    [ChainKind.Eth]: 500000,
    [ChainKind.Base]: 500000,
    [ChainKind.Arb]: 3000000, // Arbitrum typically needs higher gas limits
  },
  LOG_METADATA: {
    [ChainKind.Eth]: 100000,
    [ChainKind.Base]: 100000,
    [ChainKind.Arb]: 600000,
  },
} as const

/**
 * EVM blockchain implementation of the bridge client
 */
export class EvmBridgeClient {
  private factory: ethers.Contract

  /**
   * Creates a new EVM bridge client instance
   * @param wallet - Ethereum signer instance for transaction signing
   * @param chain - The EVM chain to deploy to (Ethereum, Base, or Arbitrum)
   * @throws {Error} If factory address is not configured for the chain or if chain is not EVM
   */
  constructor(
    private wallet: ethers.Signer,
    private chain: EVMChainKind,
  ) {
    // Get Omni Bridge address from global config based on chain
    let bridgeAddress: string
    switch (chain) {
      case ChainKind.Eth:
        bridgeAddress = addresses.eth
        break
      case ChainKind.Base:
        bridgeAddress = addresses.base
        break
      case ChainKind.Arb:
        bridgeAddress = addresses.arb
        break
      default:
        throw new Error(`Factory address not configured for chain ${chain}`)
    }

    this.factory = new ethers.Contract(bridgeAddress, BRIDGE_TOKEN_FACTORY_ABI, this.wallet)
  }

  /**
   * Logs metadata for a token
   * @param tokenAddress - OmniAddress of the token
   * @returns Promise resolving to the transaction hash
   * @throws Will throw an error if logging fails or caller doesn't have admin role
   */
  async logMetadata(tokenAddress: OmniAddress): Promise<string> {
    const sourceChain = getChain(tokenAddress)

    // Validate source chain matches the client's chain
    if (sourceChain !== this.chain) {
      throw new Error(`Token address must be on ${ChainKind[this.chain]} chain`)
    }

    // Extract token address from OmniAddress
    const [_, tokenAccountId] = tokenAddress.split(":")

    try {
      // Call logMetadata function on the contract
      const tx = await this.factory.logMetadata(tokenAccountId, {
        gasLimit: GAS_LIMIT.LOG_METADATA[this.chain],
      })
      return tx.hash
    } catch (error) {
      throw new Error(
        `Failed to log metadata: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    }
  }

  /**
   * Deploys an ERC-20 token representing a bridged version of a token from another chain.
   * @param signature - MPC signature authorizing the token deployment
   * @param metadata - Object containing token metadata
   * @returns Promise resolving to object containing transaction hash and deployed token address
   * @throws Will throw an error if the deployment fails
   */
  async deployToken(
    signature: MPCSignature,
    metadata: TokenMetadata,
  ): Promise<{
    txHash: string
    tokenAddress: string
  }> {
    const tx = await this.factory.deployToken(signature.toBytes(true), metadata, {
      gasLimit: GAS_LIMIT.DEPLOY_TOKEN[this.chain],
    })

    const receipt = await tx.wait()
    const deployedAddress = receipt.events?.[0]?.args?.token || receipt.contractAddress

    return {
      txHash: tx.hash,
      tokenAddress: deployedAddress,
    }
  }

  /**
   * Transfers ERC-20 tokens to the bridge contract on the EVM chain.
   * This transaction generates a proof that is subsequently used to mint/unlock
   * corresponding tokens on the destination chain.
   *
   * @param token - Omni address of the ERC20 token to transfer
   * @param recipient - Recipient's Omni address on the destination chain where tokens will be minted
   * @param amount - Amount of the tokens to transfer
   * @throws {Error} If token address is not on the correct EVM chain
   * @returns Promise resolving to transaction hash
   */
  async initTransfer(transfer: OmniTransferMessage): Promise<string> {
    const sourceChain = getChain(transfer.tokenAddress)

    // Validate source chain matches the client's chain
    if (sourceChain !== this.chain) {
      throw new Error(`Token address must be on ${ChainKind[this.chain]} chain`)
    }

    const [_, tokenAccountId] = transfer.tokenAddress.split(":")

    try {
      const tx = await this.factory.initTransfer(
        tokenAccountId,
        transfer.amount,
        transfer.fee,
        transfer.nativeFee,
        transfer.recipient,
        transfer.message || "",
        {
          value: this.isNativeToken(transfer.tokenAddress)
            ? transfer.amount + transfer.nativeFee
            : transfer.nativeFee,
        },
      )
      return tx.hash
    } catch (error) {
      throw new Error(
        `Failed to init transfer: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    }
  }

  /**
   * Finalizes a transfer on the EVM chain by minting/unlocking tokens.
   * @param transferMessage - The transfer message payload from NEAR
   * @param signature - MPC signature authorizing the transfer
   * @returns Promise resolving to the transaction hash
   */
  async finalizeTransfer(
    transferMessage: TransferMessagePayload,
    signature: MPCSignature,
  ): Promise<string> {
    // Convert the transfer message to EVM-compatible format
    const bridgeDeposit: BridgeDeposit = {
      destination_nonce: BigInt(transferMessage.destination_nonce),
      origin_chain: Number(transferMessage.transfer_id.origin_chain),
      origin_nonce: BigInt(transferMessage.transfer_id.origin_nonce),
      token_address: transferMessage.token_address.split(":")[1],
      amount: BigInt(transferMessage.amount),
      recipient: transferMessage.recipient.split(":")[1],
      fee_recipient: transferMessage.fee_recipient ?? "",
    }

    try {
      const tx = await this.factory.finTransfer(signature.toBytes(true), bridgeDeposit)
      const receipt = await tx.wait()
      return receipt.hash
    } catch (error) {
      throw new Error(
        `Failed to finalize transfer: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    }
  }

  private isNativeToken(omniAddress: OmniAddress): boolean {
    return omniAddress.split(":")[1] === "0x0000000000000000000000000000000000000000"
  }
}
