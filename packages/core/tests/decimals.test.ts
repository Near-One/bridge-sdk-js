import { describe, expect, it } from "vitest"
import {
  getMinimumTransferableAmount,
  normalizeAmount,
  verifyTransferAmount,
} from "../src/utils/decimals.js"

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

describe("Fast transfer decimal conversion", () => {
  it("should match Rust SDK denormalize behavior for 18->6 decimals", () => {
    // Scenario: EVM token (18 decimals) bridged to NEAR (6 decimals)
    const decimals = 18 // Origin chain (EVM) decimals
    const originDecimals = 6 // NEAR token decimals

    // Transfer 1.0 tokens (minus 0.1 fee)
    const amount = BigInt("1000000000000000000") // 1.0 with 18 decimals (from EVM event)
    const fee = BigInt("100000000000000000") // 0.1 with 18 decimals

    // Convert FROM origin decimals (18) TO NEAR decimals (6) by dividing
    const amountMinusFee = amount - fee
    const amountToSend = normalizeAmount(amountMinusFee, decimals, originDecimals)

    // 900000000000000000 (0.9 with 18 decimals) -> 900000 (0.9 with 6 decimals)
    expect(amountToSend).toBe(BigInt("900000"))
  })

  it("should handle same decimals (no conversion needed)", () => {
    const decimals = 18
    const originDecimals = 18

    const amount = BigInt("1000000000000000000")
    const fee = BigInt("100000000000000000")

    const amountToSend = normalizeAmount(amount - fee, originDecimals, decimals)

    expect(amountToSend).toBe(amount - fee)
  })

  it("should handle 24->18 decimals (like NEAR native token)", () => {
    const decimals = 24 // Origin chain (NEAR native)
    const originDecimals = 18 // NEAR bridged token

    const amount = BigInt("1000000000000000000000000") // 1.0 with 24 decimals
    const fee = BigInt("100000000000000000000000") // 0.1 with 24 decimals

    const amountToSend = normalizeAmount(amount - fee, decimals, originDecimals)

    // 900000000000000000000000 (0.9 with 24 decimals) -> 900000000000000000 (0.9 with 18 decimals)
    expect(amountToSend).toBe(BigInt("900000000000000000"))
  })
})

describe("Fast transfer NEAR contract validation", () => {
  // Helper function that mimics NEAR contract's denormalize_amount
  function denormalizeAmount(amount: bigint, decimals: number, originDecimals: number): bigint {
    const diff = originDecimals - decimals
    if (diff === 0) return amount
    if (diff > 0) {
      return amount * 10n ** BigInt(diff)
    } else {
      return amount / 10n ** BigInt(-diff)
    }
  }

  it("should satisfy NEAR contract validation for WETH (18 EVM -> 8 NEAR)", () => {
    // Scenario: WETH with 18 decimals on EVM, stored as 8 decimals on NEAR
    const decimals = 18 // Origin chain (EVM) token decimals
    const originDecimals = 8 // NEAR token decimals

    // From EVM InitTransfer event (unchanged, in EVM decimals)
    const eventAmount = BigInt("1000000000000000000") // 1.0 WETH (18 decimals)
    const eventFee = BigInt("100000000000000000") // 0.1 WETH (18 decimals)

    // What we calculate and send via ft_transfer_call
    // Must normalize separately to avoid precision loss
    const normalizedAmount = normalizeAmount(eventAmount, decimals, originDecimals)
    const normalizedFee = normalizeAmount(eventFee, decimals, originDecimals)
    const amountToSend = normalizedAmount - normalizedFee

    // NEAR contract validation:
    // denormalize(msg.amount) should equal amount_to_send + denormalize(msg.fee)
    const denormalizedEventAmount = denormalizeAmount(eventAmount, decimals, originDecimals)
    const denormalizedFee = denormalizeAmount(eventFee, decimals, originDecimals)

    expect(denormalizedEventAmount).toBe(amountToSend + denormalizedFee)
  })

  it("should satisfy NEAR contract validation for USDC (6 EVM -> 6 NEAR)", () => {
    const decimals = 6 // Same on both chains
    const originDecimals = 6

    const eventAmount = BigInt("1000000") // 1.0 USDC (6 decimals)
    const eventFee = BigInt("100000") // 0.1 USDC

    const normalizedAmount = normalizeAmount(eventAmount, decimals, originDecimals)
    const normalizedFee = normalizeAmount(eventFee, decimals, originDecimals)
    const amountToSend = normalizedAmount - normalizedFee

    const denormalizedEventAmount = denormalizeAmount(eventAmount, decimals, originDecimals)
    const denormalizedFee = denormalizeAmount(eventFee, decimals, originDecimals)

    expect(denormalizedEventAmount).toBe(amountToSend + denormalizedFee)
  })

  it("should handle precision loss correctly when fee doesn't divide evenly", () => {
    // The case Codex identified: amount=1e18, fee=1 with 18->8 decimals
    const decimals = 18 // EVM decimals
    const originDecimals = 8 // NEAR decimals

    const eventAmount = BigInt("1000000000000000000") // 1.0 token (18 decimals)
    const eventFee = BigInt("1") // Tiny fee (18 decimals)

    // WRONG: normalizing (amount - fee) truncates incorrectly
    const wrongAmount = normalizeAmount(eventAmount - eventFee, decimals, originDecimals)
    // = normalizeAmount(999999999999999999, 18, 8) = 99999999 (truncated)

    // CORRECT: normalize separately then subtract
    const normalizedAmount = normalizeAmount(eventAmount, decimals, originDecimals)
    const normalizedFee = normalizeAmount(eventFee, decimals, originDecimals)
    const correctAmount = normalizedAmount - normalizedFee
    // = 100000000 - 0 = 100000000

    // Verify they're different
    expect(wrongAmount).not.toBe(correctAmount)
    expect(wrongAmount).toBe(BigInt("99999999")) // Lost precision!
    expect(correctAmount).toBe(BigInt("100000000")) // Correct value

    // Verify ONLY the correct one satisfies contract validation
    const denormalizedEventAmount = denormalizeAmount(eventAmount, decimals, originDecimals)
    const denormalizedFee = denormalizeAmount(eventFee, decimals, originDecimals)

    // Wrong calculation fails validation
    expect(denormalizedEventAmount).not.toBe(wrongAmount + denormalizedFee)

    // Correct calculation passes validation
    expect(denormalizedEventAmount).toBe(correctAmount + denormalizedFee)
  })
})
