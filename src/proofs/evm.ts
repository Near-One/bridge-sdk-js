import { createMPT, createMerkleProof } from "@ethereumjs/mpt"
import { RLP } from "@ethereumjs/rlp"
import { MapDB, bigIntToHex } from "@ethereumjs/util"
import {
  type TransactionReceipt,
  type TransactionReceiptParams,
  ethers,
  resolveProperties,
} from "ethers"
import type { EvmProof } from "../types"

interface RawBlock extends ethers.Block {
  sha3Uncles: string
  transactionsRoot: string
  logsBloom: string
  mixHash: string
  withdrawalsRoot: string
}

class BatchJsonRpcProvider extends ethers.JsonRpcProvider {
  async getBlockReceipts(block: ethers.BlockTag): Promise<TransactionReceipt[]> {
    const receipts: TransactionReceiptParams[] = await this.send("eth_getBlockReceipts", [
      this._getBlockTag(block),
    ])
    const network = await resolveProperties(this.getNetwork())
    return receipts.map((receipt) => this._wrapTransactionReceipt(receipt, network))
  }

  async getRawBlock(block: ethers.BlockTag): Promise<RawBlock> {
    return this.send("eth_getBlock", [this._getBlockTag(block), false])
  }
}

export async function getProofForEvent(
  txHash: string,
  topic: string,
  nodeUrl: string,
): Promise<EvmProof> {
  const provider = new BatchJsonRpcProvider(nodeUrl)

  // Get transaction receipt and block
  const receipt = await provider.getTransactionReceipt(txHash)
  if (!receipt) {
    throw new Error("Receipt not found")
  }

  const rawBlock = await provider.send("eth_getBlockByNumber", [
    bigIntToHex(BigInt(receipt.blockNumber)),
    false,
  ])
  const blockReceipts = await provider.getBlockReceipts(rawBlock.number)

  // Build receipt trie
  const trie = await createMPT({ db: new MapDB() })

  // Insert all receipts into trie
  for (const receipt of blockReceipts) {
    if (!receipt) {
      throw new Error("Receipt not found")
    }
    const receiptRlp = encodeReceipt(receipt)
    const key = RLP.encode(receipt?.index)
    await trie.put(key, receiptRlp)
  }

  // Generate proof
  const receiptKey = RLP.encode(receipt?.index)
  const proof = await createMerkleProof(trie, receiptKey)

  // Find matching log
  let logData: Uint8Array | undefined
  let logIndex = 0
  const logEntry = receipt.logs.find((log) => log.topics[0] === topic)
  if (logEntry) {
    logData = encodeLog(logEntry)
    logIndex = receipt.logs.indexOf(logEntry)
  }

  if (!logData) {
    throw new Error("Log not found based on the transaction hash and topic provided")
  }

  return {
    log_index: BigInt(logIndex),
    log_entry_data: logData,
    receipt_index: BigInt(receipt.index),
    receipt_data: encodeReceipt(receipt),
    header_data: encodeHeader(rawBlock),
    proof: proof,
  }
}

function encodeReceipt(receipt: ethers.TransactionReceipt): Uint8Array {
  const items = [
    receipt.status ? "0x1" : "0x",
    receipt.cumulativeGasUsed,
    receipt.logsBloom,
    receipt.logs.map((log) => [log.address, Array.from(log.topics), log.data]),
  ]
  if (receipt.type !== 0) {
    const typeBytes = new Uint8Array([receipt.type])
    return new Uint8Array([...typeBytes, ...RLP.encode(items)])
  }

  return RLP.encode(items)
}

function encodeLog(log: ethers.Log): Uint8Array {
  return RLP.encode([log.address, Array.from(log.topics), log.data])
}

function encodeHeader(rawBlock: RawBlock): Uint8Array {
  let items = [
    rawBlock.parentHash,
    rawBlock.sha3Uncles,
    rawBlock.miner,
    rawBlock.stateRoot,
    rawBlock.transactionsRoot,
    rawBlock.receiptsRoot,
    rawBlock.logsBloom,
    rawBlock.difficulty,
    rawBlock.number,
    rawBlock.gasLimit,
    rawBlock.gasUsed,
    rawBlock.timestamp,
    rawBlock.extraData,
    rawBlock.mixHash,
    rawBlock.nonce,
    rawBlock.baseFeePerGas,
  ]

  if (rawBlock.withdrawalsRoot) {
    items.push(rawBlock.withdrawalsRoot)
  }

  // Add blob gas fields for post-Dencun blocks
  if (rawBlock.blobGasUsed !== undefined) {
    items.push(rawBlock.blobGasUsed)
  }
  if (rawBlock.excessBlobGas !== undefined) {
    items.push(rawBlock.excessBlobGas)
  }
  if (rawBlock.parentBeaconBlockRoot !== undefined) {
    items.push(rawBlock.parentBeaconBlockRoot)
  }

  // Replace all instances of `0x0` with `0x`
  items = items.map((item) => (item === "0x0" ? "0x" : item))

  return RLP.encode(items)
}
const nodeUrl = "https://eth.llamarpc.com"
const txHash = "0xc4a6c5cde1d243b26b013f805f71f6de91536f66c993abfee746f373203b68cc"
const topic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
getProofForEvent(txHash, topic, nodeUrl)
