import { beforeEach, describe, expect, it } from "vitest"
import { OmniBridgeAPI } from "../../src/api"
import { setNetwork } from "../../src/config"
import { ChainKind, type OmniAddress } from "../../src/types"
import { omniAddress } from "../../src/utils"

describe("OmniBridgeAPI Integration Tests", () => {
  let api: OmniBridgeAPI

  beforeEach(() => {
    setNetwork("testnet")
    api = new OmniBridgeAPI()
  })

  describe("getFee", () => {
    it("should fetch real fee information", async () => {
      const sender: OmniAddress = omniAddress(ChainKind.Near, "bridge-sender.testnet")
      const recipient: OmniAddress = omniAddress(
        ChainKind.Eth,
        "0x000000F8637F1731D906643027c789EFA60BfE11",
      )
      const tokenAddress: OmniAddress = "near:warp.testnet"

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
      const status = await api.getTransferStatus("Eth", 53)
      expect(status).toMatchSnapshot()
    })

    it("should handle non-existent transfer", async () => {
      await expect(api.getTransferStatus("Eth", 999999999)).rejects.toThrow("Resource not found")
    })
  })
  describe("getTransfer", () => {
    it("should fetch transfer details for a known transfer", async () => {
      const transfer = await api.getTransfer("Eth", 53)

      // Need to convert BigInts to strings for snapshot
      const snapshotSafeTransfer = {
        ...transfer,
        transfer_message: {
          ...transfer.transfer_message,
          fee: {
            fee: transfer.transfer_message.fee.fee.toString(),
            native_fee: transfer.transfer_message.fee.native_fee.toString(),
          },
        },
      }

      expect(snapshotSafeTransfer).toMatchSnapshot()
    })

    it("should handle non-existent transfer", async () => {
      await expect(api.getTransfer("Eth", 999999999)).rejects.toThrow("Resource not found")
    })
  })
  describe("findOmniTransfers", () => {
    it("should fetch transfers for a specific transaction", async () => {
      const txId = "0x0b08b481f24e9df5fc5988777933796173e1f5ef9aa4878557df0a4f5b7d8ad0"
      const transfers = await api.findOmniTransfers({ transaction_id: txId })

      // Convert BigInts to strings for snapshot
      const snapshotSafeTransfers = transfers.map((transfer) => ({
        ...transfer,
        transfer_message: {
          ...transfer.transfer_message,
          fee: {
            fee: transfer.transfer_message.fee.fee.toString(),
            native_fee: transfer.transfer_message.fee.native_fee.toString(),
          },
        },
      }))

      expect(snapshotSafeTransfers).toMatchSnapshot()
    })

    it("should fetch transfers for a specific sender", async () => {
      const sender = "near:r-near.testnet"
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
          finalised_on_near: expect.toBeOneOf([expect.anything(), undefined, null]), // null or transaction object
          finalised: expect.toBeOneOf([expect.anything(), undefined, null]), // null or transaction object
          transfer_message: {
            token: expect.any(String),
            amount: expect.any(Number),
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
