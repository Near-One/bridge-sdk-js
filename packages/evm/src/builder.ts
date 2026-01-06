/**
 * EVM transaction builder for Omni Bridge
 */

import {
  EVM_CHAIN_IDS,
  type EvmChainKind,
  type EvmUnsignedTransaction,
  getAddress,
  getAddresses,
  getChainPrefix,
  isEvmChain,
  type Network,
  type ValidatedTransfer,
} from "@omni-bridge/core"
import { type Address, encodeFunctionData, type Hex, maxUint256 } from "viem"
import { BRIDGE_TOKEN_FACTORY_ABI, ERC20_ABI } from "./abi.js"

export interface EvmBuilderConfig {
  network: Network
  chain: EvmChainKind
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
   * The chain ID for this builder's configured chain
   */
  readonly chainId: number

  /**
   * The bridge contract address for this builder's configured chain
   */
  readonly bridgeAddress: Address

  /**
   * Build an unsigned transfer transaction
   */
  buildTransfer(validated: ValidatedTransfer): EvmUnsignedTransaction

  /**
   * Build an ERC20 approval transaction for the bridge contract
   */
  buildApproval(token: Address, amount: bigint): EvmUnsignedTransaction

  /**
   * Build a max approval transaction for the bridge contract
   */
  buildMaxApproval(token: Address): EvmUnsignedTransaction

  /**
   * Build a finalization transaction
   */
  buildFinalization(payload: TransferPayload, signature: Uint8Array): EvmUnsignedTransaction

  /**
   * Build a log metadata transaction
   */
  buildLogMetadata(token: Address): EvmUnsignedTransaction

  /**
   * Build a deploy token transaction
   */
  buildDeployToken(signature: Uint8Array, metadata: TokenMetadata): EvmUnsignedTransaction
}

const NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000" as Address

function isNativeToken(tokenAddress: Address): boolean {
  return tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()
}

/**
 * Get the bridge address for an EVM chain
 */
function getBridgeAddress(network: Network, chain: EvmChainKind): Address {
  const addresses = getAddresses(network)
  const prefix = getChainPrefix(chain)
  const chainAddresses = addresses[prefix as keyof typeof addresses]
  if (!chainAddresses || !("bridge" in chainAddresses)) {
    throw new Error(`No bridge address found for chain ${prefix} on ${network}`)
  }
  return chainAddresses.bridge as Address
}

/**
 * Get the chain ID for an EVM chain
 */
function getChainId(network: Network, chain: EvmChainKind): number {
  const prefix = getChainPrefix(chain)
  const chainId = EVM_CHAIN_IDS[network][prefix]
  if (chainId === undefined) {
    throw new Error(`Chain ID not found for ${prefix} on ${network}`)
  }
  return chainId
}

class EvmBuilderImpl implements EvmBuilder {
  readonly chainId: number
  readonly bridgeAddress: Address
  private readonly chain: EvmChainKind

  constructor(config: EvmBuilderConfig) {
    this.chain = config.chain
    this.chainId = getChainId(config.network, config.chain)
    this.bridgeAddress = getBridgeAddress(config.network, config.chain)
  }

  buildTransfer(validated: ValidatedTransfer): EvmUnsignedTransaction {
    if (!isEvmChain(validated.sourceChain)) {
      throw new Error(`Source chain ${validated.sourceChain} is not an EVM chain`)
    }

    // Verify the validated transfer matches our configured chain
    if (validated.sourceChain !== this.chain) {
      throw new Error(
        `ValidatedTransfer source chain (${validated.sourceChain}) does not match builder chain (${this.chain})`,
      )
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

    return {
      chainId: this.chainId,
      to: this.bridgeAddress,
      data: data as Hex,
      value,
    }
  }

  buildApproval(token: Address, amount: bigint): EvmUnsignedTransaction {
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [this.bridgeAddress, amount],
    })

    return {
      chainId: this.chainId,
      to: token,
      data: data as Hex,
      value: 0n,
    }
  }

  buildMaxApproval(token: Address): EvmUnsignedTransaction {
    return this.buildApproval(token, maxUint256)
  }

  buildFinalization(payload: TransferPayload, signature: Uint8Array): EvmUnsignedTransaction {
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

    return {
      chainId: this.chainId,
      to: this.bridgeAddress,
      data: data as Hex,
      value: 0n,
    }
  }

  buildLogMetadata(token: Address): EvmUnsignedTransaction {
    const data = encodeFunctionData({
      abi: BRIDGE_TOKEN_FACTORY_ABI,
      functionName: "logMetadata",
      args: [token],
    })

    return {
      chainId: this.chainId,
      to: this.bridgeAddress,
      data: data as Hex,
      value: 0n,
    }
  }

  buildDeployToken(signature: Uint8Array, metadata: TokenMetadata): EvmUnsignedTransaction {
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
      chainId: this.chainId,
      to: this.bridgeAddress,
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
  return new EvmBuilderImpl(config)
}
