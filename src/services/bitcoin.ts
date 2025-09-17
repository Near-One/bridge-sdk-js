import { hex } from "@scure/base"
import * as btc from "@scure/btc-signer"
import type { BitcoinMerkleProofResponse, BitcoinTransaction, UTXO } from "../types/bitcoin.js"
import {
  linearFeeCalculator,
  type NormalizedUTXO,
  SIMPLE_UTXO_DEFAULTS,
  selectUtxos,
  type UtxoDepositProof,
  type UtxoPlanOverrides,
  type UtxoSelectionResult,
  type UtxoWithdrawalPlan,
} from "../utxo/index.js"
import { UtxoRpcClient } from "../utxo/rpc.js"

/**
 * Bitcoin service for proof generation and network queries
 *
 * Provides comprehensive Bitcoin network integration including:
 * - Merkle proof generation for deposit verification
 * - UTXO selection and transaction construction
 * - Network communication with Blockstream API
 * - Address validation and script generation
 *
 * Mirrors the functionality from the Rust SDK's btc-utils
 *
 * @example
 * ```typescript
 * const bitcoinService = new BitcoinService(
 *   "https://blockstream.info/api",
 *   "mainnet"
 * )
 *
 * // Generate merkle proof for deposit verification
 * const proof = await bitcoinService.fetchMerkleProof(txHash)
 *
 * // Select UTXOs for withdrawal transaction
 * const plan = bitcoinService.buildWithdrawalPlan(utxos, amount, targetAddress, changeAddress, feeRate)
 * ```
 */
export class BitcoinService {
  /**
   * Create a new BitcoinService instance
   * @param apiUrl - Bitcoin API endpoint (e.g., "https://blockstream.info/api")
   * @param network - Bitcoin network type ("mainnet" or "testnet")
   */
  constructor(
    private apiUrl: string,
    private network: "mainnet" | "testnet",
    rpcConfig?: { url: string; headers?: Record<string, string> },
  ) {
    let defaultRpcUrl = "https://bitcoin-testnet-rpc.publicnode.com"
    if (network === "mainnet") {
      defaultRpcUrl = "https://bitcoin-rpc.publicnode.com"
    }

    this.rpc = new UtxoRpcClient({
      url: rpcConfig?.url ?? defaultRpcUrl,
      headers: rpcConfig?.headers,
    })
  }

  private rpc: UtxoRpcClient

  /**
   * Fetch merkle proof for Bitcoin transaction verification
   *
   * Used to prove Bitcoin transaction inclusion in a block for deposit verification.
   * The merkle proof allows NEAR contracts to verify Bitcoin transactions without
   * running a full Bitcoin node.
   *
   * @param txHash - Bitcoin transaction hash (64-character hex string)
   * @returns Promise resolving to merkle proof data including block height, position, and proof hashes
   * @throws {Error} When API request fails or transaction not found
   *
   * @example
   * ```typescript
   * const proof = await bitcoinService.fetchMerkleProof(
   *   "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
   * )
   * console.log(`Block height: ${proof.block_height}`)
   * console.log(`Position in block: ${proof.pos}`)
   * console.log(`Merkle proof: ${proof.merkle}`)
   * ```
   */
  async fetchMerkleProof(txHash: string): Promise<BitcoinMerkleProofResponse> {
    return await this.rpc.buildMerkleProof(txHash)
  }

  async getMerkleProof(txHash: string): Promise<BitcoinMerkleProofResponse> {
    return await this.fetchMerkleProof(txHash)
  }

  async getDepositProof(txHash: string, vout: number): Promise<UtxoDepositProof> {
    return await this.rpc.buildDepositProof(txHash, vout)
  }

  /**
   * Plan a simple Bitcoin transaction using manual UTXO selection.
   *
   * The planner applies largest-first selection with configurable fee logic.
   * It produces the exact inputs that should be consumed, along with the
   * canonical outputs (recipient + optional change) that must be encoded on
   * chain when the NEAR connector constructs the unsigned transaction.
   */
  buildWithdrawalPlan(
    utxos: UTXO[],
    amount: bigint,
    targetAddress: string,
    changeAddress: string,
    feeRate: number = 1,
    overrides?: UtxoPlanOverrides,
  ): UtxoWithdrawalPlan {
    if (!utxos.length) {
      throw new Error("Bitcoin: No UTXOs available for transaction")
    }

    const normalized = this.normalizeUtxos(utxos)
    const feeCalculator = this.createFeeCalculator(feeRate)

    const dustThreshold = overrides?.dustThreshold ?? SIMPLE_UTXO_DEFAULTS.dustThreshold
    const minChange = overrides?.minChange ?? SIMPLE_UTXO_DEFAULTS.minChange ?? dustThreshold
    const selection = selectUtxos(normalized, amount, {
      feeCalculator,
      dustThreshold,
      minChange,
      maxInputs: overrides?.maxInputs ?? SIMPLE_UTXO_DEFAULTS.maxInputs,
      sort: overrides?.sort ?? SIMPLE_UTXO_DEFAULTS.sort,
    })

    const outputs = this.buildOutputs(selection, amount, targetAddress, changeAddress)

    return {
      inputs: selection.inputs.map((input) => `${input.txid}:${input.vout}`),
      outputs,
      fee: selection.fee,
    }
  }

