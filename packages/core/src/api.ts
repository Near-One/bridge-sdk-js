/**
 * Bridge API client for Omni Bridge backend services
 */

import { z } from "zod"
import { API_BASE_URLS } from "./config.js"
import { OmniBridgeError } from "./errors.js"
import type { Network, OmniAddress } from "./types.js"

// API response schemas
const ChainSchema = z.enum([
  "Eth",
  "Near",
  "Sol",
  "Arb",
  "Base",
  "Bnb",
  "Btc",
  "Zcash",
  "Pol",
  "Abs",
  "HlEvm",
  "Strk",
  "Fogo",
  "Aptos",
])
export type Chain = z.infer<typeof ChainSchema>

const KNOWN_TRANSFER_STATUSES = [
  "Initialised",
  "Signed",
  "FastFinalisedOnNear",
  "FinalisedOnNear",
  "FastFinalised",
  "Finalised",
  "Settled",
] as const

/**
 * Transfer lifecycle status. `Settled` is the terminal state.
 *
 * The set is open for extension — the API may introduce new statuses without
 * an SDK release, and such values pass through as plain strings.
 */
export type TransferStatus = (typeof KNOWN_TRANSFER_STATUSES)[number] | (string & {})

const TransferStatusSchema = z
  .enum(KNOWN_TRANSFER_STATUSES)
  .or(z.string()) as z.ZodType<TransferStatus>

// Custom transformer for safe BigInt coercion
const safeBigInt = (nullable = false) => {
  return z.preprocess(
    (val) => {
      if (val === null && nullable) return null
      try {
        if (typeof val === "number") {
          return BigInt(val.toLocaleString("fullwide", { useGrouping: false }))
        }
        if (typeof val === "string") {
          try {
            return BigInt(val)
          } catch {
            const num = Number(val)
            if (!Number.isNaN(num)) {
              return BigInt(num.toLocaleString("fullwide", { useGrouping: false }))
            }
            throw new Error(`Cannot convert ${val} to BigInt`)
          }
        }
        return val
      } catch {
        throw new Error(`Invalid BigInt value: ${val}`)
      }
    },
    nullable ? z.bigint().min(0n).nullable() : z.bigint().min(0n),
  )
}

// The v4 API omits absent optional fields instead of serializing null — normalize to null
const orNull = <T extends z.ZodType>(schema: T) => schema.nullish().default(null)

const UtxoChainSchema = ChainSchema.extract(["Btc", "Zcash"])

const TransactionDetailsSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("near"),
    block_height: z.number().int().min(0),
    receipt_id: z.string(),
  }),
  z.object({
    type: z.literal("evm"),
    block_number: z.number().int().min(0),
    transaction_index: orNull(z.number().int().min(0)),
    log_index: orNull(z.number().int().min(0)),
  }),
  z.object({
    type: z.literal("evm_on_near"),
    block_number: z.number().int().min(0),
    transaction_index: orNull(z.number().int().min(0)),
    log_index: orNull(z.number().int().min(0)),
  }),
  z.object({
    type: z.literal("solana"),
    slot: z.number().int().min(0),
    instruction_index: z.number().int().min(0),
  }),
  z.object({
    type: z.literal("utxo"),
    block_height: z.number().int().min(0),
    block_hash: z.string(),
  }),
  z.object({
    type: z.literal("starknet"),
    block_number: z.number().int().min(0),
    event_index: orNull(z.number().int().min(0)),
  }),
  z.object({
    type: z.literal("aptos"),
    version: z.number().int().min(0),
    event_index: orNull(z.number().int().min(0)),
  }),
])
export type TransactionDetails = z.infer<typeof TransactionDetailsSchema>

/**
 * A transaction that advanced the transfer. `transaction_hash` is the
 * chain-agnostic identifier (EVM tx hash, Solana signature, UTXO txid, NEAR tx
 * hash) — no need to switch on the chain to read it.
 */
const TransactionRefSchema = z.object({
  transaction_hash: z.string(),
  chain: ChainSchema,
  timestamp_seconds: z.number().int().min(0),
  details: TransactionDetailsSchema,
})
export type TransactionRef = z.infer<typeof TransactionRefSchema>

const TransferIdSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("nonce"),
    chain: ChainSchema,
    nonce: z.number().int().min(0),
  }),
  z.object({
    type: z.literal("utxo"),
    // Mostly Btc/Zcash, but we use `Near` for the final leg of Near->UTXO transfers
    chain: ChainSchema,
    tx_hash: z.string(),
    vout: z.number().int().min(0),
  }),
])
export type OmniTransferId = z.infer<typeof TransferIdSchema>

