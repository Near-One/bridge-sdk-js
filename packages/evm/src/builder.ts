/**
 * EVM transaction builder for Omni Bridge
 */

import {
  EVM_CHAIN_IDS,
  type EvmUnsignedTransaction,
  getAddress,
  getChainPrefix,
  isEvmChain,
  type Network,
  type ValidatedTransfer,
} from "@omni-bridge/core"
import { type Address, encodeFunctionData, type Hex, maxUint256 } from "viem"
import { BRIDGE_TOKEN_FACTORY_ABI, ERC20_ABI } from "./abi.js"

export interface EvmBuilderConfig {
  network: Network
}

export interface TokenMetadata {
  token: string
  name: string
  symbol: string
  decimals: number
}

export interface TransferPayload {
  destinationNonce: bigint
  originChain: number
  originNonce: bigint
  tokenAddress: Address
  amount: bigint
  recipient: Address
  feeRecipient: string
}

/**
 * EVM transaction builder interface
 */
export interface EvmBuilder {
  /**
   * Build an unsigned transfer transaction
   */
  buildTransfer(validated: ValidatedTransfer): EvmUnsignedTransaction

  /**
   * Build an ERC20 approval transaction
   */
  buildApproval(token: Address, spender: Address, amount: bigint): EvmUnsignedTransaction

  /**
   * Build a max approval transaction (type alias for convenience)
   */
  buildMaxApproval(token: Address, spender: Address): EvmUnsignedTransaction

  /**
   * Build a finalization transaction
   */
  buildFinalization(
    payload: TransferPayload,
    signature: Uint8Array,
    chainId: number,
  ): EvmUnsignedTransaction

  /**
   * Build a log metadata transaction
   */
  buildLogMetadata(token: Address, bridgeAddress: Address, chainId: number): EvmUnsignedTransaction

  /**
   * Build a deploy token transaction
   */
  buildDeployToken(
    signature: Uint8Array,
    metadata: TokenMetadata,
    bridgeAddress: Address,
    chainId: number,
  ): EvmUnsignedTransaction
}

const NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000" as Address

function isNativeToken(tokenAddress: Address): boolean {
  return tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()
}

class EvmBuilderImpl implements EvmBuilder {
  constructor(private readonly network: Network) {}

  buildTransfer(validated: ValidatedTransfer): EvmUnsignedTransaction {
    if (!isEvmChain(validated.sourceChain)) {
      throw new Error(`Source chain ${validated.sourceChain} is not an EVM chain`)
    }

    const tokenAddress = getAddress(validated.params.token) as Address
    const recipient = validated.params.recipient
    const message = validated.params.message ?? ""

    // Encode the initTransfer call
    const data = encodeFunctionData({
      abi: BRIDGE_TOKEN_FACTORY_ABI,
      functionName: "initTransfer",
      args: [
        tokenAddress,
        validated.params.amount,
        validated.params.fee,
        validated.params.nativeFee,
        recipient,
        message,
      ],
    })

    // Calculate value: for native tokens, include amount + nativeFee
    // For ERC20 tokens, only include nativeFee
    const value = isNativeToken(tokenAddress)
      ? validated.params.amount + validated.params.nativeFee
      : validated.params.nativeFee

    // Get chain ID
    const chainPrefix = getChainPrefix(validated.sourceChain)
    const chainId = EVM_CHAIN_IDS[this.network][chainPrefix]
    if (chainId === undefined) {
      throw new Error(`Chain ID not found for ${chainPrefix} on ${this.network}`)
    }

    return {
      chainId,
      to: validated.contractAddress as Address,
      data: data as Hex,
      value,
    }
  }

  buildApproval(token: Address, spender: Address, amount: bigint): EvmUnsignedTransaction {
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, amount],
    })

    return {
      chainId: 0, // Consumer should set appropriate chainId
      to: token,
      data: data as Hex,
      value: 0n,
    }
  }

  buildMaxApproval(token: Address, spender: Address): EvmUnsignedTransaction {
    return this.buildApproval(token, spender, maxUint256)
  }

  buildFinalization(
    payload: TransferPayload,
    signature: Uint8Array,
    chainId: number,
  ): EvmUnsignedTransaction {
    const data = encodeFunctionData({
      abi: BRIDGE_TOKEN_FACTORY_ABI,
      functionName: "finTransfer",
      args: [
        `0x${bytesToHex(signature)}` as Hex,
        {
          destinationNonce: payload.destinationNonce,
          originChain: payload.originChain,
          originNonce: payload.originNonce,
          tokenAddress: payload.tokenAddress,
          amount: payload.amount,
          recipient: payload.recipient,
          feeRecipient: payload.feeRecipient,
        },
      ],
    })

    // Get bridge address for the destination chain
    // Consumer needs to provide this based on chainId
    return {
      chainId,
      to: "0x0000000000000000000000000000000000000000" as Address, // Consumer must override
      data: data as Hex,
      value: 0n,
    }
  }

  buildLogMetadata(
    token: Address,
    bridgeAddress: Address,
    chainId: number,
  ): EvmUnsignedTransaction {
    const data = encodeFunctionData({
      abi: BRIDGE_TOKEN_FACTORY_ABI,
      functionName: "logMetadata",
      args: [token],
    })

    return {
      chainId,
      to: bridgeAddress,
      data: data as Hex,
      value: 0n,
    }
  }

  buildDeployToken(
    signature: Uint8Array,
    metadata: TokenMetadata,
    bridgeAddress: Address,
    chainId: number,
  ): EvmUnsignedTransaction {
    const data = encodeFunctionData({
      abi: BRIDGE_TOKEN_FACTORY_ABI,
      functionName: "deployToken",
      args: [
        `0x${bytesToHex(signature)}` as Hex,
        {
          token: metadata.token,
          name: metadata.name,
          symbol: metadata.symbol,
          decimals: metadata.decimals,
        },
      ],
    })

    return {
      chainId,
      to: bridgeAddress,
      data: data as Hex,
      value: 0n,
    }
  }
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Create an EVM transaction builder
 */
export function createEvmBuilder(config: EvmBuilderConfig): EvmBuilder {
  return new EvmBuilderImpl(config.network)
}
