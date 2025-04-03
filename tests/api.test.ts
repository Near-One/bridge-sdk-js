import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { OmniBridgeAPI } from "../src/api"
import { setNetwork } from "../src/config"

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
  finalised_on_near: null,
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

const restHandlers = [
  http.get(`${BASE_URL}/api/v1/transfers/transfer/status`, () => {
    return HttpResponse.json("Initialized")
  }),
  http.get(`${BASE_URL}/api/v1/transfers/transfer`, () => {
    return HttpResponse.json(mockTransfer)
  }),
  http.get(`${BASE_URL}/api/v1/transfer-fee`, () => {
    return HttpResponse.json(mockFee)
  }),
  http.get(`${BASE_URL}/api/v1/transfers`, () => {
    return HttpResponse.json([mockTransfer])
  }),
]

const server = setupServer(...restHandlers)
beforeAll(() => server.listen())
afterAll(() => server.close())
afterEach(() => server.resetHandlers())

describe("OmniBridgeAPI", () => {
  describe("getTransferStatus", () => {
    it("should fetch transfer status successfully", async () => {
      const status = await api.getTransferStatus("Eth", 123)
      expect(status).toBe("Initialized")
    })

    it("should handle 404 error", async () => {
      server.use(
        http.get(`${BASE_URL}/api/v1/transfers/transfer/status`, () => {
          return new HttpResponse(null, { status: 404 })
        }),
      )

      await expect(api.getTransferStatus("Eth", 123)).rejects.toThrow("Resource not found")
    })
  })

  describe("getFee", () => {
    it("should fetch fee successfully", async () => {
      const fee = await api.getFee("near:sender.near", "near:recipient.near", "near:token.near")
      expect(fee).toEqual(normalizedFee)
    })

    it("should handle missing parameters", async () => {
      server.use(
        http.get(`${BASE_URL}/api/v1/transfer-fee`, () => {
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
      const transfer = await api.getTransfer("Eth", 123)
      expect(transfer).toEqual(normalizedTransfer)
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
})
