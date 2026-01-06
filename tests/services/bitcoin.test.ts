import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { BitcoinService } from "../../src/services/bitcoin.js"
import type { BitcoinTransaction, UTXO } from "../../src/types/bitcoin.js"

// Test data fixtures
const mockTxHash = "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
const mockBitcoinTx: BitcoinTransaction = {
  txid: mockTxHash,
  version: 2,
  locktime: 0,
  vin: [
    {
      txid: "input_tx_hash",
      vout: 0,
      scriptsig: "scriptSig",
      scriptsig_asm: "OP_PUSHBYTES_71 ...",
      witness: [],
      is_coinbase: false,
      sequence: 4294967295,
    },
  ],
  vout: [
    {
      scriptpubkey: "76a914...",
      scriptpubkey_asm: "OP_DUP OP_HASH160 OP_PUSHBYTES_20 ...",
      scriptpubkey_type: "p2pkh",
      scriptpubkey_address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
      value: 5000000000,
    },
  ],
  size: 250,
  weight: 1000,
  fee: 1000,
  status: {
    confirmed: true,
    block_height: 800000,
    block_hash: "00000000000000000001234567890abcdef1234567890abcdef1234567890abc",
    block_time: 1640995200,
  },
}

const mockMerkleProof = {
  block_height: 800000,
  merkle: ["1111111111111111111111111111111111111111111111111111111111111111"],
  pos: 0,
}

