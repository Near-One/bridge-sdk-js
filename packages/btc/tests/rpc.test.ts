import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { ChainKind } from "@omni-bridge/core"
import { buildBitcoinMerkleProof, UtxoRpcClient } from "../src/rpc.js"

// Test data fixtures
const mockTxHash = "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
const mockBlockHash = "00000000000000000001234567890abcdef1234567890abcdef1234567890abc"

// Mock server setup
const BITCOIN_RPC_URL = "https://rpc.testnet.example.com"

const server = setupServer(
  http.post(BITCOIN_RPC_URL, async ({ request }) => {
    const body = (await request.json()) as {
      method: string
      params?: unknown[]
    }

    if (body.method === "getrawtransaction") {
      const [txid] = (body.params ?? []) as [string]
      if (txid === mockTxHash) {
        return HttpResponse.json({
          jsonrpc: "2.0",
          id: "1",
          result: {
            blockhash: mockBlockHash,
            height: 800000,
            hex: "0200000001abcdef1234567890",
            vout: [{ n: 0, value: 0.005 }],
          },
        })
      }

      return HttpResponse.json({
        jsonrpc: "2.0",
        id: "1",
        error: { code: -5, message: "No such mempool or blockchain transaction" },
      })
    }

    if (body.method === "getblock") {
      return HttpResponse.json({
        jsonrpc: "2.0",
        id: "1",
        result: {
          tx: [mockTxHash, "b".repeat(64)],
          height: 800000,
        },
      })
    }

    return HttpResponse.json({ jsonrpc: "2.0", id: "1", result: null })
  }),
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe("UtxoRpcClient", () => {
  const client = new UtxoRpcClient({ url: BITCOIN_RPC_URL, chain: ChainKind.Btc })

  describe("getTransaction", () => {
    it("should fetch transaction details", async () => {
      const tx = await client.getTransaction(mockTxHash)

      expect(tx.blockhash).toBe(mockBlockHash)
      expect(tx.hex).toBe("0200000001abcdef1234567890")
      expect(tx.vout).toHaveLength(1)
    })

    it("should throw error for non-existent transaction", async () => {
      await expect(client.getTransaction("0".repeat(64))).rejects.toThrow(
        "UTXO RPC error: No such mempool or blockchain transaction",
      )
    })
  })

  describe("getBlock", () => {
    it("should fetch block details", async () => {
      const block = await client.getBlock(mockBlockHash)

      expect(block.tx).toContain(mockTxHash)
      expect(block.height).toBe(800000)
    })
  })

  describe("buildDepositProof", () => {
    it("should build deposit proof for confirmed transaction", async () => {
      const proof = await client.buildDepositProof(mockTxHash, 0)

      expect(proof.tx_block_blockhash).toBe(mockBlockHash)
      expect(proof.amount).toBe(500000n) // 0.005 BTC in satoshis
      expect(proof.tx_index).toBe(0)
      expect(proof.tx_bytes.length).toBeGreaterThan(0)
      expect(proof.merkle_proof.length).toBeGreaterThan(0)
    })

    it("should throw for unconfirmed transaction", async () => {
      server.use(
        http.post(BITCOIN_RPC_URL, async ({ request }) => {
          const body = (await request.json()) as { method: string }
          if (body.method === "getrawtransaction") {
            return HttpResponse.json({
              jsonrpc: "2.0",
              id: "1",
              result: {
                hex: "0200000001abcdef",
                vout: [{ n: 0, value: 0.001 }],
                // No blockhash = unconfirmed
              },
            })
          }
          return HttpResponse.json({ jsonrpc: "2.0", id: "1", result: null })
        }),
      )

      await expect(client.buildDepositProof(mockTxHash, 0)).rejects.toThrow(
        "UTXO: Transaction not confirmed",
      )
    })

    it("should throw for invalid vout", async () => {
      await expect(client.buildDepositProof(mockTxHash, 999)).rejects.toThrow(
        "UTXO: Output 999 not found in transaction",
      )
    })
  })

  describe("buildMerkleProof", () => {
    it("should build merkle proof for confirmed transaction", async () => {
      const proof = await client.buildMerkleProof(mockTxHash)

      expect(proof.block_height).toBe(800000)
      expect(proof.pos).toBe(0)
      expect(proof.merkle.length).toBeGreaterThan(0)
    })
  })

  describe("error handling", () => {
    it("should handle network errors", async () => {
      server.use(
        http.post(BITCOIN_RPC_URL, () => {
          return new HttpResponse("Internal Server Error", { status: 500 })
        }),
      )

      await expect(client.getTransaction(mockTxHash)).rejects.toThrow(/UTXO RPC request failed/)
    })

    it("should handle RPC errors", async () => {
      server.use(
        http.post(BITCOIN_RPC_URL, () => {
          return HttpResponse.json({
            jsonrpc: "2.0",
            id: "1",
            error: { code: -32603, message: "Internal error" },
          })
        }),
      )

      await expect(client.getTransaction(mockTxHash)).rejects.toThrow(/UTXO RPC error: Internal error/)
    })
  })
})

describe("buildBitcoinMerkleProof", () => {
  it("should build merkle proof for transaction in block", () => {
    const txids = [mockTxHash, "b".repeat(64), "c".repeat(64), "d".repeat(64)]
    const proof = buildBitcoinMerkleProof(txids, mockTxHash)

    expect(proof.index).toBe(0)
    expect(proof.merkle.length).toBeGreaterThan(0)
  })

  it("should throw for transaction not in block", () => {
    const txids = ["a".repeat(64), "b".repeat(64)]
    expect(() => buildBitcoinMerkleProof(txids, "c".repeat(64))).toThrow(
      "Transaction not found in block",
    )
  })
})