  private normalizeUtxos(utxos: UTXO[]): NormalizedUTXO[] {
    return utxos.map((utxo) => {
      const bytes = utxo.tx_bytes
      let rawTx: Uint8Array
      if (bytes instanceof Uint8Array) {
        rawTx = bytes
      } else {
        rawTx = Uint8Array.from(bytes)
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

  private createFeeCalculator(feeRate: number) {
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
  ) {
    const outputs = [this.createOutput(to, amount)]

    if (selection.change > 0n) {
      outputs.push(this.createOutput(changeAddress, selection.change))
    }

    return outputs
  }

  private createOutput(address: string, value: bigint) {
    if (value <= 0n) {
      throw new Error("Bitcoin: Output value must be positive")
    }

    const scriptHex = this.addressToScriptPubkey(address)
    return {
      value: Number(value),
      script_pubkey: scriptHex,
    }
  }

  /**
   * Get raw transaction bytes for proof generation and verification
   *
   * Fetches the complete transaction data in binary format, required for:
   * - Merkle proof verification in NEAR contracts
   * - Bitcoin transaction parsing and validation
   * - Digital signature verification
   *
   * @param txHash - Bitcoin transaction hash
   * @returns Promise resolving to raw transaction bytes
   * @throws {Error} When transaction not found or API error
   */
  async getTransactionBytes(txHash: string): Promise<Uint8Array> {
    const txHex = await this.getTransactionHex(txHash)
    return hex.decode(txHex)
  }

  /**
   * Broadcast signed transaction to Bitcoin network
   *
   * Submits a fully signed Bitcoin transaction to the network for confirmation.
   * Used in the final step of withdrawal flow after MPC signing.
   *
   * @param txHex - Signed transaction in hexadecimal format
   * @returns Promise resolving to transaction hash (txid) if successful
   * @throws {Error} When broadcast fails (insufficient fees, double spend, etc.)
   *
   * @example
   * ```typescript
   * const signedTxHex = "0200000001abc123..." // From MPC signing
   * const txHash = await bitcoinService.broadcastTransaction(signedTxHex)
   * console.log(`Transaction broadcast: ${txHash}`)
   * ```
   */
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

  /**
   * Get detailed Bitcoin transaction information
   *
   * Fetches comprehensive transaction data including inputs, outputs, fees,
   * and confirmation status. Used for deposit verification and withdrawal tracking.
   *
   * @param txHash - Bitcoin transaction hash
   * @returns Promise resolving to complete transaction details
   * @throws {Error} When transaction not found or API error
   *
   * @example
   * ```typescript
   * const tx = await bitcoinService.getTransaction("abc123...")
   * console.log(`Confirmed: ${tx.status?.confirmed}`)
   * console.log(`Block height: ${tx.status?.block_height}`)
   * console.log(`Fee: ${tx.fee} satoshis`)
   * ```
   */
  async getTransaction(txHash: string): Promise<BitcoinTransaction> {
    const response = await fetch(`${this.apiUrl}/tx/${txHash}`)
    if (!response.ok) {
      throw new Error(`Bitcoin: Failed to fetch transaction: ${response.statusText}`)
    }
    return (await response.json()) as BitcoinTransaction
  }

  /**
   * Get transaction hex for parsing
   */
  private async getTransactionHex(txHash: string): Promise<string> {
    const response = await fetch(`${this.apiUrl}/tx/${txHash}/hex`)
    if (!response.ok) {
      throw new Error(`Bitcoin: Failed to fetch transaction hex: ${response.statusText}`)
    }
    return await response.text()
  }

  /**
   * Get scure-btc-signer network configuration
   *
   * Returns the appropriate network configuration object for use with
   * scure-btc-signer library functions (address parsing, transaction signing, etc.)
   *
   * @returns Network configuration object (btc.NETWORK for mainnet, btc.TEST_NETWORK for testnet)
   */
  getNetwork(): typeof btc.NETWORK | typeof btc.TEST_NETWORK {
    if (this.network === "mainnet") {
      return btc.NETWORK
    }
    return btc.TEST_NETWORK
  }

  /**
   * Converts a Bitcoin address to its corresponding script_pubkey
   * @param address - Bitcoin address string
   * @returns script_pubkey encoded as a hex string
   */
  public addressToScriptPubkey(address: string): string {
    try {
      const decoder = btc.Address(this.getNetwork())
      const outScript = btc.OutScript.encode(decoder.decode(address))
      return hex.encode(outScript)
    } catch (error) {
      const reason = error instanceof Error ? `: ${error.message}` : ""
      throw new Error(`Bitcoin: Failed to convert address to script_pubkey${reason}`)
    }
  }
}
