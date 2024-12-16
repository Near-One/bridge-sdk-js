import type { ChainKind } from "./chain"
import type { OmniAddress } from "./common"
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
  tokenAddress: OmniAddress
  amount: bigint
  fee: bigint
  nativeFee: bigint
  recipient: OmniAddress
  message: string | null
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
