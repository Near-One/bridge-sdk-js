import { Buffer } from "node:buffer"
import { sha256 } from "@noble/hashes/sha2.js"
import { hex } from "@scure/base"
import { MerkleTree } from "merkletreejs"
import type { BitcoinMerkleProofResponse, UTXO } from "../types/bitcoin.js"

export interface NormalizedUTXO {
  txid: string
  vout: number
  amount: bigint
  path?: string
  rawTx?: Uint8Array
}

export type FeeCalculator = (inputCount: number, outputCount: number) => bigint

export interface UtxoSelectionOptions {
  feeCalculator: FeeCalculator
  dustThreshold: bigint
  minChange?: bigint | undefined
  maxInputs?: number | undefined
  sort?: "largest-first" | "smallest-first" | undefined
}

export interface UtxoSelectionResult {
  inputs: NormalizedUTXO[]
  totalInput: bigint
  fee: bigint
  change: bigint
  outputs: number
}

export interface LinearFeeParameters {
  base: number
  input: number
  output: number
  rate: number
}

export interface UtxoDepositProof {
  merkle_proof: string[]
  tx_block_blockhash: string
  tx_bytes: number[]
  tx_index: number
  amount: bigint
}

export interface UtxoWithdrawalPlan {
  inputs: string[]
  outputs: { value: number; script_pubkey: string }[]
  fee: bigint
}

export type UtxoPlanOverrides = Partial<
  Omit<UtxoSelectionOptions, "feeCalculator" | "dustThreshold" | "minChange">
> & {
  dustThreshold?: bigint
  minChange?: bigint
}

export interface UtxoChainService {
  buildWithdrawalPlan(
    utxos: UTXO[],
    amount: bigint,
    targetAddress: string,
    changeAddress: string,
    feeRate?: number,
    overrides?: UtxoPlanOverrides,
  ): UtxoWithdrawalPlan
  getDepositProof(txHash: string, vout: number): Promise<UtxoDepositProof>
  getMerkleProof(txHash: string): Promise<BitcoinMerkleProofResponse>
  broadcastTransaction(txHex: string): Promise<string>
}

export function linearFeeCalculator(params: LinearFeeParameters): FeeCalculator {
  const { base, input, output, rate } = params
  if (rate < 0) throw new Error("Fee rate must be positive")
  return (inputCount: number, outputCount: number) => {
    const vbytes = base + inputCount * input + outputCount * output
    const fee = Math.ceil(vbytes * rate)
    return BigInt(fee)
  }
}

export function buildBitcoinMerkleProof(txids: string[], targetTxid: string) {
  const targetIndex = txids.indexOf(targetTxid)
  if (targetIndex === -1) {
    throw new Error("Transaction not found in block")
  }

  const leaves = txids.map((id) => Buffer.from(hex.decode(id)))
  const tree = new MerkleTree(leaves, sha256, { isBitcoinTree: true })
  const targetLeaf = leaves[targetIndex]
  if (!targetLeaf) {
    throw new Error("Target leaf not found")
  }
  const proof = tree.getProof(targetLeaf, targetIndex)

  return {
    index: targetIndex,
    merkle: proof.map((p) => hex.encode(p.data)),
  }
}

export const SIMPLE_UTXO_DEFAULTS: UtxoSelectionOptions = {
  feeCalculator: linearFeeCalculator({ base: 10, input: 68, output: 31, rate: 1 }),
  dustThreshold: 546n,
  minChange: 1000n,
  sort: "largest-first",
}

function compareAmounts(
  a: NormalizedUTXO,
  b: NormalizedUTXO,
  mode: "largest-first" | "smallest-first",
) {
  if (mode === "largest-first") {
    if (a.amount === b.amount) return 0
    return a.amount > b.amount ? -1 : 1
  }
  if (a.amount === b.amount) return 0
  return a.amount < b.amount ? -1 : 1
}

export function selectUtxos(
  utxos: NormalizedUTXO[],
  amount: bigint,
  options: UtxoSelectionOptions,
): UtxoSelectionResult {
  if (amount <= 0) {
    throw new Error("Selection amount must be positive")
  }

  if (!utxos.length) {
    throw new Error("No UTXOs available")
  }

  const sortMode = options.sort ?? "largest-first"
  const sorted = [...utxos].sort((a, b) => compareAmounts(a, b, sortMode))

  const minChange = options.minChange ?? options.dustThreshold
  const selected: NormalizedUTXO[] = []
  let total = 0n

  for (const utxo of sorted) {
    selected.push(utxo)
    total += utxo.amount

    if (options.maxInputs && selected.length > options.maxInputs) {
      throw new Error(`Exceeded maximum input count of ${options.maxInputs}`)
    }

    const attempt = resolveSelection(
      selected,
      total,
      amount,
      options.feeCalculator,
      options.dustThreshold,
      minChange,
    )
    if (attempt) {
      return attempt
    }
  }

  throw new Error("Insufficient funds for requested amount and fees")
}

function resolveSelection(
  inputs: NormalizedUTXO[],
  total: bigint,
  target: bigint,
  feeCalculator: FeeCalculator,
  dustThreshold: bigint,
  minChange: bigint,
): UtxoSelectionResult | undefined {
  const inputCount = inputs.length

  if (inputCount === 0) return undefined

  const withoutChangeFee = feeCalculator(inputCount, 1)
  let change = total - target - withoutChangeFee

  if (change < 0n) {
    return undefined
  }

  if (change === 0n) {
    return {
      inputs: [...inputs],
      totalInput: total,
      fee: withoutChangeFee,
      change: 0n,
      outputs: 1,
    }
  }

  if (change < minChange) {
    // Treat dust as additional fee by omitting change output
    return {
      inputs: [...inputs],
      totalInput: total,
      fee: total - target,
      change: 0n,
      outputs: 1,
    }
  }

  // Recompute with explicit change output
  const withChangeFee = feeCalculator(inputCount, 2)
  change = total - target - withChangeFee

  if (change < 0n) {
    return undefined
  }

  if (change < dustThreshold || change < minChange) {
    // Change would be dust even after reserving change output, fallback to single output scenario
    return {
      inputs: [...inputs],
      totalInput: total,
      fee: total - target,
      change: 0n,
      outputs: 1,
    }
  }

  return {
    inputs: [...inputs],
    totalInput: total,
    fee: withChangeFee,
    change,
    outputs: 2,
  }
}
