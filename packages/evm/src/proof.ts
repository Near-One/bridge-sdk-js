/**
 * EVM proof generation for cross-chain verification
 */

import { createMerkleProof, createMPT } from "@ethereumjs/mpt"
import { RLP } from "@ethereumjs/rlp"
import { MapDB } from "@ethereumjs/util"
import type { EvmChainKind } from "@omni-bridge/core"
import { ChainKind, type Network } from "@omni-bridge/core"
import { type Chain, createPublicClient, type Hex, http, numberToHex } from "viem"
import * as chains from "viem/chains"

export interface EvmProof {
  log_index: bigint
  log_entry_data: Uint8Array
  receipt_index: bigint
  receipt_data: Uint8Array
  header_data: Uint8Array
  proof: Uint8Array[]
}

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
  baseFeePerGas?: string
  withdrawalsRoot?: string
  blobGasUsed?: string
  excessBlobGas?: string
  parentBeaconBlockRoot?: string
  requestsHash?: string
}

interface ReceiptLog {
  address: string
  topics: string[]
  data: string
}

interface SimpleReceipt {
  status: string
  cumulativeGasUsed: string
  logsBloom: string
  logs: ReceiptLog[]
  type: string
  transactionIndex: string
}

const RPC_URLS: Record<Network, Record<EvmChainKind, string>> = {
  mainnet: {
    [ChainKind.Eth]: "https://eth.llamarpc.com",
    [ChainKind.Arb]: "https://arb1.arbitrum.io/rpc",
    [ChainKind.Base]: "https://mainnet.base.org",
    [ChainKind.Bnb]: "https://bsc-rpc.publicnode.com",
    [ChainKind.Pol]: "https://polygon-bor-rpc.publicnode.com",
  },
  testnet: {
    [ChainKind.Eth]: "https://ethereum-sepolia.publicnode.com",
    [ChainKind.Arb]: "https://sepolia-rollup.arbitrum.io/rpc",
    [ChainKind.Base]: "https://sepolia.base.org",
    [ChainKind.Bnb]: "https://bsc-testnet-rpc.publicnode.com",
    [ChainKind.Pol]: "https://polygon-amoy-bor-rpc.publicnode.com",
  },
}

function getChainConfig(network: Network, chain: EvmChainKind): Chain {
  if (network === "mainnet") {
    switch (chain) {
      case ChainKind.Eth:
        return chains.mainnet
      case ChainKind.Arb:
        return chains.arbitrum
      case ChainKind.Base:
        return chains.base
      case ChainKind.Bnb:
        return chains.bsc
      case ChainKind.Pol:
        return chains.polygon
    }
  } else {
    switch (chain) {
      case ChainKind.Eth:
        return chains.sepolia
      case ChainKind.Arb:
        return chains.arbitrumSepolia
      case ChainKind.Base:
        return chains.baseSepolia
      case ChainKind.Bnb:
        return chains.bscTestnet
      case ChainKind.Pol:
        return chains.polygonAmoy
    }
  }
}

/**
 * Fetch EVM proof for a transaction
 */
