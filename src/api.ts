import { z } from "zod"
import { getNetwork } from "./config"
import type { OmniAddress } from "./types"

const ChainSchema = z.enum(["Eth", "Near", "Sol", "Arb", "Base"])
export type Chain = z.infer<typeof ChainSchema>

const TransactionSchema = z.object({
  block_height: z.number().int().min(0),
  block_timestamp_seconds: z.number().int().min(0),
  transaction_hash: z.string(),
})

const SolanaTransactionSchema = z.object({
  slot: z.number().int().min(0),
  block_timestamp_seconds: z.number().int().min(0),
  signature: z.string(),
})

const TransactionWrapperSchema = z.object({
  NearReceipt: TransactionSchema.optional(),
  EVMLog: TransactionSchema.optional(),
  Solana: SolanaTransactionSchema.optional(),
})

const TransferMessageSchema = z.object({
  token: z.string(),
  amount: z.number().int().min(0),
  sender: z.string(),
  recipient: z.string(),
  fee: z.object({
    fee: z.coerce.bigint().min(0n),
    native_fee: z.coerce.bigint().min(0n),
  }),
  msg: z.string(),
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
  initialized: TransactionWrapperSchema.nullable(),
  finalised_on_near: TransactionWrapperSchema.nullable(),
  finalised: TransactionWrapperSchema.nullable(),
  transfer_message: TransferMessageSchema,
  updated_fee: z.array(TransactionWrapperSchema),
})

const ApiFeeResponseSchema = z.object({
  native_token_fee: z.coerce.bigint().min(0n).nullable(),
  transferred_token_fee: z.coerce.bigint().min(0n).nullable(),
  usd_fee: z.number(),
})

const TransferStatusSchema = z.enum(["Initialized", "FinalisedOnNear", "Finalised"])

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
      : "https://api.bridge.nearone.org"
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
    const url = this.buildUrl("/api/v1/transfers/transfer/", {
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

    const url = this.buildUrl("/api/v1/transfers/", urlParams)
    return this.fetchWithValidation(url, z.array(TransferSchema))
  }
}
