import { hex } from "@scure/base"
import * as btc from "@scure/btc-signer"
import type {
  BitcoinMerkleProofResponse,
  BitcoinTransaction,
  NearBlocksReceiptsResponse,
  UTXO,
} from "../types/bitcoin.js"

/**
 * Bitcoin service for proof generation and network queries
 *
 * Provides comprehensive Bitcoin network integration including:
 * - Merkle proof generation for deposit verification
 * - UTXO selection and transaction construction
 * - Network communication with Blockstream API
 * - Block explorer integration via NearBlocks API
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
 * const selection = bitcoinService.selectCoins(utxos, amount, targetAddress, changeAddress, feeRate)
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
  ) {}

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
    const response = await fetch(`${this.apiUrl}/tx/${txHash}/merkle-proof`)
    if (!response.ok) {
      throw new Error(`Bitcoin: Failed to fetch merkle proof: ${response.statusText}`)
    }
    return (await response.json()) as BitcoinMerkleProofResponse
  }

  /**
   * Convert UTXO to scure-btc-signer input format
   * @private
   * @param utxo - UTXO to convert
   * @returns Input object compatible with scure-btc-signer
   */
  private toInput(utxo: UTXO) {
    return {
      path: utxo.path,
      txid: hex.decode(utxo.txid),
      index: utxo.vout,
      nonWitnessUtxo: Uint8Array.from(utxo.tx_bytes),
    }
  }

  /**
   * Select UTXOs and construct Bitcoin transaction for withdrawal
   *
   * Implements optimal UTXO selection using scure-btc-signer's selectUTXO algorithm.
   * The algorithm considers:
   * - Available UTXO set and required output amount
   * - Fee estimation based on transaction size and fee rate
   * - Change output generation to minimize dust
   * - BIP69 sorting for privacy (deterministic input/output ordering)
   *
   * @param utxos - Available unspent transaction outputs to spend from
   * @param amount - Target amount to send in satoshis (excluding fees)
   * @param to - Recipient Bitcoin address (any format: P2PKH, P2SH, P2WPKH, P2WSH)
   * @param changeAddress - Address to send remaining balance after fees
   * @param feeRate - Fee rate in satoshis per virtual byte (sat/vB)
   * @returns Selected inputs, outputs, estimated fee, and transaction size
   * @throws {Error} When insufficient funds available for amount + fees
   *
   * @example
   * ```typescript
   * const utxos = [
   *   { txid: "abc123...", vout: 0, balance: "100000", ... },
   *   { txid: "def456...", vout: 1, balance: "50000", ... }
   * ]
   *
   * const selection = bitcoinService.selectCoins(
   *   utxos,
   *   BigInt(75000), // Send 75,000 sats
   *   "bc1qrecipient...", // Target address
   *   "bc1qchange...", // Change address
   *   10 // 10 sat/vB fee rate
   * )
   *
   * console.log(`Selected ${selection.inputs.length} inputs`)
   * console.log(`Fee: ${selection.fee} sats`)
   * console.log(`Transaction size: ${selection.vsize} vBytes`)
   * ```
   */
  selectCoins(
    utxos: UTXO[],
    amount: bigint,
    to: string,
    changeAddress: string,
    feeRate: number, // sat/vB
  ) {
    // Early validation: check if we have any UTXOs
    if (utxos.length === 0) {
      throw new Error("Bitcoin: No UTXOs available for transaction")
    }

    // Convert UTXOs to scure-btc-signer format efficiently
    const inputs = utxos.map(this.toInput)
    const network = this.getNetwork()

    // Use scure-btc-signer's optimized selectUTXO algorithm
    const result = btc.selectUTXO(
      inputs,
      [{ address: to, amount }], // Target output
      "default", // Optimal selection strategy
      {
        feePerByte: BigInt(feeRate),
        changeAddress,
        network,
        bip69: true, // Privacy: deterministic ordering
        createTx: true, // Accurate fee estimation
      },
    )

    if (!result) {
      throw new Error("Bitcoin: Insufficient funds for transaction")
    }

    return {
      inputs: result.inputs,
      outputs: result.outputs,
      fee: result.tx?.fee ?? result.fee,
      vsize: Math.ceil(result.weight / 4),
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
    return this.network === "mainnet" ? btc.NETWORK : btc.TEST_NETWORK
  }

  /**
   * Converts a Bitcoin address to its corresponding script_pubkey
   * @param address - Bitcoin address string
   * @param network - Network configuration (defaults to mainnet)
   * @returns Uint8Array representing the script_pubkey
   */
  public addressToScriptPubkey(address: string): Uint8Array {
    try {
      // Use the built-in Address decoder to parse the address
      const network = this.getNetwork()
      const addressDecoder = btc.Address(network)
      const outScriptType = addressDecoder.decode(address)

      // Use OutScript encoder to convert to script bytes
      return btc.OutScript.encode(outScriptType)
    } catch (error) {
      throw new Error(`Bitcoin: Failed to convert address to script_pubkey: ${error}`)
    }
  }

  /**
   * Find NEAR transaction hash for Bitcoin transaction signing using NearBlocks API
   * @param signerAccountId - Account that signed the Bitcoin transaction (usually relayer)
   * @param btcPendingId - The pending Bitcoin transaction ID to search for
   * @returns Promise<string> - NEAR transaction hash containing the signing
   */
  async findTransactionSigning(signerAccountId: string, btcPendingId: string): Promise<string> {
    const baseUrl =
      this.network === "mainnet"
        ? "https://api.nearblocks.io/v1"
        : "https://api-testnet.nearblocks.io/v1"

    const response = await fetch(
      `${baseUrl}/account/${signerAccountId}/receipts?method=sign_btc_transaction`,
    )

    if (!response.ok) {
      throw new Error(`Bitcoin: Failed to fetch transaction receipts: ${response.statusText}`)
    }

    const data = (await response.json()) as NearBlocksReceiptsResponse

    for (const tx of data.txns) {
      for (const action of tx.actions) {
        if (action.args.includes(btcPendingId)) {
          return tx.transaction_hash
        }
      }
    }

    throw new Error(`Bitcoin: Transaction signing not found for pending ID: ${btcPendingId}`)
  }
}
