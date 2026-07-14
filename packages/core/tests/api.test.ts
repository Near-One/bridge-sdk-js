import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { BridgeAPI } from "../src/api.js"

const api = new BridgeAPI("testnet")
const BASE_URL = "https://testnet.api.bridge.nearone.org"

// Mock data
const mockTransfer = {
  transfer_id: { type: "nonce", chain: "Eth", nonce: 123 },
  origin_chain: "Eth",
  destination_chain: "Near",
  sender: "eth:0xsender",
  recipient: "near:recipient.near",
  token_id: "eth:0xtoken",
  amount: "1000000",
  fee: "1000",
  native_fee: "2000",
  msg: "test transfer",
  status: "Initialised",
  initialised: {
    transaction_hash: "0x123...",
    chain: "Eth",
    timestamp_seconds: 1234567890,
    details: { type: "evm", block_number: 1000, transaction_index: 1, log_index: 2 },
  },
  signed: [],
  fee_updates: [],
  utxo_signs: [],
  tx_ids: ["0x123..."],
}

// The SDK normalizes omitted optional fields to null
const normalizedTransfer = {
  ...mockTransfer,
  destination_nonce: null,
  fast_finalised_on_near: null,
  finalised_on_near: null,
  fast_finalised: null,
  finalised: null,
  claimed: null,
  verified: null,
  utxo_winning_tx_hash: null,
  utxo_meta: null,
}

const mockStarknetTransfer = {
  transfer_id: { type: "nonce", chain: "Strk", nonce: 456 },
  origin_chain: "Strk",
  destination_chain: "Near",
  status: "Initialised",
  initialised: {
    transaction_hash: "0xstarknettx",
    chain: "Strk",
    timestamp_seconds: 1730000000,
    details: { type: "starknet", block_number: 100, event_index: 0 },
  },
  signed: [],
  fee_updates: [],
  utxo_signs: [],
  tx_ids: ["0xstarknettx"],
}

const normalizedStarknetTransfer = {
  ...mockStarknetTransfer,
  sender: null,
  recipient: null,
  token_id: null,
  amount: null,
  fee: null,
  native_fee: null,
  msg: null,
  destination_nonce: null,
  fast_finalised_on_near: null,
  finalised_on_near: null,
  fast_finalised: null,
  finalised: null,
  claimed: null,
  verified: null,
  utxo_winning_tx_hash: null,
  utxo_meta: null,
}

const mockFee = {
  native_token_fee: 5000,
  gas_fee: null,
  protocol_fee: null,
  usd_fee: 1.5,
  transferred_token_fee: "500",
  insufficient_utxo: false,
}
const normalizedFee = {
  native_token_fee: BigInt(5000),
  gas_fee: null,
  protocol_fee: null,
  usd_fee: 1.5,
  transferred_token_fee: "500",
  insufficient_utxo: false,
}

const mockAllowlistedTokens = {
  allowlisted_tokens: {
    "eth.sepolia.testnet": "eth:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    "nbtc.n-bridge.testnet": "near:wrap.near",
    "wrap.testnet": "near:wrap.near",
    "milam-ft.dev-1670602093214-42636269062771": "near:wrap.near",
    "oats.testnet": "near:wrap.near",
  },
}

const mockBtcAddress = {
  address: "tb1qssh0ejglq0v53pwrsxlhxpxw29gfu6c4ls9eyy",
}

const restHandlers = [
  http.get(`${BASE_URL}/api/v4/transfers/transfer/status`, () => {
    return HttpResponse.json({ statuses: ["Initialised"] })
  }),
  http.get(`${BASE_URL}/api/v4/transfers/transfer`, () => {
    return HttpResponse.json({ transfers: [mockTransfer] })
  }),
  http.get(`${BASE_URL}/api/v3/transfer-fee`, () => {
    return HttpResponse.json(mockFee)
  }),
  http.get(`${BASE_URL}/api/v4/transfers`, () => {
    return HttpResponse.json({ transfers: [mockTransfer] })
  }),
  http.get(`${BASE_URL}/api/v3/transfer-fee/allowlisted-tokens`, () => {
    return HttpResponse.json(mockAllowlistedTokens)
  }),
  http.post(`${BASE_URL}/api/v3/utxo/get_user_deposit_address`, () => {
    return HttpResponse.json(mockBtcAddress)
  }),
]

const server = setupServer(...restHandlers)
beforeAll(() => server.listen())
afterAll(() => server.close())
afterEach(() => server.resetHandlers())

