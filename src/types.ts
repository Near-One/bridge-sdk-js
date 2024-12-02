import type { BigNumberish } from "ethers"

export enum ChainKind {
  Eth = 0,
  Near = 1,
  Sol = 2,
  Arb = 3,
  Base = 4,
}

export enum Status {
  Pending = 0,
  Completed = 1,
  Failed = 2,
}

export interface OmniAddress {
  chain: ChainKind
  address: string
}

export interface TransferMessage {
  tokenAddress: OmniAddress
  amount: BigNumberish
  fee: BigNumberish
  nativeFee: BigNumberish
  recipient: OmniAddress
  message: string | null
}

export interface OmniTransfer {
  txId: string
  nonce: BigNumberish
  transferMessage: TransferMessage
}

export interface Fee {
  fee: BigNumberish
  nativeFee: BigNumberish
}
