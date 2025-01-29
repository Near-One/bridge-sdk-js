import { createMPT, createMerkleProof } from "@ethereumjs/mpt"
import { RLP } from "@ethereumjs/rlp"
import { MapDB, bigIntToHex, bytesToHex } from "@ethereumjs/util"
import { ethers } from "ethers"
import type { EvmProof } from "../types"

type Network = "ethereum" | "base" | "arbitrum" | "optimism"

const NETWORK_RPC_URLS: Record<Network, string> = {
  ethereum: "https://eth.llamarpc.com",
  base: "https://mainnet.base.org",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  optimism: "https://mainnet.optimism.io",
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
  baseFeePerGas: string
  withdrawalsRoot?: string
  blobGasUsed?: string
  excessBlobGas?: string
  parentBeaconBlockRoot?: string
}

class EthereumProvider extends ethers.JsonRpcProvider {
  async getBlockReceipts(blockTag: ethers.BlockTag) {
    const receipts = await this.send("eth_getBlockReceipts", [this._getBlockTag(blockTag)])
    const network = await this.getNetwork()
    return receipts.map((receipt: ethers.TransactionReceiptParams) =>
      this._wrapTransactionReceipt(receipt, network),
    )
  }

  async getBlockHeader(blockTag: ethers.BlockTag): Promise<BlockHeader> {
    return this.send("eth_getBlockByNumber", [this._getBlockTag(blockTag), false])
  }
}

export class ProofGenerator {
  private provider: EthereumProvider
  private network: Network

  constructor(network: Network = "ethereum") {
    this.network = network
    const rpcUrl = NETWORK_RPC_URLS[network]
    if (!rpcUrl) {
      throw new Error(`Unsupported network: ${network}`)
    }
    this.provider = new EthereumProvider(rpcUrl)
  }

  async generateProof(txHash: string, topic: string): Promise<EvmProof> {
    const receipt = await this.provider.getTransactionReceipt(txHash)
    if (!receipt) {
      throw new Error(`Transaction receipt not found on ${this.network}`)
    }

    const blockNumber = bigIntToHex(BigInt(receipt.blockNumber))
    const [blockHeader, blockReceipts] = await Promise.all([
      this.provider.getBlockHeader(blockNumber),
      this.provider.getBlockReceipts(blockNumber),
    ])

    const { merkleProof, receiptData } = await this.buildReceiptProof(receipt, blockReceipts)
    const logData = this.findAndEncodeLog(receipt, topic)

    return {
      log_index: BigInt(logData.index),
      log_entry_data: logData.encoded,
      receipt_index: BigInt(receipt.index),
      receipt_data: receiptData,
      header_data: this.encodeBlockHeader(blockHeader),
      proof: merkleProof,
    }
  }

  private async buildReceiptProof(
    receipt: ethers.TransactionReceipt,
    blockReceipts: ethers.TransactionReceipt[],
  ) {
    const trie = await createMPT({ db: new MapDB() })

    await Promise.all(
      blockReceipts.map(async (r) => {
        if (!r) throw new Error("Invalid receipt in block")
        const receiptRlp = this.encodeReceipt(r)
        const key = RLP.encode(r.index)
        await trie.put(key, receiptRlp)
      }),
    )

    const receiptKey = RLP.encode(receipt.index)
    const merkleProof = await createMerkleProof(trie, receiptKey)
    const receiptData = this.encodeReceipt(receipt)

    return { merkleProof, receiptData }
  }

  private findAndEncodeLog(receipt: ethers.TransactionReceipt, topic: string) {
    const logEntry = receipt.logs.find((log) => log.topics[0] === topic)
    if (!logEntry) {
      throw new Error("Log entry not found for the given topic")
    }

    return {
      index: receipt.logs.indexOf(logEntry),
      encoded: this.encodeLog(logEntry),
    }
  }

  private encodeReceipt(receipt: ethers.TransactionReceipt): Uint8Array {
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

  private encodeLog(log: ethers.Log): Uint8Array {
    return RLP.encode([log.address, Array.from(log.topics), log.data])
  }

  private encodeBlockHeader(header: BlockHeader): Uint8Array {
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
    ]
      .filter((item) => item !== undefined)
      .map((item) => (item === "0x0" ? "0x" : item))

    return RLP.encode(items)
  }
}

async function main() {
  // Usage example
  const txHash = "0xc4a6c5cde1d243b26b013f805f71f6de91536f66c993abfee746f373203b68cc"
  const topic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

  const proofGenerator = new ProofGenerator("ethereum")
  const proof = await proofGenerator.generateProof(txHash, topic)
  console.log(bytesToHex(proof.proof[0]))
}

main()
