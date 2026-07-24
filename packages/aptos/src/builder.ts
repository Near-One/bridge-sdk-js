/**
 * Aptos transaction builder for Omni Bridge
 *
 * Builds entry-function payloads for the `omni_bridge` Move package,
 * matching the Rust bridge-sdk-rs AptosBridgeClient transaction
 * construction logic.
 *
 * Returns plain objects compatible with `InputEntryFunctionData` from
 * `@aptos-labs/ts-sdk` — pass straight to the transaction builder or a
 * wallet adapter:
 *   const payload = builder.buildTransfer(params)
 *   const txn = await aptos.transaction.build.simple({ sender, data: payload })
 *   // or: await signAndSubmitTransaction({ data: payload })
 */

import { getAddresses, type Network } from "@omni-bridge/core"
import { normalizeAptosAddress, splitSignature, utf8ToBytes } from "./encoding.js"

/** Move module that hosts the bridge entry functions. */
const MODULE_NAME = "omni_bridge"

/**
 * Entry-function payload, structurally compatible with `@aptos-labs/ts-sdk`
 * `InputEntryFunctionData`.
 *
 * Argument encoding follows the conventions of the ts-sdk argument
 * conversion: addresses as canonical `0x`-prefixed hex strings, u64/u128 as
 * decimal strings, u8 as numbers, `vector<u8>` as plain byte arrays, and
 * `Option<T>` as the inner value or `null` for None.
 */
export interface AptosFunctionPayload {
  function: `${string}::${string}::${string}`
  typeArguments: string[]
  functionArguments: (string | number | number[] | null)[]
}

export interface AptosBuilderConfig {
  network: Network
  /** Override the `omni_bridge` module address resolved from network config. */
  bridgeAddress?: string
}

export interface AptosTokenMetadata {
  /** Source-chain token id signed in the MetadataPayload (e.g. NEAR account id). */
  token: string
  name: string
  symbol: string
  decimals: number
}

export interface AptosTransferPayload {
  destinationNonce: bigint
  originChain: number
  originNonce: bigint
  /** Fungible Asset metadata object address of the token on Aptos. */
  tokenAddress: string
  amount: bigint
  /** Aptos account address of the recipient. */
  recipient: string
  feeRecipient?: string | undefined
  message?: string | undefined
}

export interface AptosBuilder {
  /** Canonical (zero-padded) address the `omni_bridge` package is published under. */
  readonly bridgeAddress: string

  /**
   * Build an `init_transfer` payload.
   *
   * No approve step is needed: the Move contract pulls funds directly from
   * the transaction signer. `fee` is token-denominated and must be strictly
   * less than `amount`; `nativeFee` is charged separately in APT (the
   * Fungible Asset at `0xa`). `amount` and `nativeFee` must fit in u64.
   */
  buildTransfer(params: {
    /** Fungible Asset metadata object address (APT itself is `0xa`). */
    token: string
    amount: bigint
    fee: bigint
    nativeFee: bigint
    /** Destination as an OmniAddress string, e.g. `near:alice.near`. */
    recipient: string
    message?: string
  }): AptosFunctionPayload

  /** Build a `log_metadata` payload for an existing Fungible Asset. */
  buildLogMetadata(token: string): AptosFunctionPayload

  /** Build a `deploy_token` payload from a LogMetadataEvent signature. */
  buildDeployToken(signature: Uint8Array, metadata: AptosTokenMetadata): AptosFunctionPayload

  /** Build a `fin_transfer` payload from a SignTransferEvent. */
  buildFinalization(signature: Uint8Array, payload: AptosTransferPayload): AptosFunctionPayload
}

class AptosBuilderImpl implements AptosBuilder {
  readonly bridgeAddress: string

  constructor(config: AptosBuilderConfig) {
    if (config.bridgeAddress) {
      this.bridgeAddress = normalizeAptosAddress(config.bridgeAddress)
    } else {
      const addresses = getAddresses(config.network)
      if (!addresses.aptos) {
        throw new Error(`No Aptos bridge address configured for ${config.network}`)
      }
      this.bridgeAddress = normalizeAptosAddress(addresses.aptos.bridge)
    }
  }

  private entryFunction(name: string): `${string}::${string}::${string}` {
    return `${this.bridgeAddress}::${MODULE_NAME}::${name}`
  }

  buildTransfer(params: {
    token: string
    amount: bigint
    fee: bigint
    nativeFee: bigint
    recipient: string
    message?: string
  }): AptosFunctionPayload {
    return {
      function: this.entryFunction("init_transfer"),
      typeArguments: [],
      functionArguments: [
        normalizeAptosAddress(params.token),
        params.amount.toString(),
        params.fee.toString(),
        params.nativeFee.toString(),
        params.recipient,
        utf8ToBytes(params.message ?? ""),
      ],
    }
  }

  buildLogMetadata(token: string): AptosFunctionPayload {
    return {
      function: this.entryFunction("log_metadata"),
      typeArguments: [],
      functionArguments: [normalizeAptosAddress(token)],
    }
  }

  buildDeployToken(signature: Uint8Array, metadata: AptosTokenMetadata): AptosFunctionPayload {
    const { rs, v } = splitSignature(signature)
    return {
      function: this.entryFunction("deploy_token"),
      typeArguments: [],
      functionArguments: [
        Array.from(rs),
        v,
        metadata.token,
        metadata.name,
        metadata.symbol,
        metadata.decimals,
      ],
    }
  }

  buildFinalization(signature: Uint8Array, payload: AptosTransferPayload): AptosFunctionPayload {
    const { rs, v } = splitSignature(signature)
    return {
      function: this.entryFunction("fin_transfer"),
      typeArguments: [],
      functionArguments: [
        Array.from(rs),
        v,
        payload.destinationNonce.toString(),
        payload.originChain,
        payload.originNonce.toString(),
        normalizeAptosAddress(payload.tokenAddress),
        payload.amount.toString(),
        normalizeAptosAddress(payload.recipient),
        payload.feeRecipient ? payload.feeRecipient : null,
        payload.message && payload.message.length > 0 ? utf8ToBytes(payload.message) : null,
      ],
    }
  }
}

export function createAptosBuilder(config: AptosBuilderConfig): AptosBuilder {
  return new AptosBuilderImpl(config)
}
