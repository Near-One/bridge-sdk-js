import type { Nonce, OmniAddress } from "./common.js"

export enum PayloadType {
  TransferMessage = "TransferMessage",
  Metadata = "Metadata",
  ClaimNativeFee = "ClaimNativeFee",
}

export interface TransferId {
  origin_chain: number | string // u8 in rust
  origin_nonce: bigint
}

// bridge deposit structure for evm chains
export type BridgeDeposit = {
  destinationNonce: Nonce
  originChain: number // u8 in rust
  originNonce: Nonce
  tokenAddress: string // evm address
  amount: bigint // uint128 in solidity
  recipient: string // evm address
  feeRecipient: string
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
