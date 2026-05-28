import { describe, expect, it } from "vitest"
import { formatAmount } from "../src/format-amount.js"

describe("formatAmount", () => {
  // Vectors copied from bridge-sdk-rs/.../hypercore-bridge-client/src/action.rs.
  it.each([
    [0n, 8, "0"],
    [1n, 8, "0.00000001"],
    [100_000_000n, 8, "1"],
    [123_456_789n, 8, "1.23456789"],
    [100_000_000_000n, 8, "1000"],
    [10n, 0, "10"],
    [1_000n, 2, "10"],
    [123n, 2, "1.23"],
    [120n, 2, "1.2"],
  ])("formatAmount(%s, %s) → %s", (amount, decimals, expected) => {
    expect(formatAmount(amount, decimals)).toBe(expected)
  })

  it("rejects negative amounts", () => {
    expect(() => formatAmount(-1n, 8)).toThrow(/non-negative/)
  })

  it("rejects negative decimals", () => {
    expect(() => formatAmount(1n, -1)).toThrow(/decimals/)
  })
})