describe("BridgeAPI", () => {
  describe("getTransferStatus", () => {
    it("should fetch transfer status successfully", async () => {
      const status = await api.getTransferStatus({ originChain: "Eth", originNonce: 123 })
      expect(status).toEqual(["Initialised"])
    })

    it("should handle transaction hash parameter", async () => {
      const status = await api.getTransferStatus({ transactionHash: "0x123..." })
      expect(status).toEqual(["Initialised"])
    })

    it("should accept new chain enums", async () => {
      const status = await api.getTransferStatus({ originChain: "HlEvm", originNonce: 123 })
      expect(status).toEqual(["Initialised"])
    })

    it("should return Settled status", async () => {
      server.use(
        http.get(`${BASE_URL}/api/v4/transfers/transfer/status`, () => {
          return HttpResponse.json({ statuses: ["Settled"] })
        }),
      )

      const status = await api.getTransferStatus({ originChain: "Eth", originNonce: 123 })
      expect(status).toEqual(["Settled"])
    })

    it("should send UTXO ref lookup params", async () => {
      let requestUrl: URL | undefined
      server.use(
        http.get(`${BASE_URL}/api/v4/transfers/transfer/status`, ({ request }) => {
          requestUrl = new URL(request.url)
          return HttpResponse.json({ statuses: ["Settled"] })
        }),
      )

      const status = await api.getTransferStatus({
        utxoChain: "Btc",
        utxoTxHash: "btc_txid",
        utxoVout: 1,
      })
      expect(status).toEqual(["Settled"])
      expect(requestUrl?.searchParams.get("utxo_chain")).toBe("Btc")
      expect(requestUrl?.searchParams.get("utxo_tx_hash")).toBe("btc_txid")
      expect(requestUrl?.searchParams.get("utxo_vout")).toBe("1")
    })

    it("should pass through unrecognized statuses", async () => {
      server.use(
        http.get(`${BASE_URL}/api/v4/transfers/transfer/status`, () => {
          return HttpResponse.json({ statuses: ["Refunded"] })
        }),
      )

      const status = await api.getTransferStatus({ originChain: "Eth", originNonce: 123 })
      expect(status).toEqual(["Refunded"])
    })

    it("should handle 404 error", async () => {
      server.use(
        http.get(`${BASE_URL}/api/v4/transfers/transfer/status`, () => {
          return new HttpResponse(null, { status: 404 })
        }),
      )

      await expect(api.getTransferStatus({ originChain: "Eth", originNonce: 123 })).rejects.toThrow(
        "Resource not found",
      )
    })
  })

  describe("getFee", () => {
    it("should fetch fee successfully with string amount", async () => {
      const fee = await api.getFee(
        "near:sender.near",
        "near:recipient.near",
        "near:token.near",
        "1000000",
      )
      expect(fee).toEqual(normalizedFee)
    })

    it("should fetch fee successfully with bigint amount", async () => {
      const fee = await api.getFee(
        "near:sender.near",
        "near:recipient.near",
        "near:token.near",
        1000000n,
      )
      expect(fee).toEqual(normalizedFee)
    })

    it("should handle missing parameters", async () => {
      server.use(
        http.get(`${BASE_URL}/api/v3/transfer-fee`, () => {
          return new HttpResponse(null, { status: 400 })
        }),
      )

      await expect(
        api.getFee("near:sender.near", "near:recipient.near", "near:token.near", "1000000"),
      ).rejects.toThrow("API request failed")
    })
  })

  describe("getTransfer", () => {
    it("should fetch single transfer successfully", async () => {
      const transfers = await api.getTransfer({ originChain: "Eth", originNonce: 123 })
      expect(transfers).toEqual([normalizedTransfer])
    })

    it("should fetch transfer by transaction hash", async () => {
      const transfers = await api.getTransfer({ transactionHash: "0x123..." })
      expect(transfers).toEqual([normalizedTransfer])
    })

    it("should parse Starknet transaction payloads", async () => {
      server.use(
        http.get(`${BASE_URL}/api/v4/transfers/transfer`, () => {
          return HttpResponse.json({ transfers: [mockStarknetTransfer] })
        }),
      )

      const transfers = await api.getTransfer({ originChain: "Strk", originNonce: 456 })
      expect(transfers).toEqual([normalizedStarknetTransfer])
    })
  })

  describe("findTransfers", () => {
    it("should fetch transfers list successfully", async () => {
      const transfers = await api.findTransfers({ sender: "near:sender.near" })
      expect(transfers).toEqual([normalizedTransfer])
    })

    it("should handle pagination parameters", async () => {
      const transfers = await api.findTransfers({
        sender: "near:sender.near",
        limit: 10,
        offset: 5,
      })
      expect(transfers).toEqual([normalizedTransfer])
    })
  })

  describe("getAllowlistedTokens", () => {
    it("should fetch allowlisted tokens successfully", async () => {
      const tokens = await api.getAllowlistedTokens()
      expect(tokens).toEqual({
        "eth.sepolia.testnet": "eth:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        "nbtc.n-bridge.testnet": "near:wrap.near",
        "wrap.testnet": "near:wrap.near",
        "milam-ft.dev-1670602093214-42636269062771": "near:wrap.near",
        "oats.testnet": "near:wrap.near",
      })
    })

    it("should handle API errors", async () => {
      server.use(
        http.get(`${BASE_URL}/api/v3/transfer-fee/allowlisted-tokens`, () => {
          return new HttpResponse(null, { status: 500 })
        }),
      )

      await expect(api.getAllowlistedTokens()).rejects.toThrow("API request failed")
    })
  })

  describe("getUtxoDepositAddress", () => {
    it("should fetch BTC deposit address successfully", async () => {
      const response = await api.getUtxoDepositAddress("btc", "recipient.near")
      expect(response).toEqual({
        address: "tb1qssh0ejglq0v53pwrsxlhxpxw29gfu6c4ls9eyy",
      })
    })

    it("should handle safe_deposit parameter", async () => {
      const response = await api.getUtxoDepositAddress("btc", "recipient.near", {
        msg: "safe deposit message",
      })
      expect(response).toEqual({
        address: "tb1qssh0ejglq0v53pwrsxlhxpxw29gfu6c4ls9eyy",
      })
    })

    it("should handle API errors", async () => {
      server.use(
        http.post(`${BASE_URL}/api/v3/utxo/get_user_deposit_address`, () => {
          return new HttpResponse(null, { status: 404 })
        }),
      )

      await expect(api.getUtxoDepositAddress("btc", "recipient.near")).rejects.toThrow(
        "Resource not found",
      )
    })
  })
})
