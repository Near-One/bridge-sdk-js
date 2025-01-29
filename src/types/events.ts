import type { OmniAddress } from "./common"
import type { TransferMessagePayload } from "./evm"
import type { MPCSignature } from "./mpc"

export interface MetadataPayload {
  decimals: number
  name: string
  prefix: string
  symbol: string
  token: string
}

interface Fee {
  fee: string
  native_fee: string
}

interface TransferMessage {
  origin_nonce: number
  token: OmniAddress
  amount: string
  recipient: OmniAddress
  fee: Fee
  sender: OmniAddress
  msg: string
  destination_nonce: number
}

export interface LogMetadataEvent {
  metadata_payload: MetadataPayload
  signature: MPCSignature
}

export interface InitTransferEvent {
  transfer_message: TransferMessage
}

export interface SignTransferEvent {
  signature: MPCSignature
  message_payload: TransferMessagePayload
}
