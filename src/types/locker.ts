import { b } from "@zorsh/zorsh"
import { ChainKindSchema } from "./chain"
import type { AccountId } from "./common"
import type { TransferId } from "./evm"

export const StorageDepositActionSchema = b.struct({
  token_id: b.string(),
  account_id: b.string(),
  storage_deposit_amount: b.option(b.u128()),
})
export type StorageDepositAction = b.infer<typeof StorageDepositActionSchema>

export const FinTransferArgsSchema = b.struct({
  chain_kind: ChainKindSchema,
  storage_deposit_actions: b.vec(StorageDepositActionSchema),
  prover_args: b.vec(b.u8()),
})
export type FinTransferArgs = b.infer<typeof FinTransferArgsSchema>

export type SignTransferArgs = {
  transfer_id: TransferId
  fee_recipient: AccountId
  fee: {
    fee: string
    native_fee: string
  }
}

export const ClaimFeeArgsSchema = b.struct({
  chain_kind: ChainKindSchema,
  prover_args: b.vec(b.u8()),
})
export type ClaimFeeArgs = b.infer<typeof ClaimFeeArgsSchema>

export const BindTokenArgsSchema = b.struct({
  chain_kind: ChainKindSchema,
  prover_args: b.vec(b.u8()),
})
export type BindTokenArgs = b.infer<typeof BindTokenArgsSchema>

export const LogMetadataArgsSchema = b.struct({
  token_id: b.string(),
})
export type LogMetadataArgs = b.infer<typeof LogMetadataArgsSchema>

export const DeployTokenArgsSchema = b.struct({
  chain_kind: ChainKindSchema,
  prover_args: b.vec(b.u8()),
})

export type DeployTokenArgs = b.infer<typeof DeployTokenArgsSchema>
