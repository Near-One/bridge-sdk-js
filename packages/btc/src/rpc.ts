/**
 * UTXO RPC client for Bitcoin/Zcash proof generation
 */

import { sha256 } from "@noble/hashes/sha2.js"
import { ChainKind } from "@omni-bridge/core"
import { hex } from "@scure/base"
import { MerkleTree } from "merkletreejs"
import type { BtcDepositProof, BtcMerkleProof, UtxoRpcConfig } from "./types.js"

type JsonRpcResponse<T> = {
  jsonrpc: "2.0"
  id: string | number | null
  result?: T
  error?: { code: number; message: string; data?: unknown }
}

interface RawTransactionResult {
  blockhash?: string
  hex: string
  height?: number
  vout?: Array<{ n: number; value: number }>
}

interface BlockResult {
  tx: string[]
  height?: number
}

/**
 * Build a Bitcoin-style Merkle proof for transaction inclusion
 */
export function buildBitcoinMerkleProof(
  txids: string[],
  targetTxid: string,
): { index: number; merkle: string[] } {
  const targetIndex = txids.indexOf(targetTxid)
  if (targetIndex === -1) {
    throw new Error("Transaction not found in block")
  }

  const leaves = txids.map((id) => hex.decode(id))
  // MerkleTree types expect Buffer but work with Uint8Array at runtime
  const tree = new MerkleTree(leaves as unknown as Buffer[], sha256, {
    isBitcoinTree: true,
  })
  const targetLeaf = leaves[targetIndex]
  if (!targetLeaf) {
    throw new Error("Target leaf not found")
  }
  const proof = tree.getProof(targetLeaf as unknown as Buffer, targetIndex)

  return {
    index: targetIndex,
    merkle: proof.map((p) => hex.encode(p.data)),
  }
}

/**
 * RPC client for Bitcoin/Zcash nodes
 */
export class UtxoRpcClient {
  constructor(private readonly config: UtxoRpcConfig) {}

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const response = await fetch(this.config.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.config.headers ?? {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: "1", method, params }),
    })

    if (!response.ok) {
      throw new Error(`UTXO RPC request failed: ${response.status} ${response.statusText}`)
    }

    const body = (await response.json()) as JsonRpcResponse<T>
    if (body.error) {
      throw new Error(`UTXO RPC error: ${body.error.message}`)
    }
    if (body.result === undefined || body.result === null) {
      throw new Error("UTXO RPC: missing result in response")
    }
    return body.result
  }

  async getTransaction(txHash: string): Promise<RawTransactionResult> {
    const verbosity = this.config.chain === ChainKind.Btc ? true : 1
    return await this.call<RawTransactionResult>("getrawtransaction", [txHash, verbosity])
  }

  async getBlock(blockHash: string): Promise<BlockResult> {
    const verbosity = this.config.chain === ChainKind.Btc ? true : 1
    return await this.call<BlockResult>("getblock", [blockHash, verbosity])
  }

  async buildDepositProof(txHash: string, vout: number): Promise<BtcDepositProof> {
    const txInfo = await this.getTransaction(txHash)
    if (!txInfo.blockhash) {
      throw new Error("UTXO: Transaction not confirmed")
    }

    const block = await this.getBlock(txInfo.blockhash)
    const { merkle, index } = buildBitcoinMerkleProof(block.tx, txHash)

    const output = txInfo.vout?.find((item) => item.n === vout)
    if (!output) {
      throw new Error(`UTXO: Output ${vout} not found in transaction`)
    }

    const amount = parseAmountToSatoshis(output.value)

    return {
      merkle_proof: merkle,
      tx_block_blockhash: txInfo.blockhash,
      tx_bytes: Array.from(hex.decode(txInfo.hex)),
      tx_index: index,
      amount,
    }
  }

  async buildMerkleProof(txHash: string): Promise<BtcMerkleProof> {
    const txInfo = await this.getTransaction(txHash)
    if (!txInfo.blockhash) {
      throw new Error("UTXO: Transaction not confirmed")
    }

    const block = await this.getBlock(txInfo.blockhash)
    const { merkle, index } = buildBitcoinMerkleProof(block.tx, txHash)

    const blockHeight =
      typeof block.height === "number"
        ? block.height
        : typeof txInfo.height === "number"
          ? txInfo.height
          : -1

    return {
      block_height: blockHeight,
      merkle,
      pos: index,
    }
  }
}

function parseAmountToSatoshis(value: number | string): bigint {
  if (typeof value === "number") {
    return BigInt(Math.round(value * 1e8))
  }

  const [wholePart, fractionalPart = ""] = value.split(".")
  const paddedFraction = `${fractionalPart}00000000`.slice(0, 8)
  return BigInt(wholePart || "0") * 100_000_000n + BigInt(paddedFraction)
}
