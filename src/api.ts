// api.ts
import { type ChainKind, type Fee, type OmniAddress, Status } from "./types"

export interface ApiTransferResponse {
  id: {
    origin_chain: "Eth" | "Near" | "Sol" | "Arb" | "Base"
    origin_nonce: number
  }
  status: "Initialized" | "FinalisedOnNear" | "Finalised"
  token: string
  amount: number
  recipient: string
  sender: string
  fee: {
    fee: number
    native_fee: number
  }
  msg: string
}

export interface ApiFeeResponse {
  native_token_fee: number
  transferred_token_fee: number | null
  usd_fee: number
}

export class OmniBridgeAPI {
  private baseUrl: string

  constructor(network: "testnet" | "mainnet") {
    this.baseUrl =
      network === "testnet"
        ? "https://testnet.api.bridge.nearone.org"
        : "https://api.bridge.nearone.org"
  }

  public getBaseUrl(): string {
    return this.baseUrl
  }

  async getTransferStatus(originChain: Chain, nonce: bigint): Promise<Status> {
    const params = new URLSearchParams({
      origin_chain: originChain,
      origin_nonce: nonce.toString(),
    })

    const response = await fetch(`${this.baseUrl}/api/v1/transfer?${params}`)
    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`)
    }

    const data: ApiTransferResponse = await response.json()

    switch (data.status) {
      case "Initialized":
        return Status.Pending
      case "FinalisedOnNear":
      case "Finalised":
        return Status.Completed
      default:
        return Status.Failed
    }
  }

  async getFee(sender: OmniAddress, recipient: OmniAddress, tokenAddress: string): Promise<Fee> {
    const params = new URLSearchParams({
      sender: sender,
      recipient: recipient,
      token: tokenAddress,
    })

    const response = await fetch(`${this.baseUrl}/api/v1/transfer-fee?${params}`)
    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`)
    }

    const data: ApiFeeResponse = await response.json()

    return {
      fee: data.transferred_token_fee ? BigInt(data.transferred_token_fee) : BigInt(0),
      nativeFee: BigInt(data.native_token_fee),
    }
  }
}
