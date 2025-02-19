import { afterAll, beforeAll, describe, it, vi } from "vitest"
import { setNetwork } from "../../src/config"
import { getTokenDecimals } from "../../src/utils/decimals"

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
    expect(decimals).toHaveProperty("decimals")
    expect(decimals).toHaveProperty("origin_decimals")
    expect(typeof decimals.decimals).toBe("number")
    expect(typeof decimals.origin_decimals).toBe("number")

    // Snapshot the actual values
    expect(decimals).toMatchSnapshot({
      decimals: 9,
      origin_decimals: 18,
    })
  }, 10000) // Increase timeout for RPC call

  it("handles invalid token addresses", async ({ expect }) => {
    const invalidAddress = "sol:invalid.testnet"
    await expect(getTokenDecimals("omni-locker.testnet", invalidAddress)).rejects.toMatchSnapshot()
  })
})
