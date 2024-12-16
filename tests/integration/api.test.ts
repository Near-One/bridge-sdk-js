import { beforeEach, describe, expect, it } from "vitest"
import { OmniBridgeAPI } from "../../src/api"
import { ChainKind, type OmniAddress, Status } from "../../src/types"
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

      expect(typeof fee.fee).toBe("bigint")
      expect(typeof fee.nativeFee).toBe("bigint")
      expect(fee.nativeFee > BigInt(0)).toBe(true)
    })

    it("should handle real API errors gracefully", async () => {
      const sender: OmniAddress = omniAddress(ChainKind.Eth, "invalid")
      const recipient: OmniAddress = omniAddress(ChainKind.Sol, "invalid")
      const tokenAddress = "invalid"

      await expect(api.getFee(sender, recipient, tokenAddress)).rejects.toThrow()
    })
  })

  describe("getTransferStatus", () => {
    it("should fetch transfer status for Sol chain", async () => {
      const originChain = ChainKind.Sol
      const nonce = BigInt(30)

      const status = await api.getTransferStatus(originChain, nonce)

      // Status should be one of the valid enum values
      expect([Status.Pending, Status.Completed, Status.Failed]).toContain(status)
    })

    it("should handle invalid transfer lookup gracefully", async () => {
      const originChain = ChainKind.Sol
      const invalidNonce = BigInt(999999999) // Using a very large nonce that's unlikely to exist

      await expect(api.getTransferStatus(originChain, invalidNonce)).rejects.toThrow()
    })
  })
})
