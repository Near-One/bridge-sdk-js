import type { ChainKind } from "./chain.js"
import type { OmniAddress } from "./common.js"
import type { ProofKind } from "./prover.js"

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
  message?: string
  // For UTXO chains (BTC/Zcash), fee can be split into gas_fee + protocol_fee
  gasFee?: bigint
  protocolFee?: bigint
}

export interface TokenMetadata {
  token: string
  name: string
  symbol: string
  decimals: number
}
