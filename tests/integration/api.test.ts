import { beforeEach, describe, expect, it } from "vitest"
import { OmniBridgeAPI } from "../../src/api.js"
import { setNetwork } from "../../src/config.js"
import { ChainKind, type OmniAddress } from "../../src/types/index.js"
import { omniAddress } from "../../src/utils/index.js"

describe("OmniBridgeAPI Integration Tests", () => {
  let api: OmniBridgeAPI

  beforeEach(() => {
    setNetwork("mainnet")
    api = new OmniBridgeAPI()
  })

  describe("getFee", () => {
    it("should fetch real fee information", { timeout: 10000 }, async () => {
      const sender: OmniAddress = omniAddress(
        ChainKind.Near,
        "bridge-sender.near"
      )
      const recipient: OmniAddress = omniAddress(
        ChainKind.Eth,
        "0x000000F8637F1731D906643027c789EFA60BfE11"
      )
      const tokenAddress: OmniAddress = "near:warp.near"

      const fee = await api.getFee(sender, recipient, tokenAddress, "1000000")

      // Check required fields
      expect(fee.native_token_fee).toEqual(expect.any(BigInt))
      expect(fee.usd_fee).toEqual(expect.any(Number))

      // Check valid ranges for required fields
      expect(fee.native_token_fee).toBeDefined()
      if (fee.native_token_fee !== null) {
        expect(fee.native_token_fee >= 0n).toBe(true)
      }
      expect(fee.usd_fee >= 0).toBe(true)

      // Check optional fields if present and not null
      if (fee.gas_fee !== undefined && fee.gas_fee !== null) {
        expect(fee.gas_fee).toEqual(expect.any(BigInt))
        expect(fee.gas_fee >= 0n).toBe(true)
      }
      if (fee.protocol_fee !== undefined && fee.protocol_fee !== null) {
        expect(fee.protocol_fee).toEqual(expect.any(BigInt))
        expect(fee.protocol_fee >= 0n).toBe(true)
      }
      if (fee.relayer_fee !== undefined && fee.relayer_fee !== null) {
        expect(fee.relayer_fee).toEqual(expect.any(BigInt))
        expect(fee.relayer_fee >= 0n).toBe(true)
      }
      if (fee.transferred_token_fee !== undefined && fee.transferred_token_fee !== null) {
        expect(fee.transferred_token_fee).toEqual(expect.any(BigInt))
        expect(fee.transferred_token_fee >= 0n).toBe(true)
      }
      // Check the new insufficient_utxo field
      expect(fee.insufficient_utxo).toEqual(expect.any(Boolean))
    })

    it("should handle real API errors gracefully", async () => {
      const sender: OmniAddress = omniAddress(ChainKind.Eth, "invalid")
      const recipient: OmniAddress = omniAddress(ChainKind.Sol, "invalid")
      const tokenAddress: OmniAddress = "near:invalid"

      await expect(
        api.getFee(sender, recipient, tokenAddress, "1000000")
      ).rejects.toThrow()
    })

    it("should return proper APIError message for invalid sender", async () => {
      const invalidSender: OmniAddress = "eth:sender.address"
      const recipient: OmniAddress = omniAddress(
        ChainKind.Eth,
        "0x000000F8637F1731D906643027c789EFA60BfE11"
      )
      const tokenAddress: OmniAddress = "near:warp.near"

      try {
        await api.getFee(invalidSender, recipient, tokenAddress, "1000000")
        expect.fail("Expected API call to throw an error")
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error)
        const apiError = error as Error & {
          name: string
          status?: number
          statusText?: string
        }
        expect(apiError.name).toBe("ApiError")
        expect(apiError.message).toBe(
          "Invalid argument: Invalid sender omni address"
        )
        expect(apiError.status).toBe(400)
        expect(apiError.statusText).toBe("Bad Request")
      }
    })
  })
  describe("getTransferStatus", () => {
    it("should fetch status for a known transfer", async () => {
      const status = await api.getTransferStatus({
        originChain: "Near",
        originNonce: 1,
      })
      expect(status).toMatchSnapshot()
      expect(Array.isArray(status)).toBe(true)
    })

    it("should handle non-existent transfer", async () => {
      await expect(
        api.getTransferStatus({ originChain: "Eth", originNonce: 999999999 })
      ).rejects.toThrow("Not found")
    })

    it("should fetch status by transaction hash", async () => {
      const txId = "DQM4d3B6Jxr4qnvGay4bpZ7aTQQogpUgQxVLAVWk5doF"
      const status = await api.getTransferStatus({ transactionHash: txId })
      expect(Array.isArray(status)).toBe(true)
    })
  })
  describe("getTransfer", () => {
    it("should fetch transfer details for a known transfer", async () => {
      const transfers = await api.getTransfer({
        originChain: "Near",
        originNonce: 22,
      })
      expect(transfers).toMatchSnapshot()
      expect(Array.isArray(transfers)).toBe(true)
      if (transfers.length > 0) {
        expect(transfers[0]).toHaveProperty("id")
        expect(transfers[0]).toHaveProperty("transfer_message")
      }
    })

    it("should handle non-existent transfer", async () => {
      await expect(
        api.getTransfer({ originChain: "Eth", originNonce: 999999999 })
      ).rejects.toThrow("Not found")
    })

    it("should fetch transfer by transaction hash", async () => {
      const txId = "DQM4d3B6Jxr4qnvGay4bpZ7aTQQogpUgQxVLAVWk5doF"
      const transfers = await api.getTransfer({ transactionHash: txId })
      expect(Array.isArray(transfers)).toBe(true)
      if (transfers.length > 0) {
        expect(transfers[0]).toHaveProperty("id")
        expect(transfers[0]).toHaveProperty("transfer_message")
      }
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
            kind: {
              Nonce: expect.any(Number),
            },
          },
          initialized: expect.any(Object),
          claimed: expect.toBeOneOf([expect.anything(), undefined, null]), // null or transaction object
          signed: expect.toBeOneOf([expect.anything(), undefined, null]), // null or transaction object
          fast_finalised_on_near: expect.toBeOneOf([
            expect.anything(),
            undefined,
            null,
          ]), // null or transaction object
          finalised_on_near: expect.toBeOneOf([
            expect.anything(),
            undefined,
            null,
          ]), // null or transaction object
          fast_finalised: expect.toBeOneOf([
            expect.anything(),
            undefined,
            null,
          ]), // null or transaction object
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
          utxo_transfer: expect.toBeOneOf([expect.anything(), null]),
        })
      }
    })

    it("should handle invalid sender address", async () => {
      const invalidSender = "invalid:sender.address"
      await expect(
        api.findOmniTransfers({ sender: invalidSender })
      ).rejects.toThrow()
    })
  })

  describe("getAllowlistedTokens", () => {
    it("should fetch real allowlisted tokens", async () => {
      const tokens = await api.getAllowlistedTokens()

      // Should be an object with string keys and OmniAddress values
      expect(tokens).toBeInstanceOf(Object)
      expect(Object.keys(tokens).length).toBeGreaterThan(0)

      // Check structure of each token entry
      for (const [nearAccountId, omniAddress] of Object.entries(tokens)) {
        expect(typeof nearAccountId).toBe("string")
        expect(typeof omniAddress).toBe("string")
        // OmniAddress should have chain prefix format
        expect(omniAddress).toMatch(/^(eth|near|sol):.+/)
      }
    })

    it("should return consistent data structure", async () => {
      const tokens = await api.getAllowlistedTokens()
      expect(tokens).toMatchSnapshot()
    })
  })

  describe("getUtxoUserDepositAddress", () => {
    it("should fetch real BTC deposit address", async () => {
      const response = await api.getUtxoUserDepositAddress(
        "btc",
        "recipient.near"
      )

      expect(response).toEqual({
        address: expect.any(String),
      })
      expect(response.address).toMatch(/^(bc1|1|3)[a-zA-Z0-9]{25,62}$/)
    })

    it("should handle post actions parameter", async () => {
      const postActions = [
        {
          receiver_id: "receiver.near",
          amount: "1000000000000000000000000",
          msg: "test message",
          gas: "3000000000000",
          memo: "test memo",
        },
      ]
      const response = await api.getUtxoUserDepositAddress(
        "btc",
        "recipient.near",
        postActions,
        "extra message"
      )

      expect(response).toEqual({
        address: expect.any(String),
      })
    })
  })

  describe("Batch transfer testing", () => {
    it("should handle batch transaction with multiple transfers", async () => {
      const txHash = "9kJoVfmzhnJqivYjNfa4ftuy9wPZ8haoZtYJteo7khio"

      try {
        const transfers = await api.getTransfer({ transactionHash: txHash })
        expect(Array.isArray(transfers)).toBe(true)

        if (transfers.length > 0) {
          // Test structure of transfer objects
          for (const transfer of transfers) {
            expect(transfer).toHaveProperty("updated_fee")
            expect(Array.isArray(transfer.updated_fee)).toBe(true)
            // utxo_transfer might be present for BTC-related transfers
            if (transfer.utxo_transfer) {
              expect(transfer.utxo_transfer).toEqual({
                chain: expect.any(String),
                amount: expect.any(String),
                recipient: expect.any(String),
                relayer_fee: expect.any(String),
                protocol_fee: expect.any(String),
                relayer_account_id: expect.any(String),
                sender: expect.toBeOneOf([expect.any(String), null]),
              })
            }
          }
        }

        const status = await api.getTransferStatus({ transactionHash: txHash })
        expect(Array.isArray(status)).toBe(true)
      } catch (error) {
        // Transaction might not exist in testnet, which is expected
        expect(error).toBeInstanceOf(Error)
      }
    })
  })
})
