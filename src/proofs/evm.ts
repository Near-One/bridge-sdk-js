import { createMPT, createMerkleProof } from "@ethereumjs/mpt"
import { RLP } from "@ethereumjs/rlp"
import { MapDB, bigIntToHex } from "@ethereumjs/util"
import { ethers } from "ethers"
import type { BlockTag, Log, TransactionReceipt, TransactionReceiptParams } from "ethers"
import type { EVMChainKind } from "../clients"
import { ChainKind, type EvmProof } from "../types"

interface BlockHeader {
  parentHash: string
  sha3Uncles: string
  miner: string
  stateRoot: string
  transactionsRoot: string
  receiptsRoot: string
  logsBloom: string
  difficulty: string
  number: string
  gasLimit: string
  gasUsed: string
  timestamp: string
  extraData: string
  mixHash: string
  nonce: string
  baseFeePerGas: string
  withdrawalsRoot?: string
  blobGasUsed?: string
  excessBlobGas?: string
  parentBeaconBlockRoot?: string
  requestsHash?: string
}

const RPC_URLS: Record<EVMChainKind, string> = {
  [ChainKind.Eth]: "https://eth.llamarpc.com",
  [ChainKind.Base]: "https://mainnet.base.org",
  [ChainKind.Arb]: "https://arb1.arbitrum.io/rpc",
}

function getChainRpcUrl(chain: EVMChainKind): string {
  const url = RPC_URLS[chain]
  if (!url) {
    throw new Error(`No RPC URL configured for chain: ${chain}`)
  }
  return url
}

class ExtendedProvider extends ethers.JsonRpcProvider {
  async getBlockReceipts(blockTag: BlockTag) {
    const receipts = await this.send("eth_getBlockReceipts", [this._getBlockTag(blockTag)])
    const network = await this.getNetwork()
    return receipts.map((receipt: TransactionReceiptParams) =>
      this._wrapTransactionReceipt(receipt, network),
    )
  }

  async getBlockHeader(blockTag: BlockTag): Promise<BlockHeader> {
    return this.send("eth_getBlockByNumber", [this._getBlockTag(blockTag), false])
  }
}

export async function getEvmProof(
  txHash: string,
  topic: string,
  chain: EVMChainKind = ChainKind.Eth,
): Promise<EvmProof> {
  const rpcUrl = getChainRpcUrl(chain)

  const provider = new ExtendedProvider(rpcUrl)
  const receipt = await provider.getTransactionReceipt(txHash)
  if (!receipt) {
    throw new Error(`Transaction receipt not found on ${ChainKind[chain]}`)
  }

  const blockNumber = bigIntToHex(BigInt(receipt.blockNumber))
  const [blockHeader, blockReceipts] = await Promise.all([
    provider.getBlockHeader(blockNumber),
    provider.getBlockReceipts(blockNumber),
  ])

  const { merkleProof, receiptData } = await buildReceiptProof(receipt, blockReceipts)
  const logData = findAndEncodeLog(receipt, topic)

  return {
    log_index: BigInt(logData.index),
    log_entry_data: logData.encoded,
    receipt_index: BigInt(receipt.index),
    receipt_data: receiptData,
    header_data: encodeBlockHeader(blockHeader),
    proof: merkleProof,
  }
}

async function buildReceiptProof(receipt: TransactionReceipt, blockReceipts: TransactionReceipt[]) {
  const trie = await createMPT({ db: new MapDB() })

  await Promise.all(
    blockReceipts.map(async (r) => {
      if (!r) throw new Error("Invalid receipt in block")
      const receiptRlp = encodeReceipt(r)
      const key = RLP.encode(r.index)
      await trie.put(key, receiptRlp)
    }),
  )

  const receiptKey = RLP.encode(receipt.index)
  const merkleProof = await createMerkleProof(trie, receiptKey)
  const receiptData = encodeReceipt(receipt)

  return { merkleProof, receiptData }
}

function findAndEncodeLog(receipt: TransactionReceipt, topic: string) {
  const logEntry = receipt.logs.find((log) => log.topics[0] === topic)
  if (!logEntry) {
    throw new Error("Log entry not found for the given topic")
  }

  return {
    index: receipt.logs.indexOf(logEntry),
    encoded: encodeLog(logEntry),
  }
}

function encodeReceipt(receipt: TransactionReceipt): Uint8Array {
  const items = [
    receipt.status ? "0x1" : "0x",
    receipt.cumulativeGasUsed,
    receipt.logsBloom,
    receipt.logs.map((log) => [log.address, Array.from(log.topics), log.data]),
  ]

  if (receipt.type === 0) {
    return RLP.encode(items)
  }

  return new Uint8Array([receipt.type, ...RLP.encode(items)])
}

function encodeLog(log: Log): Uint8Array {
  return RLP.encode([log.address, Array.from(log.topics), log.data])
}

function encodeBlockHeader(header: BlockHeader): Uint8Array {
  const items = [
    header.parentHash,
    header.sha3Uncles,
    header.miner,
    header.stateRoot,
    header.transactionsRoot,
    header.receiptsRoot,
    header.logsBloom,
    header.difficulty,
    header.number,
    header.gasLimit,
    header.gasUsed,
    header.timestamp,
    header.extraData,
    header.mixHash,
    header.nonce,
    header.baseFeePerGas,
    header.withdrawalsRoot,
    header.blobGasUsed,
    header.excessBlobGas,
    header.parentBeaconBlockRoot,
    header.requestsHash,
  ]
    .filter((item) => item !== undefined)
    .map((item) => (item === "0x0" ? "0x" : item))

  return RLP.encode(items)
}
