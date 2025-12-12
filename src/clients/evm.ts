import { ethers } from "ethers"
import { addresses } from "../config.js"
import {
  type BridgeDeposit,
  ChainKind,
  type EvmInitTransferEvent,
  type MPCSignature,
  type OmniAddress,
  type OmniTransferMessage,
  type TokenMetadata,
  type TransferMessagePayload,
} from "../types/index.js"
import { type EVMChainKind, getChain, omniAddress } from "../utils/index.js"

// Contract ABI for the bridge token factory
const BRIDGE_TOKEN_FACTORY_ABI = [
  "function deployToken(bytes signatureData, tuple(string token, string name, string symbol, uint8 decimals) metadata) payable external returns (address)",
  "function finTransfer(bytes signature, tuple(uint64 destinationNonce, uint8 originChain, uint64 originNonce, address tokenAddress, uint128 amount, address recipient, string feeRecipient) transferPayload) payable external",
  "function initTransfer(address tokenAddress, uint128 amount, uint128 fee, uint128 nativeFee, string recipient, string message) payable external",
  "function nearToEthToken(string nearTokenId) external view returns (address)",
  "function logMetadata(address tokenAddress) external returns (string)",
] as const

// Typed interfaces for contracts (explicit methods, no index signatures)
interface BridgeTokenFactory extends ethers.BaseContract {
  deployToken(
    signatureData: ethers.BytesLike,
    metadata: TokenMetadata,
    overrides?: ethers.Overrides,
  ): Promise<ethers.ContractTransactionResponse>
  finTransfer(
    signature: ethers.BytesLike,
    transferPayload: BridgeDeposit,
    overrides?: ethers.Overrides,
  ): Promise<ethers.ContractTransactionResponse>
  initTransfer(
    tokenAddress: string,
    amount: bigint,
    fee: bigint,
    nativeFee: bigint,
    recipient: string,
    message: string,
    overrides?: ethers.Overrides,
  ): Promise<ethers.ContractTransactionResponse>
  logMetadata(
    tokenAddress: string,
    overrides?: ethers.Overrides,
  ): Promise<ethers.ContractTransactionResponse>
  getAddress(): Promise<string>
}

interface ERC20Contract extends ethers.BaseContract {
  approve(
    spender: string,
    amount: bigint,
    overrides?: ethers.Overrides,
  ): Promise<ethers.ContractTransactionResponse>
  allowance(owner: string, spender: string): Promise<bigint>
}

// Typed interface for InitTransfer event args
interface InitTransferEventArgs {
  sender: string
  tokenAddress: string
  originNonce: bigint
  amount: bigint
  fee: bigint
  nativeTokenFee: bigint
  recipient: string
  message: string
}

/**
 * Gas limits for EVM transactions mapped by chain tag
 * @internal
 */
const GAS_LIMIT = {
  DEPLOY_TOKEN: {
    [ChainKind.Eth]: 500000,
    [ChainKind.Base]: 500000,
    [ChainKind.Arb]: 3000000, // Arbitrum typically needs higher gas limits
    [ChainKind.Bnb]: 500000,
    [ChainKind.Pol]: 500000,
  },
  LOG_METADATA: {
    [ChainKind.Eth]: 100000,
    [ChainKind.Base]: 100000,
    [ChainKind.Arb]: 600000,
    [ChainKind.Bnb]: 100000,
    [ChainKind.Pol]: 100000,
  },
} as const

/**
 * EVM blockchain implementation of the bridge client
 */
