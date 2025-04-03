import { beforeEach, describe, expect, it } from "vitest"
import { OmniBridgeAPI } from "../../src/api"
import { setNetwork } from "../../src/config"
import { ChainKind, type OmniAddress } from "../../src/types"
import { omniAddress } from "../../src/utils"

describe("OmniBridgeAPI Integration Tests", () => {
  let api: OmniBridgeAPI

  beforeEach(() => {
    setNetwork("mainnet")
    api = new OmniBridgeAPI()
  })

  describe("getFee", () => {
    it("should fetch real fee information", async () => {
      const sender: OmniAddress = omniAddress(ChainKind.Near, "bridge-sender.near")
      const recipient: OmniAddress = omniAddress(
        ChainKind.Eth,
        "0x000000F8637F1731D906643027c789EFA60BfE11",
      )
      const tokenAddress: OmniAddress = "near:warp.near"

      const fee = await api.getFee(sender, recipient, tokenAddress)

      // Check structure and types
      expect(fee).toEqual({
        native_token_fee: expect.toBeOneOf([expect.any(BigInt), null]),
        transferred_token_fee: expect.toBeOneOf([expect.any(BigInt), null]),
        usd_fee: expect.any(Number),
      })

      // Check valid ranges
      if (fee.native_token_fee !== null) {
        expect(fee.native_token_fee >= 0n).toBe(true)
      }
      if (fee.transferred_token_fee !== null) {
        expect(fee.transferred_token_fee >= 0n).toBe(true)
      }
      expect(fee.usd_fee >= 0).toBe(true)
    })

    it("should handle real API errors gracefully", async () => {
      const sender: OmniAddress = omniAddress(ChainKind.Eth, "invalid")
      const recipient: OmniAddress = omniAddress(ChainKind.Sol, "invalid")
      const tokenAddress: OmniAddress = "near:invalid"

      await expect(api.getFee(sender, recipient, tokenAddress)).rejects.toThrow()
    })
  })
  describe("getTransferStatus", () => {
    it("should fetch status for a known transfer", async () => {
      const status = await api.getTransferStatus("Near", 1)
      expect(status).toMatchSnapshot()
    })

    it("should handle non-existent transfer", async () => {
      await expect(api.getTransferStatus("Eth", 999999999)).rejects.toThrow("Resource not found")
    })
  })
  describe("getTransfer", () => {
    it("should fetch transfer details for a known transfer", async () => {
      const transfer = await api.getTransfer("Near", 22)
      expect(transfer).toMatchSnapshot()
    })

    it("should handle non-existent transfer", async () => {
      await expect(api.getTransfer("Eth", 999999999)).rejects.toThrow("Resource not found")
    })
  })
  describe("findOmniTransfers", () => {
    it("should fetch transfers for a specific transaction", async () => {
      const txId = "DQM4d3B6Jxr4qnvGay4bpZ7aTQQogpUgQxVLAVWk5doF"
      const transfers = await api.findOmniTransfers({ transaction_id: txId })

      expect(transfers).toMatchSnapshot()
    })

    it("should fetch transfers for a specific sender", async () => {
      const sender = "near:frolik.near"
      const transfers = await api.findOmniTransfers({ sender })

      // Verify structure and pagination
      expect(transfers).toBeInstanceOf(Array)
      expect(transfers.length).toBeLessThanOrEqual(10)

      if (transfers.length > 0) {
        // Check first transfer structure
        const transfer = transfers[0]
        expect(transfer).toEqual({
          id: {
            origin_chain: expect.stringMatching(/^(Eth|Near|Sol|Arb|Base)$/),
            origin_nonce: expect.any(Number),
          },
          initialized: expect.any(Object),
          claimed: expect.toBeOneOf([expect.anything(), undefined, null]), // null or transaction object
          signed: expect.toBeOneOf([expect.anything(), undefined, null]), // null or transaction object
          finalised_on_near: expect.toBeOneOf([expect.anything(), undefined, null]), // null or transaction object
          finalised: expect.toBeOneOf([expect.anything(), undefined, null]), // null or transaction object
          transfer_message: {
            token: expect.any(String),
            amount: expect.any(BigInt),
            sender: expect.any(String),
            recipient: expect.any(String),
            fee: {
              fee: expect.any(BigInt),
              native_fee: expect.any(BigInt),
            },
            msg: expect.any(String),
          },
          updated_fee: expect.any(Array),
        })
      }
    })
  })
})
