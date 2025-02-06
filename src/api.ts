import { getNetwork } from "./config"
import type { OmniAddress } from "./types"

// Types from OpenAPI spec
export type Chain = "Eth" | "Near" | "Sol" | "Arb" | "Base"

export interface Transaction {
  block_height: number
  block_timestamp_seconds: number
  transaction_hash: string
}

export interface TransactionWrapper {
  NearReceipt?: Transaction
  EVMLog?: Transaction
}

export interface TransferMessage {
  token: string
  amount: number
  sender: string
  recipient: string
  fee: {
    fee: number
    native_fee: number
  }
  msg: string
}

export interface Transfer {
  id: {
    origin_chain: Chain
    origin_nonce: number
  }
  initialized: TransactionWrapper | null
  finalised_on_near: TransactionWrapper | null
  finalised: TransactionWrapper | null
  transfer_message: TransferMessage
  updated_fee: TransactionWrapper[]
}

export interface ApiFeeResponse {
  native_token_fee: number
  transferred_token_fee: number | null
  usd_fee: number
}

export type TransferStatus = "Initialized" | "FinalisedOnNear" | "Finalised"

export class OmniBridgeAPI {
  private baseUrl?: string

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl
  }

  public getBaseUrl(): string {
    if (this.baseUrl) {
      return this.baseUrl
    }
    return getNetwork() === "testnet"
      ? "https://testnet.api.bridge.nearone.org"
      : "https://api.bridge.nearone.org"
  }

  async getTransferStatus(originChain: Chain, originNonce: number): Promise<TransferStatus> {
    const url = new URL(`${this.getBaseUrl()}/api/v1/transfers/transfer/status`)
    url.searchParams.set("origin_chain", originChain)
    url.searchParams.set("origin_nonce", originNonce.toString())

    const response = await fetch(url)

    if (response.status === 404) {
      throw new Error("Transfer not found")
    }

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`)
    }

    const status: TransferStatus = await response.json()
    return status
  }

  async getFee(
    sender: OmniAddress,
    recipient: OmniAddress,
    tokenAddress: string,
  ): Promise<ApiFeeResponse> {
    const url = new URL(`${this.getBaseUrl()}/api/v1/transfer-fee`)
    url.searchParams.set("sender", sender)
    url.searchParams.set("recipient", recipient)
    url.searchParams.set("token", tokenAddress)

    console.log(url.toString())

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`)
    }

    return await response.json()
  }

  async getTransfer(originChain: Chain, originNonce: number): Promise<Transfer> {
    const url = new URL(`${this.getBaseUrl()}/api/v1/transfers/transfer`)
    url.searchParams.set("origin_chain", originChain)
    url.searchParams.set("origin_nonce", originNonce.toString())

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`)
    }

    return await response.json()
  }

  async findOmniTransfers(sender: OmniAddress, offset: number, limit: number): Promise<Transfer[]> {
    const url = new URL(`${this.getBaseUrl()}/api/v1/transfers`)
    url.searchParams.set("sender", sender)
    url.searchParams.set("offset", offset.toString())
    url.searchParams.set("limit", limit.toString())

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`)
    }

    return await response.json()
  }
}
