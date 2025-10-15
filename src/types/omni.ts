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
/**
 * UTXO-specific transfer options (for BTC/Zcash chains)
 */
export interface UtxoTransferOptions {
  gasFee?: bigint
  maxFee?: bigint
}

export interface OmniTransferMessage {
  tokenAddress: OmniAddress
  amount: bigint
  fee: bigint
  nativeFee: bigint
  recipient: OmniAddress
  message?: string
  // Chain-specific options (e.g., UtxoTransferOptions for Bitcoin/Zcash)
  options?: UtxoTransferOptions
}

export interface TokenMetadata {
  token: string
  name: string
  symbol: string
  decimals: number
}