const UtxoSignSchema = TransactionRefSchema.extend({
  destination_chain: UtxoChainSchema,
  relayer: z.string(),
  pending_sign_id: z.string(),
})
export type UtxoSign = z.infer<typeof UtxoSignSchema>

const UtxoMetaSchema = z.object({
  chain: UtxoChainSchema,
  pending_sign_id: orNull(z.string()),
  relayer_fee: orNull(z.string()),
  protocol_fee: orNull(z.string()),
  relayer_account_id: orNull(z.string()),
})
export type UtxoMeta = z.infer<typeof UtxoMetaSchema>

const TransferSchema = z.object({
  transfer_id: orNull(TransferIdSchema),
  origin_chain: orNull(ChainSchema),
  destination_chain: orNull(ChainSchema),
  sender: orNull(z.string()),
  recipient: orNull(z.string()),
  token_id: orNull(z.string()),
  amount: orNull(z.string()),
  fee: orNull(z.string()),
  native_fee: orNull(z.string()),
  msg: orNull(z.string()),
  destination_nonce: orNull(z.number().int().min(0)),
  status: TransferStatusSchema,
  initialised: orNull(TransactionRefSchema),
  signed: z.array(TransactionRefSchema),
  fast_finalised_on_near: orNull(TransactionRefSchema),
  finalised_on_near: orNull(TransactionRefSchema),
  fast_finalised: orNull(TransactionRefSchema),
  finalised: orNull(TransactionRefSchema),
  claimed: orNull(TransactionRefSchema),
  verified: orNull(TransactionRefSchema),
  fee_updates: z.array(TransactionRefSchema),
  utxo_signs: z.array(UtxoSignSchema),
  utxo_winning_tx_hash: orNull(z.string()),
  utxo_meta: orNull(UtxoMetaSchema),
  tx_ids: z.array(z.string()),
})
export type Transfer = z.infer<typeof TransferSchema>

const TransfersResponseSchema = z.object({ transfers: z.array(TransferSchema) })
const TransferStatusesResponseSchema = z.object({ statuses: z.array(TransferStatusSchema) })

export type TransferLookupParams =
  | { originChain: Chain; originNonce: number }
  | { transactionHash: string }
  | { utxoChain: z.infer<typeof UtxoChainSchema>; utxoTxHash: string; utxoVout: number }

const ApiFeeResponseSchema = z.object({
  native_token_fee: safeBigInt(),
  gas_fee: safeBigInt(true).nullable().optional(),
  protocol_fee: safeBigInt(true).nullable().optional(),
  usd_fee: z.number(),
  transferred_token_fee: z.string().nullable().optional(),
  min_amount: z.string().nullable().optional(),
  insufficient_utxo: z.boolean(),
})
export type ApiFeeResponse = z.infer<typeof ApiFeeResponseSchema>

const AllowlistedTokensResponseSchema = z.object({
  allowlisted_tokens: z.record(z.string(), z.string()),
})

const PostActionSchema = z.object({
  receiver_id: z.string(),
  amount: z.string(),
  msg: z.string(),
  gas: z.string().optional(),
  memo: z.string().nullable().optional(),
})
export type PostAction = z.infer<typeof PostActionSchema>

export interface SafeDeposit {
  msg: string
}

const UtxoDepositAddressResponseSchema = z.object({
  address: z.string(),
})
export type UtxoDepositAddressResponse = z.infer<typeof UtxoDepositAddressResponseSchema>

// UTXO chain parameter type
export type UtxoChainParam = "btc" | "zcash"

// API Error class
class ApiError extends OmniBridgeError {
  constructor(
    message: string,
    public status?: number,
    public statusText?: string,
  ) {
    super(message, "API_ERROR", { status, statusText })
    this.name = "ApiError"
  }
}

export interface BridgeAPIConfig {
  baseUrl?: string
}

/**
 * Bridge API client for interacting with Omni Bridge backend
 */
export class BridgeAPI {
  private readonly baseUrl: string

  constructor(network: Network, config: BridgeAPIConfig = {}) {
    this.baseUrl = config.baseUrl ?? API_BASE_URLS[network]
  }

  private async fetchWithValidation<T extends z.ZodType>(
    url: URL,
    schema: T,
    options?: RequestInit,
  ): Promise<z.infer<T>> {
    const response = await fetch(url, options)

    if (response.status === 404) {
      const responseText = await response.text()
      throw new ApiError(responseText || "Resource not found", response.status, response.statusText)
    }

    if (!response.ok) {
      const responseText = await response.text()
      throw new ApiError(responseText || "API request failed", response.status, response.statusText)
    }

    const data = await response.json()
    return schema.parse(data)
  }

