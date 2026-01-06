/**
 * Bitcoin transaction builder for Omni Bridge
 */

import { ChainKind } from "@omni-bridge/core"
import { hex } from "@scure/base"
import * as btc from "@scure/btc-signer"
import { UtxoRpcClient } from "./rpc.js"
import type {
  BtcBuilderConfig,
  BtcDepositProof,
  BtcMerkleProof,
  BtcWithdrawalPlan,
  FeeCalculator,
  LinearFeeParameters,
  NormalizedUTXO,
  UTXO,
  UtxoPlanOverrides,
  UtxoSelectionOptions,
  UtxoSelectionResult,
} from "./types.js"

/**
 * Default API URLs for Bitcoin networks
 */
const DEFAULT_API_URLS = {
  mainnet: "https://blockstream.info/api",
  testnet: "https://blockstream.info/testnet/api",
} as const

/**
 * Default RPC URLs for Bitcoin networks
 */
const DEFAULT_RPC_URLS = {
  mainnet: "https://bitcoin-rpc.publicnode.com",
  testnet: "https://bitcoin-testnet-rpc.publicnode.com",
} as const

/**
 * Default UTXO selection options
 */
const DEFAULT_UTXO_OPTIONS: UtxoSelectionOptions = {
  feeCalculator: linearFeeCalculator({ base: 10, input: 68, output: 31, rate: 1 }),
  dustThreshold: 546n,
  minChange: 1000n,
  sort: "largest-first",
}

/**
 * Create a linear fee calculator based on transaction size
 */
export function linearFeeCalculator(params: LinearFeeParameters): FeeCalculator {
  const { base, input, output, rate } = params
  if (rate < 0) throw new Error("Fee rate must be positive")
  return (inputCount: number, outputCount: number) => {
    const vbytes = base + inputCount * input + outputCount * output
    const fee = Math.ceil(vbytes * rate)
    return BigInt(fee)
  }
}

/**
 * Bitcoin transaction builder interface
 */
export interface BtcBuilder {
  /**
   * Build a withdrawal plan from UTXOs
   */
  buildWithdrawalPlan(
    utxos: UTXO[],
    amount: bigint,
    targetAddress: string,
    changeAddress: string,
    feeRate?: number,
    overrides?: UtxoPlanOverrides,
  ): BtcWithdrawalPlan

  /**
   * Get deposit proof for verifying a BTC deposit
   */
  getDepositProof(txHash: string, vout: number): Promise<BtcDepositProof>

  /**
   * Get Merkle proof for a transaction
   */
  getMerkleProof(txHash: string): Promise<BtcMerkleProof>

  /**
   * Select UTXOs for a target amount
   */
  selectUtxos(
    utxos: NormalizedUTXO[],
    amount: bigint,
    options?: Partial<UtxoSelectionOptions>,
  ): UtxoSelectionResult

  /**
   * Convert an address to its script_pubkey
   */
  addressToScriptPubkey(address: string): string

  /**
   * Broadcast a signed transaction
   */
  broadcastTransaction(txHex: string): Promise<string>

  /**
   * Get raw transaction bytes
   */
  getTransactionBytes(txHash: string): Promise<Uint8Array>

  /**
   * Get the Bitcoin network configuration
   */
  getNetwork(): typeof btc.NETWORK | typeof btc.TEST_NETWORK
}

class BtcBuilderImpl implements BtcBuilder {
  private readonly apiUrl: string
  private readonly rpc: UtxoRpcClient
  private readonly btcNetwork: "mainnet" | "testnet"

  constructor(config: BtcBuilderConfig) {
    this.btcNetwork = config.network
    this.apiUrl = config.apiUrl ?? DEFAULT_API_URLS[config.network]

    const chainKind = config.chain === "zcash" ? ChainKind.Zcash : ChainKind.Btc
    const rpcUrl = config.rpcUrl ?? DEFAULT_RPC_URLS[config.network]

    this.rpc = new UtxoRpcClient({
      url: rpcUrl,
      headers: config.rpcHeaders,
      chain: chainKind,
    })
  }

  buildWithdrawalPlan(
    utxos: UTXO[],
    amount: bigint,
    targetAddress: string,
    changeAddress: string,
    feeRate = 1,
    overrides?: UtxoPlanOverrides,
  ): BtcWithdrawalPlan {
    if (!utxos.length) {
      throw new Error("Bitcoin: No UTXOs available for transaction")
    }

    const normalized = this.normalizeUtxos(utxos)
    const feeCalculator = this.createFeeCalculator(feeRate)

    const dustThreshold = overrides?.dustThreshold ?? DEFAULT_UTXO_OPTIONS.dustThreshold
    const minChange = overrides?.minChange ?? DEFAULT_UTXO_OPTIONS.minChange ?? dustThreshold

    const selection = selectUtxosInternal(normalized, amount, {
      feeCalculator,
      dustThreshold,
      minChange,
      maxInputs: overrides?.maxInputs ?? DEFAULT_UTXO_OPTIONS.maxInputs,
      sort: overrides?.sort ?? DEFAULT_UTXO_OPTIONS.sort,
    })

    const outputs = this.buildOutputs(selection, amount, targetAddress, changeAddress)

    return {
      inputs: selection.inputs.map((input) => `${input.txid}:${input.vout}`),
      outputs,
      fee: selection.fee,
    }
  }

