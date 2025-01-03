import type { ChainKind } from "./chain"
import type { Nonce, OmniAddress, U128 } from "./common"

export enum PayloadType {
  TransferMessage = "TransferMessage",
  Metadata = "Metadata",
  ClaimNativeFee = "ClaimNativeFee",
}

export interface TransferId {
  origin_chain: ChainKind
  origin_nonce: Nonce
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
  destination_nonce: Nonce
  transfer_id: TransferId
  token_address: OmniAddress
  amount: U128
  recipient: OmniAddress
  fee_recipient: string | null // NEAR AccountId or null
}
