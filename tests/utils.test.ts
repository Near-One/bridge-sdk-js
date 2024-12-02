import { describe, it, expect } from "vitest"
import { parseOmniAddress, formatOmniAddress } from "../src/utils"
import { ChainKind } from "../src/types"

describe("Address Utils", () => {
  it("should parse Ethereum address", () => {
    const result = parseOmniAddress("eth:0x123")
    expect(result).toEqual({
      chain: ChainKind.Eth,
      address: "0x123",
    })
  })

  it("should parse NEAR address", () => {
    const result = parseOmniAddress("near:test.near")
    expect(result).toEqual({
      chain: ChainKind.Near,
      address: "test.near",
    })
  })

  it("should format Ethereum address", () => {
    const result = formatOmniAddress({
      chain: ChainKind.Eth,
      address: "0x123",
    })
    expect(result).toBe("eth:0x123")
  })

  it("should format NEAR address", () => {
    const result = formatOmniAddress({
      chain: ChainKind.Near,
      address: "test.near",
    })
    expect(result).toBe("near:test.near")
  })
})
