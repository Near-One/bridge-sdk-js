import type { Nonce, OmniAddress } from "./common.js"

export enum PayloadType {
  TransferMessage = "TransferMessage",
  Metadata = "Metadata",
  ClaimNativeFee = "ClaimNativeFee",
}

export interface TransferId {
  origin_chain: string
  origin_nonce: number
}

// bridge deposit structure for evm chains
export type BridgeDeposit = {
  destination_nonce: Nonce
  origin_chain: number // u8 in rust
  origin_nonce: Nonce
  token_address: string // evm address
  amount: bigint // uint128 in solidity
  recipient: string // evm address
  fee_recipient: string
}

export type TransferMessagePayload = {
  prefix: PayloadType
  destination_nonce: string
  transfer_id: TransferId
  token_address: OmniAddress
  amount: string
  recipient: OmniAddress
  fee_recipient: string | null // NEAR AccountId or null
}

// InitTransfer event from EVM bridge contracts
export interface EvmInitTransferEvent {
  sender: string // EVM address
  tokenAddress: string // EVM address
  originNonce: bigint
  amount: bigint
  fee: bigint
  nativeTokenFee: bigint
  recipient: string // OmniAddress string
  message: string
}
