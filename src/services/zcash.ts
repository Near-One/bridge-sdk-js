import { sha256 } from "@noble/hashes/sha2.js"
import { hex } from "@scure/base"
import { MerkleTree } from "merkletreejs"
import type { UTXO } from "../types/bitcoin.js"
import { type UtxoSelectionResult, UtxoService } from "./utxo.js"

interface ContractDepositProof {
  merkle_proof: string[]
  tx_block_blockhash: string
  tx_bytes: number[]
  tx_index: number
}

type JsonRpcSuccess<T> = {
  jsonrpc: "2.0"
  id: string | number | null
  result: T
}

type JsonRpcError = {
  jsonrpc: "2.0"
  id: string | number | null
  error: { code: number; message: string; data?: unknown }
}

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcError

export class ZcashService extends UtxoService {
  constructor(
    apiUrl: string,
    private apiKey: string,
    network: "mainnet" | "testnet" = "mainnet",
  ) {
    super(apiUrl, network)
  }

  private async rpc<T>(method: string, params: unknown[] = []): Promise<T> {
    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: "1", method, params }),
    })

    const body = (await response.json()) as JsonRpcResponse<T>
    if ("error" in body) throw new Error(body.error.message)
    return body.result
  }

  async decodeTransaction(txHex: string) {
    const tx = await this.rpc("decoderawtransaction", [txHex])
    return tx
  }

  async getDepositProof(txHash: string): Promise<ContractDepositProof> {
    const txInfo = (await this.rpc("getrawtransaction", [txHash, 1])) as {
      blockhash: string
      hex: string
    }
    if (!txInfo.blockhash) throw new Error("Transaction not confirmed")

    const block = (await this.rpc("getblock", [txInfo.blockhash, 1])) as { tx: string[] }

    const leaves = block.tx.map((id: string) => Buffer.from(hex.decode(id)))

    const tree = new MerkleTree(leaves, sha256, { isBitcoinTree: true })

    const targetIndex = block.tx.indexOf(txHash)
    const proof = tree.getProof(leaves[targetIndex], targetIndex)

    return {
      merkle_proof: proof.map((p) => hex.encode(p.data)),
      tx_block_blockhash: txInfo.blockhash,
      tx_bytes: Array.from(hex.decode(txInfo.hex)),
      tx_index: targetIndex,
    }
  }

  async broadcastTransaction(txHex: string): Promise<string> {
    return await this.rpc("sendrawtransaction", [txHex])
  }

  calculateZcashFee(inputs: number, outputs: number): bigint {
    const marginalFee = 5000 // zatoshis per logical action
    const graceActions = 2

    // Simplified calculation for transparent transactions
    // Real implementation would need to account for Sapling/Orchard actions too
    const logicalActions = Math.max(inputs, outputs)

    const fee = Math.max(
      marginalFee * Math.max(graceActions, logicalActions),
      marginalFee * graceActions,
    )

    return BigInt(fee)
  }

  /**
   * Implementation of abstract selectUtxos method
   * @param utxos - Available UTXOs
   * @param amount - Target amount
   * @param targetAddress - Recipient address
   * @param changeAddress - Change address
   * @param feeRate - Fee rate (not used in Zcash, fee calculated based on logical actions)
   * @returns UTXO selection result
   */
  selectUtxos(
    utxos: UTXO[],
    amount: bigint,
    targetAddress: string,
    changeAddress: string,
    _feeRate?: number,
  ): UtxoSelectionResult {
    // Zcash-specific validations (maintaining original error messages)
    if (utxos.length === 0) {
      throw new Error("Zcash: No UTXOs available for transaction")
    }
    this.validateAmount(amount)
    this.validateAddress(targetAddress)
    this.validateAddress(changeAddress)

    // Sort biggest first
    const sorted = this.sortUtxosByValue(utxos)

    const selected: UTXO[] = []
    let total = 0n

    for (const utxo of sorted) {
      selected.push(utxo)
      total += BigInt(utxo.balance)

      // Fee calculation: based on logical actions
      const fee = this.calculateFee(selected.length, 2)

      if (total >= amount + fee) {
        return { selected, total, fee }
      }
    }

    throw new Error("Zcash: Insufficient funds for transaction")
  }

  /**
   * Implementation of abstract calculateFee method
   * @param inputs - Number of transaction inputs
   * @param outputs - Number of transaction outputs
   * @param feeRate - Not used in Zcash fee calculation
   * @returns Calculated fee in zatoshis
   */
  calculateFee(inputs: number, outputs: number, _feeRate?: number): bigint {
    return this.calculateZcashFee(inputs, outputs)
  }

  /**
   * Implementation of abstract isValidAddress method
   * @param address - Zcash address to validate
   * @returns true if address appears to be a valid Zcash address
   */
  isValidAddress(address: string): boolean {
    // Basic Zcash address validation
    // Mainnet: starts with 't1', 't3', 'zs1', or 'zu1'
    // Testnet: starts with 'tm', 'tn', 'ztestsapling', etc.
    if (!address || address.trim().length === 0) {
      return false
    }

    const trimmed = address.trim()

    if (this.network === "mainnet") {
      return (
        trimmed.startsWith("t1") ||
        trimmed.startsWith("t3") ||
        trimmed.startsWith("zs1") ||
        trimmed.startsWith("zu1")
      )
    } else {
      // Testnet
      return (
        trimmed.startsWith("tm") ||
        trimmed.startsWith("tn") ||
        trimmed.startsWith("ztestsapling") ||
        trimmed.startsWith("zregtestsapling")
      )
    }
  }

  /**
   * Select UTXOs using Zcash-specific algorithm (legacy method)
   * @deprecated Use selectUtxos instead
   */
  selectUTXOs(utxos: UTXO[], amount: bigint) {
    try {
      const result = this.selectUtxos(utxos, amount, "dummy", "dummy")
      return {
        selected: result.selected,
        total: result.total,
        fee: result.fee,
      }
    } catch (error) {
      // Maintain original error message for backward compatibility
      if (error instanceof Error && error.message.includes("Insufficient funds")) {
        throw new Error("Insufficient funds")
      }
      throw error
    }
  }
}
