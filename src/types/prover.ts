import { BorshSchema } from "borsher"
import type { AccountId, Fee, Nonce, OmniAddress, TransferId, U128 } from "./common"

export enum ProofKind {
  InitTransfer = 0,
  FinTransfer = 1,
  DeployToken = 2,
  LogMetadata = 3,
}

export const ProofKindSchema = BorshSchema.Enum({
  InitTransfer: BorshSchema.Unit,
  FinTransfer: BorshSchema.Unit,
  DeployToken: BorshSchema.Unit,
  LogMetadata: BorshSchema.Unit,
})

export type InitTransferMessage = {
  origin_nonce: Nonce
  token: OmniAddress
  amount: U128
  recipient: OmniAddress
  fee: Fee
  sender: OmniAddress
  msg: string
  emitter_address: OmniAddress
}

export const InitTransferMessageSchema = BorshSchema.Struct({
  origin_nonce: BorshSchema.u64,
  token: BorshSchema.String,
  amount: BorshSchema.u128,
  recipient: BorshSchema.String,
  fee: BorshSchema.u128,
  sender: BorshSchema.String,
  msg: BorshSchema.String,
  emitter_address: BorshSchema.String,
})

export type FinTransferMessage = {
  transfer_id: TransferId
  fee_recipient: AccountId
  amount: U128
  emitter_address: OmniAddress
}

export const FinTransferMessageSchema = BorshSchema.Struct({
  transfer_id: BorshSchema.String,
  fee_recipient: BorshSchema.String,
  amount: BorshSchema.u128,
  emitter_address: BorshSchema.String,
})

export type DeployTokenMessage = {
  token: AccountId
  token_address: OmniAddress
  emitter_address: OmniAddress
}

export const DeployTokenMessageSchema = BorshSchema.Struct({
  token: BorshSchema.String,
  token_address: BorshSchema.String,
  emitter_address: BorshSchema.String,
})

export type LogMetadataMessage = {
  token_address: OmniAddress
  name: string
  symbol: string
  decimals: number
  emitter_address: OmniAddress
}

export const LogMetadataMessageSchema = BorshSchema.Struct({
  token_address: BorshSchema.String,
  name: BorshSchema.String,
  symbol: BorshSchema.String,
  decimals: BorshSchema.u8,
  emitter_address: BorshSchema.String,
})

export type ProverResult =
  | { InitTransfer: InitTransferMessage }
  | { FinTransfer: FinTransferMessage }
  | { DeployToken: DeployTokenMessage }
  | { LogMetadata: LogMetadataMessage }

export type InitTransferResult = Extract<ProverResult, { InitTransfer: InitTransferMessage }>
export type FinTransferResult = Extract<ProverResult, { FinTransfer: FinTransferMessage }>
export type DeployTokenResult = Extract<ProverResult, { DeployToken: DeployTokenMessage }>
export type LogMetadataResult = Extract<ProverResult, { LogMetadata: LogMetadataMessage }>

export const ProverResultSchema = BorshSchema.Enum({
  InitTransfer: InitTransferMessageSchema,
  FinTransfer: FinTransferMessageSchema,
  DeployToken: DeployTokenMessageSchema,
  LogMetadata: LogMetadataMessageSchema,
})

export type EvmProof = {
  log_index: bigint
  log_entry_data: Uint8Array
  receipt_index: bigint
  receipt_data: Uint8Array
  header_data: Uint8Array
  proof: Uint8Array[]
}

export const EvmProofSchema = BorshSchema.Struct({
  log_index: BorshSchema.u64,
  log_entry_data: BorshSchema.Vec(BorshSchema.u8),
  receipt_index: BorshSchema.u64,
  receipt_data: BorshSchema.Vec(BorshSchema.u8),
  header_data: BorshSchema.Vec(BorshSchema.u8),
  proof: BorshSchema.Vec(BorshSchema.Vec(BorshSchema.u8)),
})

export type EvmVerifyProofArgs = {
  proof_kind: ProofKind
  proof: EvmProof
}
export const EvmVerifyProofArgsSchema = BorshSchema.Struct({
  proof_kind: ProofKindSchema,
  proof: EvmProofSchema, // assuming EvmProofSchema is defined as before
})

export type WormholeVerifyProofArgs = {
  proof_kind: ProofKind
  vaa: string
}
export const WormholeVerifyProofArgsSchema = BorshSchema.Struct({
  proof_kind: ProofKindSchema,
  vaa: BorshSchema.String,
})
