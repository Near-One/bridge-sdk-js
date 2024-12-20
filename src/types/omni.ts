import type { ChainKind } from "./chain"
import type { AccountId, OmniAddress, U128 } from "./common"
import type { ProofKind } from "./prover"

export type TokenDeployment = {
  id: string
  tokenAddress: OmniAddress
  sourceChain: ChainKind
  destinationChain: ChainKind
  status: "pending" | "ready_for_finalize" | "finalized" | "ready_for_bind" | "completed"
  proof?: {
    proof_kind: ProofKind
    vaa: string
  }
  metadata?: {
    nearAddress: string
    tokenAddress: OmniAddress
    emitterAddress: OmniAddress
  }
  deploymentTx?: string
  bindTx?: string
}

export interface TransferMessage {
  receiver_id: AccountId
  memo: string | null
  amount: U128
  msg: string | null
}

export interface InitTransferMessage {
  recipient: OmniAddress
  fee: U128
  native_token_fee: U128
}

export interface OmniTransferResult {
  nonce: bigint
  txId: string
}
export interface OmniTransferMessage {
  tokenAddress: OmniAddress
  amount: bigint
  fee: bigint
  nativeFee: bigint
  recipient: OmniAddress
}
export interface OmniTransfer {
  txId: string
  nonce: bigint
  transferMessage: TransferMessage
}

export enum Status {
  Pending = 0,
  Completed = 1,
  Failed = 2,
}

export interface TokenMetadata {
  token: string
  name: string
  symbol: string
  decimals: number
}