export class EvmBridgeClient {
  private factory: BridgeTokenFactory

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
      case ChainKind.Bnb:
        bridgeAddress = addresses.bnb
        break
      case ChainKind.Pol:
        bridgeAddress = addresses.pol
        break
      default:
        throw new Error(`Factory address not configured for chain ${chain}`)
    }

    // Validate that the bridge address is not a zero address
    if (bridgeAddress === "0x0000000000000000000000000000000000000000") {
      throw new Error(
        `Bridge contract address not configured for ${ChainKind[chain]}. Please configure the address using setConfig() before using the client.`,
      )
    }

    this.factory = new ethers.Contract(
      bridgeAddress,
      BRIDGE_TOKEN_FACTORY_ABI,
      this.wallet,
    ) as unknown as BridgeTokenFactory
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
    const parts = tokenAddress.split(":")
    const tokenAccountId = parts[1]
    if (!tokenAccountId) {
      throw new Error("Invalid token address format")
    }

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
    if (!receipt) {
      throw new Error("Failed to get transaction receipt")
    }
    const deployedAddress =
      ("events" in receipt && Array.isArray(receipt.events) && receipt.events[0]?.args?.token) ||
      ("contractAddress" in receipt && receipt.contractAddress) ||
      ""

    return {
      txHash: tx.hash,
      tokenAddress: deployedAddress,
    }
  }

  /**
   * Approves the bridge factory to spend ERC20 tokens on behalf of the user
   * @param tokenAddress - The ERC20 token contract address
   * @param amount - Amount to approve for spending
   * @returns Promise resolving to transaction hash
   */
  async approveToken(tokenAddress: string, amount: bigint): Promise<string> {
    if (this.isNativeToken(omniAddress(this.chain, tokenAddress))) {
      // Native tokens don't need approval
      return ""
    }

    const erc20Abi = [
      "function approve(address spender, uint256 amount) external returns (bool)",
      "function allowance(address owner, address spender) external view returns (uint256)",
    ]

    const tokenContract = new ethers.Contract(
      tokenAddress,
      erc20Abi,
      this.wallet,
    ) as unknown as ERC20Contract

    try {
      const tx = await tokenContract.approve(await this.factory.getAddress(), amount)
      const receipt = await tx.wait()
      return receipt?.hash ?? ""
    } catch (error) {
      throw new Error(
        `Failed to approve token: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    }
  }

  /**
   * Approves maximum possible amount (permanent approval) for the bridge factory
   * @param tokenAddress - The ERC20 token contract address
   * @returns Promise resolving to transaction hash
   */
  async approveTokenMax(tokenAddress: string): Promise<string> {
    // Use the maximum uint256 value for permanent approval
    return this.approveToken(tokenAddress, ethers.MaxUint256)
  }

  /**
   * Checks the current allowance for the bridge factory to spend tokens
   * @param tokenAddress - The ERC20 token contract address
   * @param owner - The token owner address
   * @returns Promise resolving to current allowance amount
   */
  async checkAllowance(tokenAddress: string, owner: string): Promise<bigint> {
    if (this.isNativeToken(omniAddress(this.chain, tokenAddress))) {
      // Native tokens don't need allowance
      return ethers.MaxUint256
    }

    const erc20Abi = [
      "function allowance(address owner, address spender) external view returns (uint256)",
    ]
    const tokenContract = new ethers.Contract(
      tokenAddress,
      erc20Abi,
      this.wallet,
    ) as unknown as ERC20Contract

    try {
      const allowance = await tokenContract.allowance(owner, await this.factory.getAddress())
      return BigInt(allowance.toString())
    } catch (error) {
      throw new Error(
        `Failed to check allowance: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    }
  }

  /**
   * Transfers ERC-20 tokens to the bridge contract on the EVM chain.
   * This transaction generates a proof that is subsequently used to mint/unlock
   * corresponding tokens on the destination chain.
   *
   * @param transfer - Transfer message containing token, amount, recipient, etc.
   * @param usePermanentApproval - If true, approves maximum amount for permanent approval
   * @throws {Error} If token address is not on the correct EVM chain
   * @returns Promise resolving to transaction hash
   */
  async initTransfer(transfer: OmniTransferMessage, usePermanentApproval = false): Promise<string> {
    const sourceChain = getChain(transfer.tokenAddress)

    // Validate source chain matches the client's chain
    if (sourceChain !== this.chain) {
      throw new Error(`Token address must be on ${ChainKind[this.chain]} chain`)
    }

    const parts = transfer.tokenAddress.split(":")
    const tokenAccountId = parts[1]
    if (!tokenAccountId) {
      throw new Error("Invalid token address format")
    }

    // Check and approve ERC20 tokens if needed
    if (!this.isNativeToken(omniAddress(this.chain, tokenAccountId))) {
      const currentAllowance = await this.checkAllowance(
        tokenAccountId,
        await this.wallet.getAddress(),
      )
      const requiredAmount = transfer.amount + transfer.fee

      if (currentAllowance < requiredAmount) {
        if (usePermanentApproval) {
          console.log(
            `Insufficient allowance (${currentAllowance}). Approving maximum amount for permanent approval...`,
          )
          await this.approveTokenMax(tokenAccountId)
          console.log("✓ Permanent token approval successful")
        } else {
          console.log(
            `Insufficient allowance (${currentAllowance}). Approving ${requiredAmount}...`,
          )
          await this.approveToken(tokenAccountId, requiredAmount)
          console.log("✓ Token approval successful")
        }
      } else {
        console.log(`✓ Sufficient allowance available (${currentAllowance})`)
      }
    }

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
      const receipt = await tx.wait()
      if (!receipt) {
        throw new Error("Failed to get transaction receipt")
      }
      return receipt.hash
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
    const tokenParts = transferMessage.token_address.split(":")
    const tokenAddress = tokenParts[1]
    if (!tokenAddress) {
      throw new Error("Invalid token address format")
    }

    const recipientParts = transferMessage.recipient.split(":")
    const recipient = recipientParts[1]
    if (!recipient) {
      throw new Error("Invalid recipient address format")
    }

    const bridgeDeposit: BridgeDeposit = {
      destinationNonce: BigInt(transferMessage.destination_nonce),
      originChain: ChainKind[transferMessage.transfer_id.origin_chain as keyof typeof ChainKind],
      originNonce: BigInt(transferMessage.transfer_id.origin_nonce),
      tokenAddress,
      amount: BigInt(transferMessage.amount),
      recipient,
      feeRecipient: transferMessage.fee_recipient ?? "",
    }

    try {
      const tx = await this.factory.finTransfer(signature.toBytes(true), bridgeDeposit)
      const receipt = await tx.wait()
      if (!receipt) {
        throw new Error("Failed to get transaction receipt")
      }
      return receipt.hash
    } catch (error) {
      throw new Error(
        `Failed to finalize transfer: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    }
  }

  /**
   * Parses InitTransfer event from an EVM transaction receipt
   * @param txHash - Transaction hash to parse
   * @returns Promise resolving to the parsed InitTransfer event
   * @throws {Error} If transaction receipt is not found or InitTransfer event is not found
   */
  async getInitTransferEvent(txHash: string): Promise<EvmInitTransferEvent> {
    const provider = this.wallet.provider
    if (!provider) {
      throw new Error("Provider not available on wallet")
    }

    // Retry mechanism for RPC indexing delays
    const receipt = await provider.getTransactionReceipt(txHash)

    if (!receipt) {
      throw new Error(`Transaction receipt not found for hash: ${txHash}`)
    }

    // ABI for InitTransfer event
    const initTransferEventAbi = [
      "event InitTransfer(address indexed sender, address indexed tokenAddress, uint64 indexed originNonce, uint128 amount, uint128 fee, uint128 nativeTokenFee, string recipient, string message)",
    ]

    const iface = new ethers.Interface(initTransferEventAbi)

    // Find the InitTransfer event in the logs
    for (const log of receipt.logs) {
      try {
        const parsedLog = iface.parseLog({
          topics: log.topics,
          data: log.data,
        })

        if (!parsedLog) {
          throw new Error("InitTransfer event not found in transaction logs")
        }

        const args = parsedLog.args as unknown as InitTransferEventArgs
        return {
          sender: args.sender,
          tokenAddress: args.tokenAddress,
          originNonce: BigInt(args.originNonce),
          amount: args.amount,
          fee: args.fee,
          nativeTokenFee: args.nativeTokenFee,
          recipient: args.recipient,
          message: args.message,
        }
      } catch {
        // Continue searching other logs if this one doesn't match
      }
    }

    throw new Error("InitTransfer event not found in transaction logs")
  }

  private isNativeToken(omniAddress: OmniAddress): boolean {
    const parts = omniAddress.split(":")
    return parts[1] === "0x0000000000000000000000000000000000000000"
  }
}