export async function getEvmProof(
  txHash: Hex,
  topic: Hex,
  chain: EvmChainKind,
  network: Network,
  customRpcUrl?: string,
): Promise<EvmProof> {
  const rpcUrl = customRpcUrl ?? RPC_URLS[network][chain]
  if (!rpcUrl) {
    throw new Error(`No RPC URL for chain ${chain} on network ${network}`)
  }

  const viemChain = getChainConfig(network, chain)
  const client = createPublicClient({
    chain: viemChain,
    transport: http(rpcUrl),
  })

  // Get transaction receipt
  const receipt = await client.getTransactionReceipt({ hash: txHash })
  if (!receipt) {
    throw new Error(`Transaction receipt not found for ${txHash}`)
  }

  // Get block header and all receipts in the block
  const blockNumberHex = numberToHex(receipt.blockNumber)

  // Use raw RPC calls to get block data
  const transport = http(rpcUrl)({ chain: viemChain })

  const blockHeader = (await transport.request({
    method: "eth_getBlockByNumber",
    params: [blockNumberHex, false],
  })) as BlockHeader

  const blockReceipts = (await transport.request({
    method: "eth_getBlockReceipts" as "eth_getBlockReceipts",
    params: [blockNumberHex],
  })) as SimpleReceipt[]

  // Convert receipt to simple format
  const simpleReceipt: SimpleReceipt = {
    status: receipt.status === "success" ? "0x1" : "0x0",
    cumulativeGasUsed: numberToHex(receipt.cumulativeGasUsed),
    logsBloom: receipt.logsBloom,
    logs: receipt.logs.map((log) => ({
      address: log.address,
      topics: [...log.topics],
      data: log.data,
    })),
    type: receipt.type,
    transactionIndex: numberToHex(receipt.transactionIndex),
  }

  // Build Merkle proof
  const { merkleProof, receiptData } = await buildReceiptProof(
    simpleReceipt,
    receipt.transactionIndex,
    blockReceipts,
  )

  // Find and encode the log
  const logData = findAndEncodeLog(simpleReceipt, topic)

  return {
    log_index: BigInt(logData.index),
    log_entry_data: logData.encoded,
    receipt_index: BigInt(receipt.transactionIndex),
    receipt_data: receiptData,
    header_data: encodeBlockHeader(blockHeader),
    proof: merkleProof,
  }
}

async function buildReceiptProof(
  receipt: SimpleReceipt,
  txIndex: number,
  blockReceipts: SimpleReceipt[],
): Promise<{ merkleProof: Uint8Array[]; receiptData: Uint8Array }> {
  const trie = await createMPT({ db: new MapDB() })

  await Promise.all(
    blockReceipts.map(async (r, index) => {
      if (!r) throw new Error("Invalid receipt in block")
      const receiptRlp = encodeReceipt(r)
      const key = RLP.encode(index)
      await trie.put(key, receiptRlp)
    }),
  )

  const receiptKey = RLP.encode(txIndex)
  const merkleProof = await createMerkleProof(trie, receiptKey)
  const receiptData = encodeReceipt(receipt)

  return { merkleProof, receiptData }
}

function findAndEncodeLog(
  receipt: SimpleReceipt,
  topic: Hex,
): { index: number; encoded: Uint8Array } {
  const logIndex = receipt.logs.findIndex((log) => log.topics[0] === topic)
  if (logIndex === -1) {
    throw new Error("Log entry not found for the given topic")
  }

  const log = receipt.logs[logIndex]
  if (!log) {
    throw new Error("Log not found at index")
  }

  return {
    index: logIndex,
    encoded: encodeLog(log),
  }
}

function encodeReceipt(receipt: SimpleReceipt): Uint8Array {
  const items = [
    receipt.status === "0x1" ? "0x1" : "0x",
    receipt.cumulativeGasUsed,
    receipt.logsBloom,
    receipt.logs.map((log) => [log.address, log.topics, log.data]),
  ]

  const typeNumber = getReceiptTypeNumber(receipt.type)
  if (typeNumber === 0) {
    return RLP.encode(items)
  }

  return new Uint8Array([typeNumber, ...RLP.encode(items)])
}

function getReceiptTypeNumber(type: string): number {
  switch (type) {
    case "legacy":
    case "0x0":
      return 0
    case "eip2930":
    case "0x1":
      return 1
    case "eip1559":
    case "0x2":
      return 2
    case "eip4844":
    case "0x3":
      return 3
    default:
      return 0
  }
}

function encodeLog(log: ReceiptLog): Uint8Array {
  return RLP.encode([log.address, log.topics, log.data])
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
    .filter((item): item is string => item !== undefined)
    .map((item) => (item === "0x0" ? "0x" : item))

  return RLP.encode(items)
}
