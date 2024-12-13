import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OmniBridgeAPI } from "../src/api"
import { ChainKind, type OmniAddress } from "../src/types"
import { omniAddress } from "../src/utils"

describe("OmniBridgeAPI", () => {
  let api: OmniBridgeAPI

  beforeEach(() => {
    api = new OmniBridgeAPI("testnet")
  })

  describe("getFee", () => {
    // Unit tests with mocked fetch
    describe("unit tests", () => {
      const mockFetch = vi.fn()
      const originalFetch = global.fetch

      beforeEach(() => {
        global.fetch = mockFetch
      })

      afterEach(() => {
        global.fetch = originalFetch
        vi.clearAllMocks()
      })

      it("should return fee information correctly", async () => {
        const mockResponse = {
          transferred_token_fee: "1000",
          native_token_fee: "2000",
        }
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        })

        const sender: OmniAddress = omniAddress(ChainKind.Eth, "0x123")
        const recipient: OmniAddress = omniAddress(ChainKind.Sol, "sol123")
        const tokenAddress = "0xtoken"

        const fee = await api.getFee(sender, recipient, tokenAddress)

        expect(fee.fee).toBe(BigInt(1000))
        expect(fee.nativeFee).toBe(BigInt(2000))
        expect(mockFetch).toHaveBeenCalledWith(
          `${api.getBaseUrl()}/api/v1/transfer-fee?sender=eth%3A0x123&recipient=sol%3Asol123&token=0xtoken`,
        )
      })

      it("should handle zero transferred token fee", async () => {
        const mockResponse = {
          transferred_token_fee: null,
          native_token_fee: "2000",
        }
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        })

        const sender: OmniAddress = "eth:0x123"
        const recipient: OmniAddress = "sol:sol123"
        const tokenAddress = "0xtoken"

        const fee = await api.getFee(sender, recipient, tokenAddress)

        expect(fee.fee).toBe(BigInt(0))
        expect(fee.nativeFee).toBe(BigInt(2000))
      })

      it("should throw error on failed API request", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          statusText: "Not Found",
        })

        const sender: OmniAddress = omniAddress(ChainKind.Eth, "0x123")
        const recipient: OmniAddress = omniAddress(ChainKind.Sol, "sol123")
        const tokenAddress = "0xtoken"

        await expect(api.getFee(sender, recipient, tokenAddress)).rejects.toThrow(
          "API request failed: Not Found",
        )
      })
    })
  })
})
