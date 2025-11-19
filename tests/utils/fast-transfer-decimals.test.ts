import { describe, expect, it } from "vitest"
import { normalizeAmount } from "../../src/utils/decimals.js"
import type { TokenDecimals } from "../../src/utils/decimals.js"

describe("Fast transfer decimal conversion", () => {
  it("should match Rust SDK denormalize behavior for 18->6 decimals", () => {
    // Scenario: EVM token (18 decimals) bridged to NEAR (6 decimals)
    const decimals: TokenDecimals = {
      decimals: 18, // Origin chain (EVM) decimals
      origin_decimals: 6, // NEAR token decimals
    }

    // Transfer 1.0 tokens (minus 0.1 fee)
    const amount = BigInt("1000000000000000000") // 1.0 with 18 decimals (from EVM event)
    const fee = BigInt("100000000000000000") // 0.1 with 18 decimals

    // Convert FROM origin decimals (18) TO NEAR decimals (6) by dividing
    const amountMinusFee = amount - fee
    const amountToSend = normalizeAmount(amountMinusFee, decimals.decimals, decimals.origin_decimals)

    // 900000000000000000 (0.9 with 18 decimals) -> 900000 (0.9 with 6 decimals)
    expect(amountToSend).toBe(BigInt("900000"))
  })

  it("should handle same decimals (no conversion needed)", () => {
    const decimals: TokenDecimals = {
      decimals: 18,
      origin_decimals: 18,
    }

    const amount = BigInt("1000000000000000000")
    const fee = BigInt("100000000000000000")

    const amountToSend = normalizeAmount(amount - fee, decimals.origin_decimals, decimals.decimals)

    expect(amountToSend).toBe(amount - fee)
  })

  it("should handle 24->18 decimals (like NEAR native token)", () => {
    const decimals: TokenDecimals = {
      decimals: 24, // Origin chain (NEAR native)
      origin_decimals: 18, // NEAR bridged token
    }

    const amount = BigInt("1000000000000000000000000") // 1.0 with 24 decimals
    const fee = BigInt("100000000000000000000000") // 0.1 with 24 decimals

    const amountToSend = normalizeAmount(amount - fee, decimals.decimals, decimals.origin_decimals)

    // 900000000000000000000000 (0.9 with 24 decimals) -> 900000000000000000 (0.9 with 18 decimals)
    expect(amountToSend).toBe(BigInt("900000000000000000"))
  })
})
