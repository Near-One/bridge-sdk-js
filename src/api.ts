import { z } from "zod"
import { getNetwork } from "./config.js"
import type { OmniAddress } from "./types/index.js"

const ChainSchema = z.enum(["Eth", "Near", "Sol", "Arb", "Base", "Bnb"])
export type Chain = z.infer<typeof ChainSchema>

// Custom transformer for safe BigInt coercion that handles scientific notation
const safeBigInt = (nullable = false) => {
  const transformer = z.preprocess(
    (val) => {
      if (val === null && nullable) return null

      try {
        // If it's a number, convert to string without scientific notation
        if (typeof val === "number") {
          return BigInt(val.toLocaleString("fullwide", { useGrouping: false }))
        }

        // If it's a string, try direct conversion first
        if (typeof val === "string") {
          try {
            // Try direct BigInt conversion first (handles numeric strings)
            return BigInt(val)
          } catch {
            // If direct conversion fails, it might be scientific notation
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

  return transformer
}

// Updated based on OpenAPI spec
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

// Updated to make all fields optional since we saw an empty Solana object in the example
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

// Update to match the Transaction schema in OpenAPI spec - one of these fields will be present
const TransactionSchema = z
  .object({
    NearReceipt: NearReceiptTransactionSchema.optional(),
    EVMLog: EVMLogTransactionSchema.optional(),
    Solana: SolanaTransactionSchema.optional(),
    UtxoLog: UtxoLogTransactionSchema.optional(),
  })
  .refine(
    (data) => {
      // Ensure exactly one of the fields is defined
      const definedFields = [data.NearReceipt, data.EVMLog, data.Solana, data.UtxoLog].filter(
        (field) => field !== undefined,
      )
      return definedFields.length === 1
    },
    { message: "Exactly one transaction type must be present" },
  )

const TransferMessageSchema = z.object({
  token: z.string(),
  amount: safeBigInt(),
  sender: z.string(),
  recipient: z.string(),
  fee: z.object({
    fee: safeBigInt(),
    native_fee: safeBigInt(),
  }),
  msg: z.string().nullable(),
})

const TransfersQuerySchema = z
  .object({
    sender: z.string().optional(),
    transaction_id: z.string().optional(),
    offset: z.number().default(0),
    limit: z.number().default(10),
  })
  .refine((data) => data.sender || data.transaction_id, {
    message: "Either sender or transactionId must be provided",
  })
export type TransfersQuery = Partial<z.input<typeof TransfersQuerySchema>>

const UtxoTransferSchema = z.object({
  amount: z.string(),
  recipient: z.string(),
  relayer_fee: z.string(),
  protocol_fee: z.string(),
  relayer_account_id: z.string(),
  sender: z.string().nullable(),
})

const TransferSchema = z.object({
  id: z
    .object({
      origin_chain: ChainSchema,
      origin_nonce: z.number().int().min(0),
    })
    .optional(),
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

const ApiFeeResponseSchema = z.object({
  native_token_fee: safeBigInt(true),
  transferred_token_fee: safeBigInt(true).nullable(),
  usd_fee: z.number(),
})

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

const BtcDepositAddressResponseSchema = z.object({
  address: z.string(),
})

const TransferStatusSchema = z.enum([
  "Initialized",
  "Signed",
  "FastFinalisedOnNear",
  "FinalisedOnNear",
  "FastFinalised",
  "Finalised",
  "Claimed",
])

// V2 API returns status information in this format (assuming same as v1 but in array)
const GetStatusResponseV2Schema = TransferStatusSchema

export type Transfer = z.infer<typeof TransferSchema>
export type ApiFeeResponse = z.infer<typeof ApiFeeResponseSchema>
export type TransferStatus = z.infer<typeof TransferStatusSchema>
export type PostAction = z.infer<typeof PostActionSchema>
export type BtcDepositAddressResponse = z.infer<typeof BtcDepositAddressResponseSchema>

interface ApiClientConfig {
  baseUrl?: string
}

class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public statusText?: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export class OmniBridgeAPI {
  private readonly baseUrl: string

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? this.getDefaultBaseUrl()
  }

  public getDefaultBaseUrl(): string {
    return getNetwork() === "testnet"
      ? "https://testnet.api.bridge.nearone.org"
      : "https://mainnet.api.bridge.nearone.org"
  }

  private async fetchWithValidation<T extends z.ZodType>(url: URL, schema: T): Promise<z.infer<T>> {
    const response = await fetch(url)

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

  private buildUrl(path: string, params: Record<string, string> = {}): URL {
    const url = new URL(`${this.baseUrl}${path}`)
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
    return url
  }

  async getTransferStatus(
    options: { originChain: Chain; originNonce: number } | { transactionHash: string },
  ): Promise<TransferStatus[]> {
    const params: Record<string, string> = {}

    if ("originChain" in options) {
      params.origin_chain = options.originChain
      params.origin_nonce = options.originNonce.toString()
    } else {
      params.transaction_hash = options.transactionHash
    }

    const url = this.buildUrl("/api/v2/transfers/transfer/status", params)
    return this.fetchWithValidation(url, z.array(GetStatusResponseV2Schema))
  }

  async getFee(
    sender: OmniAddress,
    recipient: OmniAddress,
    tokenAddress: OmniAddress,
  ): Promise<ApiFeeResponse> {
    const url = this.buildUrl("/api/v2/transfer-fee", {
      sender,
      recipient,
      token: tokenAddress,
    })
    return this.fetchWithValidation(url, ApiFeeResponseSchema)
  }

  async getTransfer(
    options: { originChain: Chain; originNonce: number } | { transactionHash: string },
  ): Promise<Transfer[]> {
    const params: Record<string, string> = {}

    if ("originChain" in options) {
      params.origin_chain = options.originChain
      params.origin_nonce = options.originNonce.toString()
    } else {
      params.transaction_hash = options.transactionHash
    }

    const url = this.buildUrl("/api/v2/transfers/transfer", params)
    return this.fetchWithValidation(url, z.array(TransferSchema))
  }

  async findOmniTransfers(query: TransfersQuery): Promise<Transfer[]> {
    const params = TransfersQuerySchema.parse(query)

    const urlParams: Record<string, string> = {
      offset: params.offset.toString(),
      limit: params.limit.toString(),
    }

    if (params.sender) urlParams.sender = params.sender
    if (params.transaction_id) urlParams.transaction_id = params.transaction_id

    const url = this.buildUrl("/api/v2/transfers", urlParams)
    return this.fetchWithValidation(url, z.array(TransferSchema))
  }

  async getAllowlistedTokens(): Promise<Record<string, OmniAddress>> {
    const url = this.buildUrl("/api/v2/transfer-fee/allowlisted-tokens")
    const response = await this.fetchWithValidation(url, AllowlistedTokensResponseSchema)
    return response.allowlisted_tokens as Record<string, OmniAddress>
  }

  async getBtcUserDepositAddress(
    recipient: string,
    postActions?: PostAction[] | null,
    extraMsg?: string | null,
  ): Promise<BtcDepositAddressResponse> {
    const params: Record<string, string> = {
      recipient,
    }

    if (postActions !== undefined && postActions !== null) {
      params.post_actions = JSON.stringify(postActions)
    }
    if (extraMsg !== undefined && extraMsg !== null) {
      params.extra_msg = extraMsg
    }

    const url = this.buildUrl("/api/v2/btc/get_user_deposit_address", params)
    return this.fetchWithValidation(url, BtcDepositAddressResponseSchema)
  }
}
