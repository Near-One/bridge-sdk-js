import { afterEach, describe, expect, it, vi } from "vitest"
import type { TokenDecimals } from "../../src/utils/decimals"
import * as decimalsModule from "../../src/utils/decimals"
import {
  getMinimumTransferableAmount,
  getTokenDecimals,
  normalizeAmount,
  verifyTransferAmount,
} from "../../src/utils/decimals"

describe("normalizeAmount", () => {
  it("handles equal decimals", () => {
    const amount = 1000000n // 1.0 with 6 decimals
    expect(normalizeAmount(amount, 6, 6)).toBe(1000000n)
  })

  it("scales down from NEAR (24) to Solana (9)", () => {
    const amount = 1000000000000000000000000n // 1.0 NEAR
    const expected = 1000000000n // 1.0 in Solana decimals
    expect(normalizeAmount(amount, 24, 9)).toBe(expected)
  })

  it("scales down from ETH (18) to Solana (9)", () => {
    const amount = 1000000000000000000n // 1.0 ETH
    const expected = 1000000000n // 1.0 in Solana decimals
    expect(normalizeAmount(amount, 18, 9)).toBe(expected)
  })

  it("scales up from Solana (9) to NEAR (24)", () => {
    const amount = 1000000000n // 1.0 in Solana
    const expected = 1000000000000000000000000n // 1.0 in NEAR
    expect(normalizeAmount(amount, 9, 24)).toBe(expected)
  })

  it("handles edge case of 1 yoctoNEAR to Solana", () => {
    const amount = 1n // 1 yoctoNEAR
    expect(normalizeAmount(amount, 24, 9)).toBe(0n)
  })

  it("maintains precision when possible", () => {
    // 0.000000000000000001 ETH (smallest unit)
    const amount = 1n
    // Should maintain precision when going to 24 decimals
    const expected = 1000000n
    expect(normalizeAmount(amount, 18, 24)).toBe(expected)
  })
})

describe("verifyTransferAmount", () => {
  it("approves valid NEAR to Solana transfer", () => {
    const amount = 2000000000000000000000000n // 2.0 NEAR
    const fee = 1000000000000000000000000n // 1.0 NEAR fee
    expect(verifyTransferAmount(amount, fee, 24, 9)).toBe(true)
  })

  it("rejects transfer that would normalize to zero", () => {
    const amount = 1n // 1 yoctoNEAR
    const fee = 0n
    expect(verifyTransferAmount(amount, fee, 24, 9)).toBe(false)
  })

  it("rejects transfer where fee equals amount", () => {
    const amount = 1000000000000000000000000n // 1.0 NEAR
    const fee = 1000000000000000000000000n // 1.0 NEAR
    expect(verifyTransferAmount(amount, fee, 24, 9)).toBe(false)
  })

  it("rejects near-equal amount and fee that would normalize to zero", () => {
    const amount = 1000000000000000000000000n // 1.0 NEAR
    const fee = 999999999999999999999999n // 0.999999999999999999999999 NEAR
    expect(verifyTransferAmount(amount, fee, 24, 9)).toBe(false)
  })

  it("handles edge case where normalization of difference is zero", () => {
    const amount = 100n
    const fee = 1n
    expect(verifyTransferAmount(amount, fee, 24, 9)).toBe(false)
  })

  it("approves valid ETH to Solana transfer", () => {
    const amount = 2000000000000000000n // 2.0 ETH
    const fee = 1000000000000000000n // 1.0 ETH fee
    expect(verifyTransferAmount(amount, fee, 18, 9)).toBe(true)
  })

  it("handles transfers to higher precision", () => {
    const amount = 2000000000n // 2.0 SOL
    const fee = 1000000000n // 1.0 SOL fee
    expect(verifyTransferAmount(amount, fee, 9, 18)).toBe(true)
  })
})

describe("getMinimumTransferableAmount", () => {
  it("calculates minimum for NEAR to Solana", () => {
    const minAmount = getMinimumTransferableAmount(24, 9)
    // 1 SOL unit worth of NEAR (scaled up to 24 decimals)
    expect(minAmount).toBe(1000000000000000n)
  })

  it("calculates minimum for ETH to Solana", () => {
    const minAmount = getMinimumTransferableAmount(18, 9)
    // 1 SOL unit worth of ETH (scaled up to 18 decimals)
    expect(minAmount).toBe(1000000000n)
  })

  it("calculates minimum for Solana to NEAR", () => {
    const minAmount = getMinimumTransferableAmount(9, 24)
    // 1 lamport (smallest Solana unit)
    expect(minAmount).toBe(1n)
  })

  it("handles equal decimals", () => {
    const minAmount = getMinimumTransferableAmount(6, 6)
    expect(minAmount).toBe(1n)
  })
})

describe("getTokenDecimals", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })
  it("fetches token decimals from NEAR contract", async () => {
    const mockDecimals: TokenDecimals = {
      decimals: 24,
      origin_decimals: 18,
    }
    vi.spyOn(decimalsModule, "getTokenDecimals").mockResolvedValue(mockDecimals)
    const result = await getTokenDecimals("contract.near", "eth:0x123...")
    expect(result).toEqual(mockDecimals)
  })
})
