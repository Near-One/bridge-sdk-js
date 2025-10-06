import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { OmniBridgeAPI } from "../src/api.js"
import { setNetwork } from "../src/config.js"

setNetwork("testnet")
const api = new OmniBridgeAPI()
const BASE_URL = "https://testnet.api.bridge.nearone.org"

// Mock data
const mockTransfer = {
  id: {
    origin_chain: "Eth",
    origin_nonce: 123,
  },
  initialized: {
    EVMLog: {
      block_height: 1000,
      block_timestamp_seconds: 1234567890,
      transaction_hash: "0x123...",
    },
  },
  signed: null,
  fast_finalised_on_near: null,
  finalised_on_near: null,
  fast_finalised: null,
  finalised: null,
  claimed: null,
  transfer_message: {
    token: "token.near",
    amount: 1000000,
    sender: "sender.near",
    recipient: "recipient.near",
    fee: {
      fee: 1000,
      native_fee: 2000,
    },
    msg: "test transfer",
  },
  updated_fee: [],
  utxo_transfer: null,
}

const normalizedTransfer = {
  ...mockTransfer,
  transfer_message: {
    ...mockTransfer.transfer_message,
    amount: BigInt(mockTransfer.transfer_message.amount),
    fee: {
      fee: BigInt(mockTransfer.transfer_message.fee.fee),
      native_fee: BigInt(mockTransfer.transfer_message.fee.native_fee),
    },
  },
}

const mockFee = {
  native_token_fee: 1000,
  transferred_token_fee: 2000,
  usd_fee: 1.5,
}
const normalizedFee = {
  native_token_fee: BigInt(1000),
  transferred_token_fee: BigInt(2000),
  usd_fee: 1.5,
}

const mockAllowlistedTokens = {
  allowlisted_tokens: {
    "eth.sepolia.testnet": "eth:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    "nbtc-dev.testnet": "near:wrap.near",
    "wrap.testnet": "near:wrap.near",
    "milam-ft.dev-1670602093214-42636269062771": "near:wrap.near",
    "oats.testnet": "near:wrap.near",
  },
}

const mockBtcAddress = {
  address: "tb1qssh0ejglq0v53pwrsxlhxpxw29gfu6c4ls9eyy",
}

const restHandlers = [
  http.get(`${BASE_URL}/api/v2/transfers/transfer/status`, () => {
    return HttpResponse.json(["Initialized"])
  }),
  http.get(`${BASE_URL}/api/v2/transfers/transfer`, () => {
    return HttpResponse.json([mockTransfer])
  }),
  http.get(`${BASE_URL}/api/v2/transfer-fee`, () => {
    return HttpResponse.json(mockFee)
  }),
  http.get(`${BASE_URL}/api/v2/transfers`, () => {
    return HttpResponse.json([mockTransfer])
  }),
  http.get(`${BASE_URL}/api/v2/transfer-fee/allowlisted-tokens`, () => {
    return HttpResponse.json(mockAllowlistedTokens)
  }),
  http.post(`${BASE_URL}/api/v2/utxo/get_user_deposit_address`, () => {
    return HttpResponse.json(mockBtcAddress)
  }),
]

const server = setupServer(...restHandlers)
beforeAll(() => server.listen())
afterAll(() => server.close())
afterEach(() => server.resetHandlers())

describe("OmniBridgeAPI", () => {
  describe("getTransferStatus", () => {
    it("should fetch transfer status successfully", async () => {
      const status = await api.getTransferStatus({ originChain: "Eth", originNonce: 123 })
      expect(status).toEqual(["Initialized"])
    })

    it("should handle transaction hash parameter", async () => {
      const status = await api.getTransferStatus({ transactionHash: "0x123..." })
      expect(status).toEqual(["Initialized"])
    })

    it("should handle 404 error", async () => {
      server.use(
        http.get(`${BASE_URL}/api/v2/transfers/transfer/status`, () => {
          return new HttpResponse(null, { status: 404 })
        }),
      )

      await expect(api.getTransferStatus({ originChain: "Eth", originNonce: 123 })).rejects.toThrow(
        "Resource not found",
      )
    })
  })

  describe("getFee", () => {
    it("should fetch fee successfully", async () => {
      const fee = await api.getFee("near:sender.near", "near:recipient.near", "near:token.near")
      expect(fee).toEqual(normalizedFee)
    })

    it("should handle missing parameters", async () => {
      server.use(
        http.get(`${BASE_URL}/api/v2/transfer-fee`, () => {
          return new HttpResponse(null, { status: 400 })
        }),
      )

      await expect(
        api.getFee("near:sender.near", "near:recipient.near", "near:token.near"),
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
  })

  describe("findOmniTransfers", () => {
    it("should fetch transfers list successfully", async () => {
      const transfers = await api.findOmniTransfers({ sender: "near:sender.near" })
      expect(transfers).toEqual([normalizedTransfer])
    })

    it("should handle pagination parameters", async () => {
      const transfers = await api.findOmniTransfers({
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
        "nbtc-dev.testnet": "near:wrap.near",
        "wrap.testnet": "near:wrap.near",
        "milam-ft.dev-1670602093214-42636269062771": "near:wrap.near",
        "oats.testnet": "near:wrap.near",
      })
    })

    it("should handle API errors", async () => {
      server.use(
        http.get(`${BASE_URL}/api/v2/transfer-fee/allowlisted-tokens`, () => {
          return new HttpResponse(null, { status: 500 })
        }),
      )

      await expect(api.getAllowlistedTokens()).rejects.toThrow("API request failed")
    })
  })

  describe("getUtxoUserDepositAddress", () => {
    it("should fetch BTC deposit address successfully", async () => {
      const response = await api.getUtxoUserDepositAddress("btc", "recipient.near")
      expect(response).toEqual({
        address: "tb1qssh0ejglq0v53pwrsxlhxpxw29gfu6c4ls9eyy",
      })
    })

    it("should handle post actions parameter", async () => {
      const postActions = [
        {
          receiver_id: "receiver.near",
          amount: "1000000000000000000000000",
          msg: "test message",
        },
      ]
      const response = await api.getUtxoUserDepositAddress(
        "btc",
        "recipient.near",
        postActions,
        "extra message",
      )
      expect(response).toEqual({
        address: "tb1qssh0ejglq0v53pwrsxlhxpxw29gfu6c4ls9eyy",
      })
    })

    it("should handle API errors", async () => {
      server.use(
        http.post(`${BASE_URL}/api/v2/utxo/get_user_deposit_address`, () => {
          return new HttpResponse(null, { status: 404 })
        }),
      )

      await expect(api.getUtxoUserDepositAddress("btc", "recipient.near")).rejects.toThrow(
        "Resource not found",
      )
    })
  })
})
