import { b } from "@zorsh/zorsh"
import type { AccountId, Fee, Nonce, OmniAddress, U128 } from "./common"

export enum ProofKind {
  InitTransfer = 0,
  FinTransfer = 1,
  DeployToken = 2,
  LogMetadata = 3,
}

export const ProofKindSchema = b.nativeEnum(ProofKind)

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

export const InitTransferMessageSchema = b.struct({
  origin_nonce: b.u64(),
  token: b.string(),
  amount: b.u128(),
  recipient: b.string(),
  fee: b.u128(),
  sender: b.string(),
  msg: b.string(),
  emitter_address: b.string(),
})

export type FinTransferMessage = {
  transfer_id: string
  fee_recipient: AccountId
  amount: U128
  emitter_address: OmniAddress
}

export const FinTransferMessageSchema = b.struct({
  transfer_id: b.string(),
  fee_recipient: b.string(),
  amount: b.u128(),
  emitter_address: b.string(),
})

export type DeployTokenMessage = {
  token: AccountId
  token_address: OmniAddress
  emitter_address: OmniAddress
}

export const DeployTokenMessageSchema = b.struct({
  token: b.string(),
  token_address: b.string(),
  emitter_address: b.string(),
})

export type LogMetadataMessage = {
  token_address: OmniAddress
  name: string
  symbol: string
  decimals: number
  emitter_address: OmniAddress
}

export const LogMetadataMessageSchema = b.struct({
  token_address: b.string(),
  name: b.string(),
  symbol: b.string(),
  decimals: b.u8(),
  emitter_address: b.string(),
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

export const ProverResultSchema = b.enum({
  InitTransfer: InitTransferMessageSchema,
  FinTransfer: FinTransferMessageSchema,
  DeployToken: DeployTokenMessageSchema,
  LogMetadata: LogMetadataMessageSchema,
})

export const EvmProofSchema = b.struct({
  log_index: b.u64(),
  log_entry_data: b.vec(b.u8()),
  receipt_index: b.u64(),
  receipt_data: b.vec(b.u8()),
  header_data: b.vec(b.u8()),
  proof: b.vec(b.vec(b.u8())),
})
export type EvmProof = b.infer<typeof EvmProofSchema>

export const EvmVerifyProofArgsSchema = b.struct({
  proof_kind: ProofKindSchema,
  proof: EvmProofSchema,
})
export type EvmVerifyProofArgs = b.infer<typeof EvmVerifyProofArgsSchema>

export const WormholeVerifyProofArgsSchema = b.struct({
  proof_kind: ProofKindSchema,
  vaa: b.string(),
})
export type WormholeVerifyProofArgs = b.infer<typeof WormholeVerifyProofArgsSchema>
