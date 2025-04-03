import { z } from "zod"
import { getNetwork } from "./config"
import type { OmniAddress } from "./types"

const ChainSchema = z.enum(["Eth", "Near", "Sol", "Arb", "Base"])
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

// Update to match the Transaction schema in OpenAPI spec - one of these fields will be present
const TransactionSchema = z
  .object({
    NearReceipt: NearReceiptTransactionSchema.optional(),
    EVMLog: EVMLogTransactionSchema.optional(),
    Solana: SolanaTransactionSchema.optional(),
  })
  .refine(
    (data) => {
      // Ensure exactly one of the fields is defined
      const definedFields = [data.NearReceipt, data.EVMLog, data.Solana].filter(
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

const TransferSchema = z.object({
  id: z.object({
    origin_chain: ChainSchema,
    origin_nonce: z.number().int().min(0),
  }),
  initialized: z.union([z.null(), TransactionSchema]),
  signed: z.union([z.null(), TransactionSchema]),
  finalised_on_near: z.union([z.null(), TransactionSchema]),
  finalised: z.union([z.null(), TransactionSchema]),
  claimed: z.union([z.null(), TransactionSchema]),
  transfer_message: TransferMessageSchema,
  updated_fee: z.array(TransactionSchema),
})

const ApiFeeResponseSchema = z.object({
  native_token_fee: safeBigInt(true),
  transferred_token_fee: safeBigInt(true).nullable(),
  usd_fee: z.number(),
})

const TransferStatusSchema = z.enum([
  "Initialized",
  "Signed",
  "FinalisedOnNear",
  "Finalised",
  "Claimed",
])

export type Transfer = z.infer<typeof TransferSchema>
export type ApiFeeResponse = z.infer<typeof ApiFeeResponseSchema>
export type TransferStatus = z.infer<typeof TransferStatusSchema>

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
      throw new ApiError("Resource not found", response.status, response.statusText)
    }

    if (!response.ok) {
      throw new ApiError("API request failed", response.status, response.statusText)
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

  async getTransferStatus(originChain: Chain, originNonce: number): Promise<TransferStatus> {
    const url = this.buildUrl("/api/v1/transfers/transfer/status", {
      origin_chain: originChain,
      origin_nonce: originNonce.toString(),
    })
    return this.fetchWithValidation(url, TransferStatusSchema)
  }

  async getFee(
    sender: OmniAddress,
    recipient: OmniAddress,
    tokenAddress: OmniAddress,
  ): Promise<ApiFeeResponse> {
    const url = this.buildUrl("/api/v1/transfer-fee", {
      sender,
      recipient,
      token: tokenAddress,
    })
    return this.fetchWithValidation(url, ApiFeeResponseSchema)
  }

  async getTransfer(originChain: Chain, originNonce: number): Promise<Transfer> {
    const url = this.buildUrl("/api/v1/transfers/transfer", {
      // Removed trailing slash
      origin_chain: originChain,
      origin_nonce: originNonce.toString(),
    })
    return this.fetchWithValidation(url, TransferSchema)
  }

  async findOmniTransfers(query: TransfersQuery): Promise<Transfer[]> {
    const params = TransfersQuerySchema.parse(query)

    const urlParams: Record<string, string> = {
      offset: params.offset.toString(),
      limit: params.limit.toString(),
    }

    if (params.sender) urlParams.sender = params.sender
    if (params.transaction_id) urlParams.transaction_id = params.transaction_id

    const url = this.buildUrl("/api/v1/transfers", urlParams)
    return this.fetchWithValidation(url, z.array(TransferSchema))
  }
}
