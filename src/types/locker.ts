import { BorshSchema, type Unit, borshSerialize } from "borsher"

// Basic type aliases
export type AccountId = string
export type U128 = bigint

export type ChainKind =
  | { Eth: Unit }
  | { Near: Unit }
  | { Sol: Unit }
  | { Arb: Unit }
  | { Base: Unit }

export const ChainKind = {
  Eth: { Eth: {} } as ChainKind,
  Near: { Near: {} } as ChainKind,
  Sol: { Sol: {} } as ChainKind,
  Arb: { Arb: {} } as ChainKind,
  Base: { Base: {} } as ChainKind,
} as const

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
