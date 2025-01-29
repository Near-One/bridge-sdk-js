import type { MPCSignature } from "./mpc"

export interface MetadataPayload {
  decimals: number
  name: string
  prefix: string
  symbol: string
  token: string
}

export interface LogMetadataEvent {
  metadata_payload: MetadataPayload
  signature: MPCSignature
}
