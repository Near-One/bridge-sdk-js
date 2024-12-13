import { BorshSchema, borshSerialize } from "borsher"
import type { AccountId } from "./common"
import type { ChainKind } from "./chain"

export const ChainKindSchema = BorshSchema.Enum({
  Eth: BorshSchema.Unit,
  Near: BorshSchema.Unit,
  Sol: BorshSchema.Unit,
  Arb: BorshSchema.Unit,
  Base: BorshSchema.Unit,
})

// StorageDepositAction type
export type StorageDepositAction = {
  token_id: AccountId
  account_id: AccountId
  storage_deposit_amount: bigint | null
}

export const StorageDepositActionSchema = BorshSchema.Struct({
  token_id: BorshSchema.String,
  account_id: BorshSchema.String,
  storage_deposit_amount: BorshSchema.Option(BorshSchema.u128),
})

// FinTransferArgs type
export type FinTransferArgs = {
  chain_kind: ChainKind
  storage_deposit_actions: StorageDepositAction[]
  prover_args: Uint8Array
}

export const FinTransferArgsSchema = BorshSchema.Struct({
  chain_kind: ChainKindSchema,
  storage_deposit_actions: BorshSchema.Vec(StorageDepositActionSchema),
  prover_args: BorshSchema.Vec(BorshSchema.u8),
})

// ClaimFeeArgs type
export type ClaimFeeArgs = {
  chain_kind: ChainKind
  prover_args: Uint8Array
}

export const ClaimFeeArgsSchema = BorshSchema.Struct({
  chain_kind: ChainKindSchema,
  prover_args: BorshSchema.Vec(BorshSchema.u8),
})

// BindTokenArgs type
export type BindTokenArgs = {
  chain_kind: ChainKind
  prover_args: Uint8Array
}

export const BindTokenArgsSchema = BorshSchema.Struct({
  chain_kind: ChainKindSchema,
  prover_args: BorshSchema.Vec(BorshSchema.u8),
})

export type LogMetadataArgs = {
  token_id: string
}
export const LogMetadataArgsSchema = BorshSchema.Struct({
  token_id: BorshSchema.String,
})

// DeployTokenArgs type
export type DeployTokenArgs = {
  chain_kind: ChainKind
  prover_args: Uint8Array
}

export const DeployTokenArgsSchema = BorshSchema.Struct({
  chain_kind: ChainKindSchema,
  prover_args: BorshSchema.Vec(BorshSchema.u8),
})

// Serialization helper functions
export const serializeStorageDepositAction = (action: StorageDepositAction): Uint8Array => {
  return borshSerialize(StorageDepositActionSchema, action)
}

export const serializeFinTransferArgs = (args: FinTransferArgs): Uint8Array => {
  return borshSerialize(FinTransferArgsSchema, args)
}

export const serializeClaimFeeArgs = (args: ClaimFeeArgs): Uint8Array => {
  return borshSerialize(ClaimFeeArgsSchema, args)
}

export const serializeBindTokenArgs = (args: BindTokenArgs): Uint8Array => {
  return borshSerialize(BindTokenArgsSchema, args)
}

export const serializeDeployTokenArgs = (args: DeployTokenArgs): Uint8Array => {
  return borshSerialize(DeployTokenArgsSchema, args)
}
