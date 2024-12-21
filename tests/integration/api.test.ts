import { beforeEach, describe, expect, it } from "vitest"
import { OmniBridgeAPI } from "../../src/api"
import { ChainKind, type OmniAddress } from "../../src/types"
import { omniAddress } from "../../src/utils"

describe("OmniBridgeAPI Integration Tests", () => {
  let api: OmniBridgeAPI

  beforeEach(() => {
    api = new OmniBridgeAPI("testnet")
  })

  describe("getFee", () => {
    it("should fetch real fee information", async () => {
      const sender: OmniAddress = omniAddress(ChainKind.Near, "bridge-sender.testnet")
      const recipient: OmniAddress = omniAddress(
        ChainKind.Eth,
        "0x000000F8637F1731D906643027c789EFA60BfE11",
      )
      const tokenAddress = "warp.testnet"

      const fee = await api.getFee(sender, recipient, tokenAddress)

      expect(typeof fee.native_token_fee).toBe("number")
      expect(typeof fee.transferred_token_fee).toBe("number")
      expect(typeof fee.usd_fee).toBe("number")
      expect(fee.native_token_fee > 0).toBe(true)
    })

    it("should handle real API errors gracefully", async () => {
      const sender: OmniAddress = omniAddress(ChainKind.Eth, "invalid")
      const recipient: OmniAddress = omniAddress(ChainKind.Sol, "invalid")
      const tokenAddress = "invalid"

      await expect(api.getFee(sender, recipient, tokenAddress)).rejects.toThrow()
    })
  })
})
