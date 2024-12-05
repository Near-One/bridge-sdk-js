export enum Chain {
  Ethereum = "eth",
  Near = "near",
  Solana = "sol",
  Arbitrum = "arb",
  Base = "base",
}

export type OmniAddress = `${Chain}:${string}`

export enum Status {
  Pending = 0,
  Completed = 1,
  Failed = 2,
}

export interface TransferMessage {
  tokenAddress: OmniAddress
  amount: bigint
  fee: bigint
  nativeFee: bigint
  recipient: OmniAddress
  message: string | null
}

export interface OmniTransfer {
  txId: string
  nonce: bigint
  transferMessage: TransferMessage
}

export interface Fee {
  fee: bigint
  nativeFee: bigint
}
