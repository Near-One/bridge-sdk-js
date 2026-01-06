/**
 * Bitcoin/UTXO-specific types for Omni Bridge
 */

import type { ChainKind } from "@omni-bridge/core"

/**
 * Raw UTXO as received from wallet or external source
 */
export interface UTXO {
  txid: string
  vout: number
  balance: bigint | number | string
  tx_bytes?: Uint8Array | number[]
  path?: string
}

/**
 * Normalized UTXO for internal processing
 */
export interface NormalizedUTXO {
  txid: string
  vout: number
  amount: bigint
  path?: string | undefined
  rawTx?: Uint8Array | undefined
}

/**
 * Fee calculation function type
 */
export type FeeCalculator = (inputCount: number, outputCount: number) => bigint

/**
 * Parameters for linear fee calculation
 */
export interface LinearFeeParameters {
  base: number
  input: number
  output: number
  rate: number
}

/**
 * Options for UTXO selection
 */
export interface UtxoSelectionOptions {
  feeCalculator: FeeCalculator
  dustThreshold: bigint
  minChange?: bigint | undefined
  maxInputs?: number | undefined
  sort?: "largest-first" | "smallest-first" | undefined
}

/**
 * Result of UTXO selection
 */
export interface UtxoSelectionResult {
  inputs: NormalizedUTXO[]
  totalInput: bigint
  fee: bigint
  change: bigint
  outputs: number
}

/**
 * Bitcoin Merkle proof response
 */
export interface BtcMerkleProof {
  block_height: number
  merkle: string[]
  pos: number
}

/**
 * Deposit proof for verifying BTC deposits on NEAR
 */
export interface BtcDepositProof {
  merkle_proof: string[]
  tx_block_blockhash: string
  tx_bytes: number[]
  tx_index: number
  amount: bigint
}

/**
 * Withdrawal plan describing inputs and outputs
 */
export interface BtcWithdrawalPlan {
  inputs: string[]
  outputs: Array<{ value: number; script_pubkey: string }>
  fee: bigint
}

/**
 * Overrides for UTXO plan generation
 */
export type UtxoPlanOverrides = Partial<Omit<UtxoSelectionOptions, "feeCalculator">>

/**
 * RPC client configuration
 */
export interface UtxoRpcConfig {
  url: string
  headers?: Record<string, string> | undefined
  chain: UtxoChainType
}

/**
 * UTXO chain type for RPC configuration
 */
export type UtxoChainType = ChainKind.Btc | ChainKind.Zcash

/**
 * Builder configuration
 */
export interface BtcBuilderConfig {
  network: "mainnet" | "testnet"
  chain?: "btc" | "zcash"
  apiUrl?: string
  rpcUrl?: string
  rpcHeaders?: Record<string, string>
}