// Mock server setup
const BITCOIN_RPC_URL = "https://rpc.testnet.example.com"
const BITCOIN_API_URL = "https://btc.example.com/testnet/api"
const BITCOIN_MAINNET_API_URL = "https://btc.example.com/mainnet/api"

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
            blockhash: mockBitcoinTx.status?.block_hash,
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

  // Bitcoin API endpoints
  http.get(`${BITCOIN_API_URL}/tx/${mockTxHash}/merkle-proof`, () => {
    return HttpResponse.json(mockMerkleProof)
  }),

  http.get(`${BITCOIN_API_URL}/tx/${mockTxHash}`, () => {
    return HttpResponse.json(mockBitcoinTx)
  }),

  http.get(`${BITCOIN_API_URL}/tx/${mockTxHash}/hex`, () => {
    return new HttpResponse("0200000001abcdef1234567890", {
      headers: { "Content-Type": "text/plain" },
    })
  }),

  http.post(`${BITCOIN_API_URL}/tx`, () => {
    return new HttpResponse(mockTxHash, {
      headers: { "Content-Type": "text/plain" },
    })
  }),

  // Error cases
  http.get(`${BITCOIN_API_URL}/tx/invalid_hash/merkle-proof`, () => {
    return new HttpResponse(null, { status: 404 })
  }),

  http.get(`${BITCOIN_API_URL}/tx/invalid_hash`, () => {
    return new HttpResponse(null, { status: 404 })
  }),
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe("BitcoinService", () => {
  describe("constructor", () => {
    it("should create instance with correct network configuration", () => {
      const mainnetService = new BitcoinService(BITCOIN_MAINNET_API_URL, "mainnet")
      const testnetService = new BitcoinService(BITCOIN_API_URL, "testnet")

      expect(mainnetService).toBeInstanceOf(BitcoinService)
      expect(testnetService).toBeInstanceOf(BitcoinService)
    })
  })

  describe("fetchMerkleProof", () => {
    const service = new BitcoinService(BITCOIN_API_URL, "testnet", { url: BITCOIN_RPC_URL })

    it("should fetch merkle proof successfully", async () => {
      const proof = await service.fetchMerkleProof(mockTxHash)

      expect(proof.block_height).toBe(800000)
      expect(proof.pos).toBe(0)
      expect(Array.isArray(proof.merkle)).toBe(true)
      expect(proof.merkle.length).toBeGreaterThan(0)
    })

    it("should throw error for invalid transaction hash", async () => {
      const missingTx = "0".repeat(64)
      await expect(service.fetchMerkleProof(missingTx)).rejects.toThrow(
        "UTXO RPC error: No such mempool or blockchain transaction",
      )
    })
  })

  describe("getDepositProof", () => {
    const service = new BitcoinService(BITCOIN_API_URL, "testnet", { url: BITCOIN_RPC_URL })

    it("should build deposit proof via RPC", async () => {
      const proof = await service.getDepositProof(mockTxHash, 0)

      expect(proof.tx_block_blockhash).toBe(mockBitcoinTx.status?.block_hash)
      expect(proof.amount).toBe(500000n)
      expect(proof.tx_index).toBe(0)
      expect(proof.tx_bytes.length).toBeGreaterThan(0)
      expect(proof.merkle_proof.length).toBeGreaterThan(0)
    })

    it("should surface RPC errors when node call fails", async () => {
      server.use(
        http.post(BITCOIN_RPC_URL, async ({ request }) => {
          const body = (await request.json()) as { method?: string } | null
          if (body && body.method === "getrawtransaction") {
            return HttpResponse.json({
              jsonrpc: "2.0",
              id: "1",
              error: { code: -32603, message: "Internal error" },
            })
          }
          return HttpResponse.json({ jsonrpc: "2.0", id: "1", result: null })
        }),
      )

      await expect(service.getDepositProof(mockTxHash, 0)).rejects.toThrow(
        /UTXO RPC error: Internal error/,
      )
    })
  })

  describe("getTransaction", () => {
    const service = new BitcoinService(BITCOIN_API_URL, "testnet")

    it("should fetch transaction details successfully", async () => {
      const tx = await service.getTransaction(mockTxHash)

      expect(tx).toEqual(mockBitcoinTx)
      expect(tx.txid).toBe(mockTxHash)
      expect(tx.status?.confirmed).toBe(true)
      expect(tx.status?.block_height).toBe(800000)
    })

    it("should throw error for invalid transaction hash", async () => {
      await expect(service.getTransaction("invalid_hash")).rejects.toThrow(
        "Bitcoin: Failed to fetch transaction:",
      )
    })
  })

  describe("getTransactionBytes", () => {
    const service = new BitcoinService(BITCOIN_API_URL, "testnet")

    it("should fetch and decode transaction bytes", async () => {
      const bytes = await service.getTransactionBytes(mockTxHash)

      expect(bytes).toBeInstanceOf(Uint8Array)
      expect(bytes.length).toBeGreaterThan(0)
      // First two bytes should be version (0x0200 = version 2)
      expect(bytes[0]).toBe(0x02)
      expect(bytes[1]).toBe(0x00)
    })
  })

  describe("broadcastTransaction", () => {
    const service = new BitcoinService(BITCOIN_API_URL, "testnet")

    it("should broadcast transaction successfully", async () => {
      const txHex = "0200000001abcdef1234567890"
      const result = await service.broadcastTransaction(txHex)

      expect(result).toBe(mockTxHash)
    })

    it("should throw error for invalid transaction", async () => {
      // Mock server will return error for this specific hex
      server.use(
        http.post(`${BITCOIN_API_URL}/tx`, () => {
          return new HttpResponse("Transaction decode failed", { status: 400 })
        }),
      )

      await expect(service.broadcastTransaction("invalid_hex")).rejects.toThrow(
        "Bitcoin: Failed to broadcast transaction: Transaction decode failed",
      )
    })
  })

  describe("addressToScriptPubkey", () => {
    const testnetService = new BitcoinService(BITCOIN_API_URL, "testnet")
    const mainnetService = new BitcoinService(BITCOIN_MAINNET_API_URL, "mainnet")

    it("should convert P2PKH address to script_pubkey", () => {
      const address = "mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn" // Testnet P2PKH
      const script = testnetService.addressToScriptPubkey(address)

      expect(typeof script).toBe("string")
      expect(script.length).toBeGreaterThan(0)
    })

    it("should convert P2WPKH address to script_pubkey", () => {
      const address = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx" // Testnet P2WPKH
      const script = testnetService.addressToScriptPubkey(address)

      expect(typeof script).toBe("string")
      expect(script.length).toBeGreaterThan(0)
    })

    it("should work with mainnet addresses", () => {
      const address = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq" // Mainnet P2WPKH
      const script = mainnetService.addressToScriptPubkey(address)

      expect(typeof script).toBe("string")
      expect(script.length).toBeGreaterThan(0)
    })

    it("should throw error for invalid address", () => {
      expect(() => testnetService.addressToScriptPubkey("invalid_address")).toThrow(
        "Bitcoin: Failed to convert address to script_pubkey",
      )
    })

    it("should throw error for wrong network address", () => {
      const mainnetAddress = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
      expect(() => testnetService.addressToScriptPubkey(mainnetAddress)).toThrow(
        "Bitcoin: Failed to convert address to script_pubkey",
      )
    })
  })

  describe("buildWithdrawalPlan", () => {
    const service = new BitcoinService(BITCOIN_API_URL, "testnet")

    it("should throw error when no UTXOs provided", () => {
      expect(() =>
        service.buildWithdrawalPlan(
          [],
          75_000n,
          "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
          "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
          10,
        ),
      ).toThrow("Bitcoin: No UTXOs available for transaction")
    })

    it("should plan outputs with change when sufficient balance exists", () => {
      const utxos: UTXO[] = [
        {
          path: "m/44'/1'/0'/0/0",
          tx_bytes: new Uint8Array([2, 0, 0, 0]),
          vout: 0,
          balance: "50000",
          txid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ]

      const targetAddress = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"

      const plan = service.buildWithdrawalPlan(utxos, 40_000n, targetAddress, targetAddress, 2)

      expect(plan.inputs).toEqual([
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:0",
      ])
      expect(plan.outputs).toEqual([
        expect.objectContaining({ value: 40000, script_pubkey: expect.any(String) }),
        expect.objectContaining({ script_pubkey: expect.any(String) }),
      ])
      expect(plan.fee).toBe(280n)
    })

    it("should absorb dust change into the transaction fee", () => {
      const utxos: UTXO[] = [
        {
          path: "m/44'/1'/0'/0/0",
          tx_bytes: new Uint8Array([2, 0, 0, 0]),
          vout: 0,
          balance: "50000",
          txid: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      ]

      const plan = service.buildWithdrawalPlan(
        utxos,
        48_900n,
        "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
        "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
        2,
      )

      expect(plan.outputs).toHaveLength(1)
      expect(plan.fee).toBe(1_100n)
    })

    it("should respect override constraints", () => {
      const utxos: UTXO[] = [
        {
          path: "m/44'/1'/0'/0/0",
          tx_bytes: new Uint8Array([2, 0, 0, 0]),
          vout: 0,
          balance: "70000",
          txid: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        },
        {
          path: "m/44'/1'/0'/0/1",
          // Provide tx bytes as array to ensure normalization handles it
          tx_bytes: new Uint8Array([2, 0, 0, 1]),
          vout: 1,
          balance: "70000",
          txid: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        },
      ]

      expect(() =>
        service.buildWithdrawalPlan(
          utxos,
          120_000n,
          "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
          "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
          1,
          { maxInputs: 1 },
        ),
      ).toThrow("Exceeded maximum input count of 1")

      const relaxedPlan = service.buildWithdrawalPlan(
        utxos,
        120_000n,
        "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
        "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
        1,
        { dustThreshold: 200n, minChange: 200n },
      )

      expect(relaxedPlan.outputs.length).toBeGreaterThan(0)
      expect(relaxedPlan.inputs).toEqual([
        "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc:0",
        "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:1",
      ])
    })
  })

  describe("error handling", () => {
    const service = new BitcoinService(BITCOIN_API_URL, "testnet", { url: BITCOIN_RPC_URL })

    it("should handle network errors gracefully", async () => {
      // Mock RPC network error
      server.use(
        http.post(BITCOIN_RPC_URL, () => {
          return new HttpResponse("Internal Server Error", {
            status: 500,
            statusText: "Internal Server Error",
          })
        }),
      )

      await expect(service.fetchMerkleProof("3".repeat(64))).rejects.toThrow(
        /UTXO RPC request failed/,
      )
    })

    it("should handle API rate limiting", async () => {
      server.use(
        http.post(BITCOIN_RPC_URL, async ({ request }) => {
          const body = (await request.json()) as { method?: string }
          if (body.method === "getrawtransaction") {
            return HttpResponse.json({
              jsonrpc: "2.0",
              id: "1",
              error: { code: -429, message: "Too Many Requests" },
            })
          }
          return HttpResponse.json({ jsonrpc: "2.0", id: "1", result: null })
        }),
      )

      await expect(service.fetchMerkleProof("2".repeat(64))).rejects.toThrow(
        /UTXO RPC error: Too Many Requests/,
      )
    })
  })
})
