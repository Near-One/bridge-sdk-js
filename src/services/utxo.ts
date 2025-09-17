/**
 * Abstract UTXO Service base class
 *
 * Provides common functionality for UTXO-based blockchain services.
 * Concrete implementations include Bitcoin and Zcash services.
 *
 * @abstract
 */

import type { UTXO } from "../types/bitcoin.js"

export interface UtxoSelectionResult {
  selected: UTXO[]
  total: bigint
  fee: bigint
}

/**
 * Abstract base class for UTXO-based blockchain services
 *
 * Provides common patterns for:
 * - UTXO selection and management
 * - Fee calculation frameworks
 * - Transaction broadcasting interfaces
 * - Network configuration management
 */
export abstract class UtxoService {
  /**
   * Create a new UTXO service instance
   * @param apiUrl - Blockchain API endpoint
   * @param network - Network type ("mainnet" or "testnet")
   */
  constructor(
    protected apiUrl: string,
    protected network: "mainnet" | "testnet",
  ) {}

  /**
   * Get the current network type
   * @returns Network configuration
   */
  getNetworkType(): "mainnet" | "testnet" {
    return this.network
  }

  /**
   * Abstract method for UTXO selection
   *
   * Each implementation should provide its own algorithm for selecting
   * optimal UTXOs for a given transaction amount and fee requirements.
   *
   * @param utxos - Available unspent transaction outputs
   * @param amount - Target amount to send (excluding fees)
   * @param targetAddress - Recipient address
   * @param changeAddress - Address for change output
   * @param feeRate - Fee rate (units vary by implementation)
   * @returns Selected UTXOs, total value, and calculated fee
   */
  abstract selectUtxos(
    utxos: UTXO[],
    amount: bigint,
    targetAddress: string,
    changeAddress: string,
    feeRate: number,
  ): UtxoSelectionResult

  /**
   * Abstract method for fee calculation
   *
   * Each blockchain has its own fee calculation algorithm:
   * - Bitcoin: fee rate in sat/vB based on transaction size
   * - Zcash: zatoshis based on logical actions
   *
   * @param inputs - Number of transaction inputs
   * @param outputs - Number of transaction outputs
   * @param feeRate - Fee rate (units vary by implementation)
   * @returns Calculated fee in base units
   */
  abstract calculateFee(inputs: number, outputs: number, feeRate?: number): bigint

  /**
   * Abstract method for broadcasting transactions
   *
   * @param txHex - Signed transaction in hexadecimal format
   * @returns Promise resolving to transaction hash if successful
   */
  abstract broadcastTransaction(txHex: string): Promise<string>

  /**
   * Common validation for transaction amounts
   * @protected
   * @param amount - Amount to validate
   * @throws {Error} When amount is invalid
   */
  protected validateAmount(amount: bigint): void {
    if (amount <= 0n) {
      throw new Error(`${this.constructor.name}: Amount must be greater than zero`)
    }
  }

  /**
   * Common validation for addresses
   * @protected
   * @param address - Address to validate (basic format check)
   * @throws {Error} When address is invalid
   */
  protected validateAddress(address: string): void {
    if (!address || address.trim().length === 0) {
      throw new Error(`${this.constructor.name}: Invalid address provided`)
    }
  }

  /**
   * Helper method to calculate total UTXO value
   * @protected
   * @param utxos - UTXOs to sum
   * @returns Total value in base units
   */
  protected calculateTotalValue(utxos: UTXO[]): bigint {
    return utxos.reduce((total, utxo) => total + BigInt(utxo.balance), 0n)
  }

  /**
   * Helper method to sort UTXOs by value (largest first)
   * @protected
   * @param utxos - UTXOs to sort
   * @returns Sorted UTXOs (largest first)
   */
  protected sortUtxosByValue(utxos: UTXO[]): UTXO[] {
    return [...utxos].sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)))
  }

  /**
   * Abstract method for address validation specific to each blockchain
   * @param address - Address to validate
   * @returns true if address is valid for this blockchain
   */
  abstract isValidAddress(address: string): boolean
}
