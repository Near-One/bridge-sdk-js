import { describe, expect, it } from "vitest"
import { Chain, type OmniAddress } from "../src/types"
import { getChain, omniAddress } from "../src/utils"
describe("Omni Address Utils", () => {
  describe("omniAddress", () => {
    it("should construct valid omni addresses", () => {
      expect(omniAddress(Chain.Ethereum, "0x123")).toBe("eth:0x123")
      expect(omniAddress(Chain.Near, "alice.near")).toBe("near:alice.near")
      expect(omniAddress(Chain.Solana, "solana123")).toBe("sol:solana123")
      expect(omniAddress(Chain.Arbitrum, "0xarb456")).toBe("arb:0xarb456")
      expect(omniAddress(Chain.Base, "0xbase789")).toBe("base:0xbase789")
    })

    it("should work with empty addresses", () => {
      expect(omniAddress(Chain.Ethereum, "")).toBe("eth:")
    })

    it("should preserve address case", () => {
      expect(omniAddress(Chain.Ethereum, "0xAbCdEf")).toBe("eth:0xAbCdEf")
    })
  })

  describe("getChain", () => {
    it("should extract chain from omni address", () => {
      const addr: OmniAddress = "eth:0x123"
      expect(getChain(addr)).toBe(Chain.Ethereum)
    })

    it("should work with all chain types", () => {
      const addresses: OmniAddress[] = [
        "eth:0x123",
        "near:alice.near",
        "sol:solana123",
        "arb:0xarb456",
        "base:0xbase789",
      ]

      const expected = [Chain.Ethereum, Chain.Near, Chain.Solana, Chain.Arbitrum, Chain.Base]

      addresses.forEach((addr, i) => {
        expect(getChain(addr)).toBe(expected[i])
      })
    })
  })

  describe("type system", () => {
    it("should allow valid literal omni addresses", () => {
      const validAddresses: OmniAddress[] = [
        "eth:0x123",
        "near:alice.near",
        "sol:solana123",
        "arb:0xarb456",
        "base:0xbase789",
      ]

      expect(validAddresses.length).toBe(5) // Just to use the array
    })

    it("should allow construction via omniAddress helper", () => {
      const addresses: OmniAddress[] = [
        omniAddress(Chain.Ethereum, "0x123"),
        omniAddress(Chain.Near, "alice.near"),
      ]

      expect(addresses.length).toBe(2)
    })

    // TypeScript will catch these at compile time
    // but we can document the behavior in tests
    it("should not allow invalid chain prefixes", () => {
      // @ts-expect-error - invalid chain
      const _invalidAddr: OmniAddress = "invalid:0x123"

      // @ts-expect-error - missing chain
      const _noPrefix: OmniAddress = "0x123"

      // @ts-expect-error - wrong separator
      const _wrongSeparator: OmniAddress = "eth-0x123"

      // Suppress unused variable warnings
      expect(true).toBe(true)
    })
  })
})
