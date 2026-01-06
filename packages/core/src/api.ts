/**
 * Bridge API client for Omni Bridge backend services
 */

import { z } from "zod"
import { API_BASE_URLS } from "./config.js"
import { OmniBridgeError } from "./errors.js"
import type { Network, OmniAddress, TokenDecimals } from "./types.js"

// API response schemas
const ChainSchema = z.enum(["Eth", "Near", "Sol", "Arb", "Base", "Bnb", "Btc", "Zcash", "Pol"])
export type Chain = z.infer<typeof ChainSchema>

const TransferStatusSchema = z.enum([
  "Initialized",
  "Signed",
  "FastFinalisedOnNear",
  "FinalisedOnNear",
  "FastFinalised",
  "Finalised",
  "Claimed",
])
export type TransferStatus = z.infer<typeof TransferStatusSchema>

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

// Transaction type schemas
const NearReceiptTransactionSchema = z.object({
  block_height: z.number().int().min(0),
  block_timestamp_seconds: z.number().int().min(0),
  transaction_hash: z.string(),
})

const EVMLogTransactionSchema = z.object({
  block_height: z.number().int().min(0),
  block_timestamp_seconds: z.number().int().min(0),
  transaction_hash: z.string(),
})

const SolanaTransactionSchema = z.object({
  slot: z.number().int().min(0).optional(),
  block_timestamp_seconds: z.number().int().min(0).optional(),
  signature: z.string().optional(),
})

const UtxoLogTransactionSchema = z.object({
  transaction_hash: z.string(),
  block_height: z.number().int().min(0).nullable(),
  block_time: z.number().int().min(0).nullable(),
})

const TransactionSchema = z
  .object({
    NearReceipt: NearReceiptTransactionSchema.optional(),
    EVMLog: EVMLogTransactionSchema.optional(),
    Solana: SolanaTransactionSchema.optional(),
    UtxoLog: UtxoLogTransactionSchema.optional(),
  })
  .refine(
    (data) => {
      const definedFields = [data.NearReceipt, data.EVMLog, data.Solana, data.UtxoLog].filter(
        (field) => field !== undefined,
      )
      return definedFields.length === 1
    },
    { message: "Exactly one transaction type must be present" },
  )

const TransferMessageSchema = z.object({
  token: z.string(),
  amount: z.string(),
  sender: z.string(),
  recipient: z.string(),
  fee: z.object({
    fee: z.string(),
    native_fee: z.string(),
  }),
  msg: z.string().nullable(),
})

const UtxoTransferSchema = z.object({
  chain: z.string(),
  amount: z.string(),
  recipient: z.string(),
  relayer_fee: z.string(),
  protocol_fee: z.string(),
  relayer_account_id: z.string(),
  sender: z.union([z.string(), z.null()]),
  btc_pending_id: z.string().optional(),
})

const TransferSchema = z.object({
  id: z
    .object({
      origin_chain: ChainSchema,
      kind: z.union([
        z.object({
          Nonce: z.number().int().min(0),
        }),
        z.object({
          Utxo: z.object({
            tx_hash: z.string(),
            vout: z.number().int(),
          }),
        }),
      ]),
    })
    .optional()
    .nullable(),
  initialized: z.union([z.null(), TransactionSchema]),
  signed: z.union([z.null(), TransactionSchema]),
  fast_finalised_on_near: z.union([z.null(), TransactionSchema]),
  finalised_on_near: z.union([z.null(), TransactionSchema]),
  fast_finalised: z.union([z.null(), TransactionSchema]),
  finalised: z.union([z.null(), TransactionSchema]),
  claimed: z.union([z.null(), TransactionSchema]),
  transfer_message: z.union([z.null(), TransferMessageSchema]),
  updated_fee: z.array(TransactionSchema),
  utxo_transfer: z.union([z.null(), UtxoTransferSchema]),
})
export type Transfer = z.infer<typeof TransferSchema>

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

const UtxoDepositAddressResponseSchema = z.object({
  address: z.string(),
})
export type UtxoDepositAddressResponse = z.infer<typeof UtxoDepositAddressResponseSchema>

const TokenDecimalsResponseSchema = z.object({
  decimals: z.number(),
  origin_decimals: z.number(),
})

const BridgedTokenResponseSchema = z.string().nullable()

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

    const data: unknown = await response.json()
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

  /**
   * Get the status of a transfer
   */
  async getTransferStatus(
    options: { originChain: Chain; originNonce: number } | { transactionHash: string },
  ): Promise<TransferStatus[]> {
    const params: Record<string, string | undefined> = {}

    if ("originChain" in options) {
      params["origin_chain"] = options.originChain
      params["origin_nonce"] = options.originNonce.toString()
    } else {
      params["transaction_hash"] = options.transactionHash
    }

    const url = this.buildUrl("/api/v3/transfers/transfer/status", params)
    return this.fetchWithValidation(url, z.array(TransferStatusSchema))
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
  async getTransfer(
    options: { originChain: Chain; originNonce: number } | { transactionHash: string },
  ): Promise<Transfer[]> {
    const params: Record<string, string | undefined> = {}

    if ("originChain" in options) {
      params["origin_chain"] = options.originChain
      params["origin_nonce"] = options.originNonce.toString()
    } else {
      params["transaction_hash"] = options.transactionHash
    }

    const url = this.buildUrl("/api/v3/transfers/transfer", params)
    return this.fetchWithValidation(url, z.array(TransferSchema))
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
    const urlParams: Record<string, string | undefined> = {
      offset: (params.offset ?? 0).toString(),
      limit: (params.limit ?? 10).toString(),
      sender: params.sender,
      transaction_id: params.transactionId,
    }

    const url = this.buildUrl("/api/v3/transfers", urlParams)
    return this.fetchWithValidation(url, z.array(TransferSchema))
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
    postActions?: PostAction[] | null,
    extraMsg?: string | null,
  ): Promise<UtxoDepositAddressResponse> {
    const body: Record<string, unknown> = {
      chain,
      recipient,
    }

    if (postActions !== undefined && postActions !== null) {
      body["post_actions"] = postActions
    }
    if (extraMsg !== undefined && extraMsg !== null) {
      body["extra_msg"] = extraMsg
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
   * Get token decimals from the bridge
   */
  async getTokenDecimals(token: OmniAddress): Promise<TokenDecimals | null> {
    const url = this.buildUrl("/api/v3/token-decimals", { token })
    try {
      return await this.fetchWithValidation(url, TokenDecimalsResponseSchema)
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return null
      }
      throw error
    }
  }

  /**
   * Get the bridged token address on a destination chain
   */
  async getBridgedToken(token: OmniAddress, destChain: Chain): Promise<OmniAddress | null> {
    const url = this.buildUrl("/api/v3/bridged-token", {
      token,
      dest_chain: destChain,
    })
    try {
      const result = await this.fetchWithValidation(url, BridgedTokenResponseSchema)
      return result as OmniAddress | null
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return null
      }
      throw error
    }
  }
}
