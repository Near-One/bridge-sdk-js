import { ethers } from "ethers"
import type {
  BridgeDeposit,
  ChainKind,
  MPCSignature,
  OmniAddress,
  OmniTransferMessage,
  TokenMetadata,
  TransferMessagePayload,
} from "../types"
import { getChain } from "../utils"

// Type helpers for EVM chains
type EVMChainKind = typeof ChainKind.Eth | typeof ChainKind.Base | typeof ChainKind.Arb
type ChainTag<T extends ChainKind> = keyof T

// Contract ABI for the bridge token factory
const BRIDGE_TOKEN_FACTORY_ABI = [
  "function deployToken(bytes signatureData, tuple(string token, string name, string symbol, uint8 decimals) metadata) external returns (address)",
  "function finTransfer(bytes signature, tuple(uint64 destinationNonce, uint8 originChain, uint64 originNonce, address tokenAddress, uint128 amount, address recipient, string feeRecipient) transferPayload) external",
  "function initTransfer(address tokenAddress, uint128 amount, uint128 fee, uint128 nativeFee, string recipient, string message) external",
  "function nearToEthToken(string nearTokenId) external view returns (address)",
  "function logMetadata(address tokenAddress) external returns (string)",
] as const

/**
 * Helper functions for chain operations
 */
const ChainUtils = {
  getTag: <T extends ChainKind>(chain: T): ChainTag<T> => {
    return Object.keys(chain)[0] as ChainTag<T>
  },

  isEVMChain: (chain: ChainKind): chain is EVMChainKind => {
    const tag = ChainUtils.getTag(chain)
    return tag === "Eth" || tag === "Base" || tag === "Arb"
  },

  areEqual: (a: ChainKind, b: ChainKind): boolean => {
    return ChainUtils.getTag(a) === ChainUtils.getTag(b)
  },
} as const

/**
 * Gas limits for EVM transactions mapped by chain tag
 * @internal
 */
const GAS_LIMIT = {
  DEPLOY_TOKEN: {
    Eth: 500000,
    Base: 500000,
    Arb: 3000000, // Arbitrum typically needs higher gas limits
  },
  LOG_METADATA: {
    Eth: 100000,
    Base: 100000,
    Arb: 600000,
  },
} as const

/**
 * Factory addresses for different chains mapped by chain tag
 */
const FACTORY_ADDRESSES: Record<ChainTag<EVMChainKind>, string | undefined> = {
  Eth: process.env.OMNI_FACTORY_ETH,
  Base: process.env.OMNI_FACTORY_BASE,
  Arb: process.env.OMNI_FACTORY_ARBITRUM,
}

/**
 * EVM blockchain implementation of the bridge client
 */
export class EvmBridgeClient {
  private factory: ethers.Contract
  private chainKind: EVMChainKind
  private chainTag: ChainTag<EVMChainKind>

  /**
   * Creates a new EVM bridge client instance
   * @param wallet - Ethereum signer instance for transaction signing
   * @param chain - The EVM chain to deploy to (Ethereum, Base, or Arbitrum)
   * @throws {Error} If factory address is not configured for the chain or if chain is not EVM
   */
  constructor(
    private wallet: ethers.Signer,
    chain: ChainKind,
  ) {
    if (!ChainUtils.isEVMChain(chain)) {
      throw new Error(`Chain ${String(ChainUtils.getTag(chain))} is not an EVM chain`)
    }

    this.chainKind = chain
    this.chainTag = ChainUtils.getTag(chain)
    const factoryAddress = FACTORY_ADDRESSES[this.chainTag]

    if (!factoryAddress) {
      throw new Error(`Factory address not configured for chain ${this.chainTag}`)
    }

    this.factory = new ethers.Contract(factoryAddress, BRIDGE_TOKEN_FACTORY_ABI, this.wallet)
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
    if (!ChainUtils.areEqual(sourceChain, this.chainKind)) {
      throw new Error(`Token address must be on ${this.chainTag}`)
    }

    // Extract token address from OmniAddress
    const [_, tokenAccountId] = tokenAddress.split(":")

    try {
      // Call logMetadata function on the contract
      const tx = await this.factory.logMetadata(tokenAccountId, {
        gasLimit: GAS_LIMIT.LOG_METADATA[this.chainTag],
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
      gasLimit: GAS_LIMIT.DEPLOY_TOKEN[this.chainTag],
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
    if (!ChainUtils.areEqual(sourceChain, this.chainKind)) {
      throw new Error(`Token address must be on ${this.chainTag}`)
    }

    const [_, tokenAccountId] = transfer.tokenAddress.split(":")

    try {
      const tx = await this.factory.initTransfer(
        tokenAccountId,
        transfer.amount,
        transfer.fee,
        transfer.nativeFee,
        transfer.recipient,
        "",
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
      destination_nonce: transferMessage.destination_nonce,
      origin_chain: Number(transferMessage.transfer_id.origin_chain),
      origin_nonce: transferMessage.transfer_id.origin_nonce,
      token_address: this.extractEvmAddress(transferMessage.token_address),
      amount: BigInt(transferMessage.amount),
      recipient: this.extractEvmAddress(transferMessage.recipient),
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

  /**
   * Helper method to extract EVM address from OmniAddress
   * @param omniAddress - The OmniAddress to extract from
   * @returns The EVM address
   */
  private extractEvmAddress(omniAddress: OmniAddress): string {
    const chain = getChain(omniAddress)
    const [_, address] = omniAddress.split(":")
    if (!ChainUtils.isEVMChain(chain)) {
      throw new Error(`Invalid EVM address: ${omniAddress}`)
    }
    return address
  }
}
