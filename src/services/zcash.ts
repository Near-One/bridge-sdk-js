import { sha256 } from "@noble/hashes/sha2"
import { hex } from "@scure/base"
import { MerkleTree } from "merkletreejs"
import type { UTXO } from "../types/bitcoin.js"

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

export class ZcashService {
  constructor(
    private apiUrl: string,
    private apiKey: string,
  ) {}

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

  selectUTXOs(utxos: UTXO[], amount: bigint) {
    // Sort biggest first
    const sorted = [...utxos].sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)))

    const selected = []
    let total = 0n

    for (const utxo of sorted) {
      selected.push(utxo)
      total += BigInt(utxo.balance)

      // Fee calculation: 12 + inputs*68 + outputs*31
      const fee = this.calculateZcashFee(selected.length, 2)

      if (total >= amount + fee) {
        return { selected, total, fee }
      }
    }

    throw new Error("Insufficient funds")
  }
}
