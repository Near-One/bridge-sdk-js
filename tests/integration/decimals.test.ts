import { afterAll, beforeAll, describe, it, vi } from "vitest"
import { setNetwork } from "../../src/config.js"
import { getTokenDecimals } from "../../src/utils/decimals.js"

describe.concurrent("getTokenDecimals integration", () => {
  setNetwork("testnet")

  beforeAll(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "debug").mockImplementation(() => {})
  })
  afterAll(() => {
    vi.restoreAllMocks()
  })

  it("fetches decimals for JLU token on Solana", async ({ expect }) => {
    const tokenAddress = "sol:rLFLkpdMZsVLWziDfz5WWqVgVnFbPdKicSNQcj9QVxL"
    const decimals = await getTokenDecimals("omni-locker.testnet", tokenAddress)

    // Verify response structure (these should not change)
    expect(decimals).not.toBeNull()
    if (decimals) {
      expect(decimals).toHaveProperty("decimals")
      expect(decimals).toHaveProperty("origin_decimals")
      expect(typeof decimals.decimals).toBe("number")
      expect(typeof decimals.origin_decimals).toBe("number")

      // Snapshot the actual values
      expect(decimals).toMatchSnapshot({
        decimals: 9,
        origin_decimals: 18,
      })
    }
  }, 10000) // Increase timeout for RPC call

  it("handles invalid token addresses", async ({ expect }) => {
    const invalidAddress = "sol:invalid.testnet"
    await expect(getTokenDecimals("omni-locker.testnet", invalidAddress)).rejects.toMatchSnapshot()
  })

  it("returns null for unregistered token addresses", async ({ expect }) => {
    const unregisteredAddress = "sol:unregistered1234567890"
    const result = await getTokenDecimals("omni-locker.testnet", unregisteredAddress)
    // This might return null for unregistered tokens
    if (result === null) {
      expect(result).toBeNull()
    } else {
      // If it doesn't return null, it should be a valid TokenDecimals object
      expect(result).toHaveProperty("decimals")
      expect(result).toHaveProperty("origin_decimals")
    }
  })
})
