import { http, HttpResponse } from "msw"
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
  merkle: [
    "hash1234567890abcdef",
    "hash2345678901bcdef0",
    "hash3456789012cdef01",
  ],
  pos: 42,
}

const mockNearBlocksResponse = {
  txns: [
    {
      transaction_hash: "near_tx_hash_123",
      included_in_block_hash: "near_block_hash",
      block_timestamp: "2024-01-01T00:00:00.000Z",
      signer_account_id: "relayer.testnet",
      receiver_account_id: "btc-connector.testnet",
      actions: [
        {
          action: "FunctionCall",
          method: "sign_btc_transaction",
          args: '{"btc_pending_id":"test_pending_123","sign_index":0}',
        },
      ],
    },
  ],
}

const mockUTXOs: UTXO[] = [
  {
    path: "m/44'/1'/0'/0/0",
    tx_bytes: new Uint8Array([0x02, 0x00, 0x00, 0x00]), // Mock transaction bytes
    vout: 0,
    balance: "100000",
    txid: "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123451",
  },
  {
    path: "m/44'/1'/0'/0/1",
    tx_bytes: new Uint8Array([0x02, 0x00, 0x00, 0x01]),
    vout: 1,
    balance: "50000",
    txid: "b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678",
  },
]

// Mock server setup
const server = setupServer(
  // Bitcoin API endpoints
  http.get(`https://blockstream.info/testnet/api/tx/${mockTxHash}/merkle-proof`, () => {
    return HttpResponse.json(mockMerkleProof)
  }),

  http.get(`https://blockstream.info/testnet/api/tx/${mockTxHash}`, () => {
    return HttpResponse.json(mockBitcoinTx)
  }),

  http.get(`https://blockstream.info/testnet/api/tx/${mockTxHash}/hex`, () => {
    return new HttpResponse("0200000001abcdef1234567890", {
      headers: { "Content-Type": "text/plain" },
    })
  }),

  http.post("https://blockstream.info/testnet/api/tx", () => {
    return new HttpResponse(mockTxHash, {
      headers: { "Content-Type": "text/plain" },
    })
  }),

  // NearBlocks API endpoint
  http.get("https://api-testnet.nearblocks.io/v1/account/cosmosfirst.testnet/receipts", () => {
    return HttpResponse.json(mockNearBlocksResponse)
  }),

  // Error cases
  http.get("https://blockstream.info/testnet/api/tx/invalid_hash/merkle-proof", () => {
    return new HttpResponse(null, { status: 404 })
  }),

  http.get("https://api-testnet.nearblocks.io/v1/account/nonexistent.testnet/receipts", () => {
    return new HttpResponse(null, { status: 404 })
  }),
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe("BitcoinService", () => {
  describe("constructor", () => {
    it("should create instance with correct network configuration", () => {
      const mainnetService = new BitcoinService("https://blockstream.info/api", "mainnet")
      const testnetService = new BitcoinService("https://blockstream.info/testnet/api", "testnet")

      expect(mainnetService).toBeInstanceOf(BitcoinService)
      expect(testnetService).toBeInstanceOf(BitcoinService)
    })
  })

  describe("getNetwork", () => {
    it("should return correct network configuration for mainnet", () => {
      const service = new BitcoinService("https://blockstream.info/api", "mainnet")
      const network = service.getNetwork()
      
      expect(network.bech32).toBe("bc")
      expect(network.pubKeyHash).toBe(0x00)
      expect(network.scriptHash).toBe(0x05)
    })

    it("should return correct network configuration for testnet", () => {
      const service = new BitcoinService("https://blockstream.info/testnet/api", "testnet")
      const network = service.getNetwork()
      
      expect(network.bech32).toBe("tb")
      expect(network.pubKeyHash).toBe(0x6f)
      expect(network.scriptHash).toBe(0xc4)
    })
  })

  describe("fetchMerkleProof", () => {
    const service = new BitcoinService("https://blockstream.info/testnet/api", "testnet")

    it("should fetch merkle proof successfully", async () => {
      const proof = await service.fetchMerkleProof(mockTxHash)
      
      expect(proof).toEqual(mockMerkleProof)
      expect(proof.block_height).toBe(800000)
      expect(proof.pos).toBe(42)
      expect(proof.merkle).toHaveLength(3)
    })

    it("should throw error for invalid transaction hash", async () => {
      await expect(service.fetchMerkleProof("invalid_hash")).rejects.toThrow(
        "Bitcoin: Failed to fetch merkle proof: Not Found"
      )
    })
  })

  describe("getTransaction", () => {
    const service = new BitcoinService("https://blockstream.info/testnet/api", "testnet")

    it("should fetch transaction details successfully", async () => {
      const tx = await service.getTransaction(mockTxHash)
      
      expect(tx).toEqual(mockBitcoinTx)
      expect(tx.txid).toBe(mockTxHash)
      expect(tx.status?.confirmed).toBe(true)
      expect(tx.status?.block_height).toBe(800000)
    })

    it("should throw error for invalid transaction hash", async () => {
      await expect(service.getTransaction("invalid_hash")).rejects.toThrow(
        "Bitcoin: Failed to fetch transaction:"
      )
    })
  })

  describe("getTransactionBytes", () => {
    const service = new BitcoinService("https://blockstream.info/testnet/api", "testnet")

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
    const service = new BitcoinService("https://blockstream.info/testnet/api", "testnet")

    it("should broadcast transaction successfully", async () => {
      const txHex = "0200000001abcdef1234567890"
      const result = await service.broadcastTransaction(txHex)
      
      expect(result).toBe(mockTxHash)
    })

    it("should throw error for invalid transaction", async () => {
      // Mock server will return error for this specific hex
      server.use(
        http.post("https://blockstream.info/testnet/api/tx", ({ request }) => {
          return new HttpResponse("Transaction decode failed", { status: 400 })
        })
      )

      await expect(service.broadcastTransaction("invalid_hex")).rejects.toThrow(
        "Bitcoin: Failed to broadcast transaction: Transaction decode failed"
      )
    })
  })

  describe("addressToScriptPubkey", () => {
    const testnetService = new BitcoinService("https://blockstream.info/testnet/api", "testnet")
    const mainnetService = new BitcoinService("https://blockstream.info/api", "mainnet")

    it("should convert P2PKH address to script_pubkey", () => {
      const address = "mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn" // Testnet P2PKH
      const script = testnetService.addressToScriptPubkey(address)
      
      expect(script).toBeInstanceOf(Uint8Array)
      expect(script.length).toBeGreaterThan(0)
    })

    it("should convert P2WPKH address to script_pubkey", () => {
      const address = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx" // Testnet P2WPKH
      const script = testnetService.addressToScriptPubkey(address)
      
      expect(script).toBeInstanceOf(Uint8Array)
      expect(script.length).toBeGreaterThan(0)
    })

    it("should work with mainnet addresses", () => {
      const address = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq" // Mainnet P2WPKH
      const script = mainnetService.addressToScriptPubkey(address)
      
      expect(script).toBeInstanceOf(Uint8Array)
      expect(script.length).toBeGreaterThan(0)
    })

    it("should throw error for invalid address", () => {
      expect(() => testnetService.addressToScriptPubkey("invalid_address")).toThrow(
        "Bitcoin: Failed to convert address to script_pubkey"
      )
    })

    it("should throw error for wrong network address", () => {
      const mainnetAddress = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
      expect(() => testnetService.addressToScriptPubkey(mainnetAddress)).toThrow(
        "Bitcoin: Failed to convert address to script_pubkey"
      )
    })
  })

  describe("selectCoins", () => {
    const service = new BitcoinService("https://blockstream.info/testnet/api", "testnet")

    it("should throw error when no UTXOs provided", () => {
      expect(() =>
        service.selectCoins(
          [], // Empty UTXO array
          BigInt(75000),
          "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
          "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
          10
        )
      ).toThrow("Bitcoin: No UTXOs available for transaction")
    })

    // Note: Full UTXO selection testing requires realistic transaction data
    // which is complex to mock. Integration tests will cover this functionality.
  })

  describe("findTransactionSigning", () => {
    const service = new BitcoinService("https://blockstream.info/testnet/api", "testnet")

    it("should find transaction signing for valid pending ID", async () => {
      const nearTxHash = await service.findTransactionSigning(
        "cosmosfirst.testnet",
        "test_pending_123"
      )
      
      expect(nearTxHash).toBe("near_tx_hash_123")
    })

    it("should throw error when pending ID not found", async () => {
      await expect(
        service.findTransactionSigning("cosmosfirst.testnet", "nonexistent_pending_id")
      ).rejects.toThrow("Bitcoin: Transaction signing not found for pending ID: nonexistent_pending_id")
    })

    it("should throw error for invalid signer account", async () => {
      await expect(
        service.findTransactionSigning("nonexistent.testnet", "test_pending_123")
      ).rejects.toThrow("Bitcoin: Failed to fetch transaction receipts: Not Found")
    })

    it("should work with mainnet URLs", async () => {
      const mainnetService = new BitcoinService("https://blockstream.info/api", "mainnet")
      
      // Mock mainnet NearBlocks response
      server.use(
        http.get("https://api.nearblocks.io/v1/account/satoshi-relayer.near/receipts", () => {
          return HttpResponse.json(mockNearBlocksResponse)
        })
      )

      const nearTxHash = await mainnetService.findTransactionSigning(
        "satoshi-relayer.near",
        "test_pending_123"
      )
      
      expect(nearTxHash).toBe("near_tx_hash_123")
    })
  })

  describe("error handling", () => {
    const service = new BitcoinService("https://blockstream.info/testnet/api", "testnet")

    it("should handle network errors gracefully", async () => {
      // Mock network error
      server.use(
        http.get("https://blockstream.info/testnet/api/tx/network_error/merkle-proof", () => {
          throw new Error("Network error")
        })
      )

      await expect(service.fetchMerkleProof("network_error")).rejects.toThrow()
    })

    it("should handle API rate limiting", async () => {
      server.use(
        http.get("https://blockstream.info/testnet/api/tx/rate_limited/merkle-proof", () => {
          return new HttpResponse("Too Many Requests", { status: 429 })
        })
      )

      await expect(service.fetchMerkleProof("rate_limited")).rejects.toThrow(
        "Bitcoin: Failed to fetch merkle proof: Too Many Requests"
      )
    })
  })
})