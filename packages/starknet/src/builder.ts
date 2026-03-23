/**
 * Starknet transaction builder for Omni Bridge
 *
 * Builds starknet.js Call[] arrays matching the Rust bridge-sdk-rs
 * StarknetBridgeClient transaction construction logic.
 *
 * Returns Call[] directly — pass straight to account.execute():
 *   const calls = builder.buildTransfer(params)
 *   await account.execute(calls)
 */

import { getAddresses, type Network } from "@omni-bridge/core"
import { type Call, CallData } from "starknet"
import { encodeByteArray, encodeSignature } from "./encoding.js"

export interface StarknetBuilderConfig {
  network: Network
  bridgeAddress?: string
}

export interface StarknetTokenMetadata {
  token: string
  name: string
  symbol: string
  decimals: number
}

export interface StarknetTransferPayload {
  destinationNonce: bigint
  originChain: number
  originNonce: bigint
  tokenAddress: string
  amount: bigint
  recipient: string
  feeRecipient?: string | undefined
  message?: Uint8Array | undefined
}

export interface StarknetBuilder {
  readonly bridgeAddress: string

  /** Build an init_transfer (includes ERC-20 approve + init_transfer). */
  buildTransfer(params: {
    token: string
    amount: bigint
    fee: bigint
    nativeFee: bigint
    recipient: string
    message?: string
  }): Call[]

  /** Build a log_metadata call. */
  buildLogMetadata(token: string): Call[]

  /** Build a deploy_token call from a LogMetadataEvent signature. */
  buildDeployToken(signature: Uint8Array, metadata: StarknetTokenMetadata): Call[]

  /** Build a fin_transfer call from a SignTransferEvent. */
  buildFinalization(signature: Uint8Array, payload: StarknetTransferPayload): Call[]
}

function compileCalldata(raw: string[]): string[] {
  return CallData.compile(raw) as unknown as string[]
}

class StarknetBuilderImpl implements StarknetBuilder {
  readonly bridgeAddress: string

  constructor(config: StarknetBuilderConfig) {
    if (config.bridgeAddress) {
      this.bridgeAddress = config.bridgeAddress
    } else {
      const addresses = getAddresses(config.network)
      this.bridgeAddress = addresses.strk.bridge
    }
  }

  buildTransfer(params: {
    token: string
    amount: bigint
    fee: bigint
    nativeFee: bigint
    recipient: string
    message?: string
  }): Call[] {
    return [
      {
        contractAddress: params.token,
        entrypoint: "approve",
        calldata: compileCalldata([this.bridgeAddress, params.amount.toString(), "0"]),
      },
      {
        contractAddress: this.bridgeAddress,
        entrypoint: "init_transfer",
        calldata: compileCalldata([
          params.token,
          params.amount.toString(),
          params.fee.toString(),
          params.nativeFee.toString(),
          ...encodeByteArray(params.recipient),
          ...encodeByteArray(params.message ?? ""),
        ]),
      },
    ]
  }

  buildLogMetadata(token: string): Call[] {
    return [
      {
        contractAddress: this.bridgeAddress,
        entrypoint: "log_metadata",
        calldata: compileCalldata([token]),
      },
    ]
  }

  buildDeployToken(signature: Uint8Array, metadata: StarknetTokenMetadata): Call[] {
    return [
      {
        contractAddress: this.bridgeAddress,
        entrypoint: "deploy_token",
        calldata: compileCalldata([
          ...encodeSignature(signature),
          ...encodeByteArray(metadata.token),
          ...encodeByteArray(metadata.name),
          ...encodeByteArray(metadata.symbol),
          metadata.decimals.toString(),
        ]),
      },
    ]
  }

  buildFinalization(signature: Uint8Array, payload: StarknetTransferPayload): Call[] {
    const raw: string[] = [
      ...encodeSignature(signature),
      payload.destinationNonce.toString(),
      payload.originChain.toString(),
      payload.originNonce.toString(),
      payload.tokenAddress,
      payload.amount.toString(),
      payload.recipient,
    ]

    // Cairo Option<ByteArray>: Some = variant 0 + value, None = variant 1
    if (payload.feeRecipient) {
      raw.push("0", ...encodeByteArray(payload.feeRecipient))
    } else {
      raw.push("1")
    }

    if (payload.message && payload.message.length > 0) {
      raw.push("0", ...encodeByteArray(new TextDecoder().decode(payload.message)))
    } else {
      raw.push("1")
    }

    return [
      {
        contractAddress: this.bridgeAddress,
        entrypoint: "fin_transfer",
        calldata: compileCalldata(raw),
      },
    ]
  }
}

export function createStarknetBuilder(config: StarknetBuilderConfig): StarknetBuilder {
  return new StarknetBuilderImpl(config)
}