  selectUtxos(
    utxos: NormalizedUTXO[],
    amount: bigint,
    options?: Partial<UtxoSelectionOptions>,
  ): UtxoSelectionResult {
    return selectUtxosInternal(utxos, amount, {
      ...DEFAULT_UTXO_OPTIONS,
      ...options,
    })
  }

  async getDepositProof(txHash: string, vout: number): Promise<BtcDepositProof> {
    return await this.rpc.buildDepositProof(txHash, vout)
  }

  async getMerkleProof(txHash: string): Promise<BtcMerkleProof> {
    return await this.rpc.buildMerkleProof(txHash)
  }

  addressToScriptPubkey(address: string): string {
    try {
      const decoder = btc.Address(this.getNetwork())
      const outScript = btc.OutScript.encode(decoder.decode(address))
      return hex.encode(outScript)
    } catch (error) {
      const reason = error instanceof Error ? `: ${error.message}` : ""
      throw new Error(`Bitcoin: Failed to convert address to script_pubkey${reason}`)
    }
  }

  async broadcastTransaction(txHex: string): Promise<string> {
    const response = await fetch(`${this.apiUrl}/tx`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: txHex,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Bitcoin: Failed to broadcast transaction: ${errorText}`)
    }

    return await response.text()
  }

  async getTransactionBytes(txHash: string): Promise<Uint8Array> {
    const response = await fetch(`${this.apiUrl}/tx/${txHash}/hex`)
    if (!response.ok) {
      throw new Error(`Bitcoin: Failed to fetch transaction hex: ${response.statusText}`)
    }
    const txHex = await response.text()
    return hex.decode(txHex)
  }

  getNetwork(): typeof btc.NETWORK | typeof btc.TEST_NETWORK {
    if (this.btcNetwork === "mainnet") {
      return btc.NETWORK
    }
    return btc.TEST_NETWORK
  }

  private normalizeUtxos(utxos: UTXO[]): NormalizedUTXO[] {
    return utxos.map((utxo) => {
      let rawTx: Uint8Array | undefined
      if (utxo.tx_bytes) {
        if (utxo.tx_bytes instanceof Uint8Array) {
          rawTx = utxo.tx_bytes
        } else {
          rawTx = Uint8Array.from(utxo.tx_bytes)
        }
      }

      return {
        txid: utxo.txid,
        vout: utxo.vout,
        amount: BigInt(utxo.balance),
        path: utxo.path,
        rawTx,
      }
    })
  }

  private createFeeCalculator(feeRate: number): FeeCalculator {
    let effectiveRate = feeRate
    if (effectiveRate <= 0) {
      effectiveRate = 1
    }
    return linearFeeCalculator({
      base: 10,
      input: 68,
      output: 31,
      rate: effectiveRate,
    })
  }

  private buildOutputs(
    selection: UtxoSelectionResult,
    amount: bigint,
    to: string,
    changeAddress: string,
  ): Array<{ value: number; script_pubkey: string }> {
    const outputs = [this.createOutput(to, amount)]

    if (selection.change > 0n) {
      outputs.push(this.createOutput(changeAddress, selection.change))
    }

    return outputs
  }

  private createOutput(address: string, value: bigint): { value: number; script_pubkey: string } {
    if (value <= 0n) {
      throw new Error("Bitcoin: Output value must be positive")
    }

    const scriptHex = this.addressToScriptPubkey(address)
    return {
      value: Number(value),
      script_pubkey: scriptHex,
    }
  }
}

/**
 * Internal UTXO selection function
 */
function selectUtxosInternal(
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

function compareAmounts(
  a: NormalizedUTXO,
  b: NormalizedUTXO,
  mode: "largest-first" | "smallest-first",
): number {
  if (mode === "largest-first") {
    if (a.amount === b.amount) return 0
    return a.amount > b.amount ? -1 : 1
  }
  if (a.amount === b.amount) return 0
  return a.amount < b.amount ? -1 : 1
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
    // Change would be dust even after reserving change output, fallback to single output
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

/**
 * Create a Bitcoin transaction builder
 */
export function createBtcBuilder(config: BtcBuilderConfig): BtcBuilder {
  return new BtcBuilderImpl(config)
}