  private buildUrl(path: string, params: Record<string, string | undefined> = {}): URL {
    const url = new URL(`${this.baseUrl}${path}`)
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, value)
      }
    }
    return url
  }

  private static transferLookupParams(options: TransferLookupParams): Record<string, string> {
    if ("originChain" in options) {
      return {
        origin_chain: options.originChain,
        origin_nonce: options.originNonce.toString(),
      }
    }
    if ("utxoChain" in options) {
      return {
        utxo_chain: options.utxoChain,
        utxo_tx_hash: options.utxoTxHash,
        utxo_vout: options.utxoVout.toString(),
      }
    }
    return { transaction_hash: options.transactionHash }
  }

  /**
   * Get the status of a transfer.
   *
   * Statuses outside the known {@link TransferStatus} set may appear as the
   * API evolves
   */
  async getTransferStatus(options: TransferLookupParams): Promise<TransferStatus[]> {
    const url = this.buildUrl(
      "/api/v4/transfers/transfer/status",
      BridgeAPI.transferLookupParams(options),
    )
    const { statuses } = await this.fetchWithValidation(url, TransferStatusesResponseSchema)
    return statuses
  }

  /**
   * Get fee estimate for a transfer
   */
  async getFee(
    sender: OmniAddress,
    recipient: OmniAddress,
    tokenAddress: OmniAddress,
    amount: string | bigint,
  ): Promise<ApiFeeResponse> {
    const url = this.buildUrl("/api/v3/transfer-fee", {
      sender,
      recipient,
      token: tokenAddress,
      amount: typeof amount === "bigint" ? amount.toString() : amount,
    })
    return this.fetchWithValidation(url, ApiFeeResponseSchema)
  }

  /**
   * Get details of a transfer
   */
  async getTransfer(options: TransferLookupParams): Promise<Transfer[]> {
    const url = this.buildUrl("/api/v4/transfers/transfer", BridgeAPI.transferLookupParams(options))
    const { transfers } = await this.fetchWithValidation(url, TransfersResponseSchema)
    return transfers
  }

  /**
   * Find transfers by sender or transaction ID
   */
  async findTransfers(params: {
    sender?: string
    transactionId?: string
    offset?: number
    limit?: number
  }): Promise<Transfer[]> {
    if (!params.sender && !params.transactionId) {
      throw new OmniBridgeError(
        "Either sender or transactionId must be provided",
        "VALIDATION_ERROR",
      )
    }

    const urlParams: Record<string, string | undefined> = {
      offset: (params.offset ?? 0).toString(),
      limit: (params.limit ?? 10).toString(),
      sender: params.sender,
      transaction_id: params.transactionId,
    }

    const url = this.buildUrl("/api/v4/transfers", urlParams)
    const { transfers } = await this.fetchWithValidation(url, TransfersResponseSchema)
    return transfers
  }

  /**
   * Get list of allowlisted tokens
   */
  async getAllowlistedTokens(): Promise<Record<string, OmniAddress>> {
    const url = this.buildUrl("/api/v3/transfer-fee/allowlisted-tokens")
    const response = await this.fetchWithValidation(url, AllowlistedTokensResponseSchema)
    return response.allowlisted_tokens as Record<string, OmniAddress>
  }

  /**
   * Get deposit address for UTXO chain
   */
  async getUtxoDepositAddress(
    chain: UtxoChainParam,
    recipient: string,
    safeDeposit?: SafeDeposit | null,
    refundAddress?: string | null,
    skipTx?: boolean | null,
  ): Promise<UtxoDepositAddressResponse> {
    const body: Record<string, unknown> = {
      chain,
      recipient,
    }

    if (safeDeposit !== undefined && safeDeposit !== null) {
      body["safe_deposit"] = safeDeposit
    }

    if (refundAddress !== undefined && refundAddress !== null) {
      body["refund_address"] = refundAddress
    }

    if (skipTx !== undefined && skipTx !== null) {
      body["skip_tx"] = skipTx
    }

    const url = this.buildUrl("/api/v3/utxo/get_user_deposit_address")
    return this.fetchWithValidation(url, UtxoDepositAddressResponseSchema, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
  }

  /**
   * @deprecated Use `findTransfers` instead
   */
  async findOmniTransfers(params: {
    sender?: string
    transactionId?: string
    offset?: number
    limit?: number
  }): Promise<Transfer[]> {
    return this.findTransfers(params)
  }

  /**
   * @deprecated Use `getUtxoDepositAddress` instead
   */
  async getUtxoUserDepositAddress(
    chain: UtxoChainParam,
    recipient: string,
    safeDeposit?: SafeDeposit | null,
  ): Promise<UtxoDepositAddressResponse> {
    return this.getUtxoDepositAddress(chain, recipient, safeDeposit)
  }
}
