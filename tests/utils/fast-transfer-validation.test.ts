import { describe, expect, it } from "vitest"
import { normalizeAmount } from "../../src/utils/decimals.js"
import type { TokenDecimals } from "../../src/utils/decimals.js"

/**
 * This test mimics the NEAR contract's validation logic for fast transfers.
 *
 * The NEAR contract does:
 * ```rust
 * let denormalized_amount = Self::denormalize_amount(fast_fin_transfer_msg.amount.0, decimals);
 * require!(denormalized_amount == amount.0 + denormalized_fee.fee.0);
 * ```
 *
 * Where:
 * - fast_fin_transfer_msg.amount = amount from EVM event (in msg)
 * - amount = amount sent via ft_transfer_call (amount_to_send)
 * - denormalize multiplies by 10^(origin_decimals - decimals)
 */
describe("Fast transfer NEAR contract validation", () => {
  // Helper function that mimics NEAR contract's denormalize_amount
  function denormalizeAmount(amount: bigint, decimals: TokenDecimals): bigint {
    const diff = decimals.origin_decimals - decimals.decimals
    if (diff === 0) return amount
    if (diff > 0) {
      return amount * 10n ** BigInt(diff)
    } else {
      return amount / 10n ** BigInt(-diff)
    }
  }

  it("should satisfy NEAR contract validation for WETH (18 EVM -> 8 NEAR)", () => {
    // Scenario: WETH with 18 decimals on EVM, stored as 8 decimals on NEAR
    const decimals: TokenDecimals = {
      decimals: 18, // Origin chain (EVM) token decimals
      origin_decimals: 8, // NEAR token decimals
    }

    // From EVM InitTransfer event (unchanged, in EVM decimals)
    const eventAmount = BigInt("1000000000000000000") // 1.0 WETH (18 decimals)
    const eventFee = BigInt("100000000000000000") // 0.1 WETH (18 decimals)

    // What we calculate and send via ft_transfer_call
    // Must normalize separately to avoid precision loss
    const normalizedAmount = normalizeAmount(eventAmount, decimals.decimals, decimals.origin_decimals)
    const normalizedFee = normalizeAmount(eventFee, decimals.decimals, decimals.origin_decimals)
    const amountToSend = normalizedAmount - normalizedFee

    // NEAR contract validation:
    // denormalize(msg.amount) should equal amount_to_send + denormalize(msg.fee)
    const denormalizedEventAmount = denormalizeAmount(eventAmount, decimals)
    const denormalizedFee = denormalizeAmount(eventFee, decimals)

    expect(denormalizedEventAmount).toBe(amountToSend + denormalizedFee)
  })

  it("should satisfy NEAR contract validation for USDC (6 EVM -> 6 NEAR)", () => {
    const decimals: TokenDecimals = {
      decimals: 6, // Same on both chains
      origin_decimals: 6,
    }

    const eventAmount = BigInt("1000000") // 1.0 USDC (6 decimals)
    const eventFee = BigInt("100000") // 0.1 USDC

    const normalizedAmount = normalizeAmount(eventAmount, decimals.decimals, decimals.origin_decimals)
    const normalizedFee = normalizeAmount(eventFee, decimals.decimals, decimals.origin_decimals)
    const amountToSend = normalizedAmount - normalizedFee

    const denormalizedEventAmount = denormalizeAmount(eventAmount, decimals)
    const denormalizedFee = denormalizeAmount(eventFee, decimals)

    expect(denormalizedEventAmount).toBe(amountToSend + denormalizedFee)
  })

  it("should satisfy NEAR contract validation for NEAR native (24 -> 18)", () => {
    const decimals: TokenDecimals = {
      decimals: 24, // Origin chain (NEAR native) decimals
      origin_decimals: 18, // NEAR bridged token decimals
    }

    const eventAmount = BigInt("1000000000000000000000000") // 1.0 NEAR (24 decimals)
    const eventFee = BigInt("100000000000000000000000") // 0.1 NEAR

    const normalizedAmount = normalizeAmount(eventAmount, decimals.decimals, decimals.origin_decimals)
    const normalizedFee = normalizeAmount(eventFee, decimals.decimals, decimals.origin_decimals)
    const amountToSend = normalizedAmount - normalizedFee

    const denormalizedEventAmount = denormalizeAmount(eventAmount, decimals)
    const denormalizedFee = denormalizeAmount(eventFee, decimals)

    expect(denormalizedEventAmount).toBe(amountToSend + denormalizedFee)
  })

  it("should handle precision loss correctly when fee doesn't divide evenly", () => {
    // The case Codex identified: amount=1e18, fee=1 with 18->8 decimals
    const decimals: TokenDecimals = {
      decimals: 18, // EVM decimals
      origin_decimals: 8, // NEAR decimals
    }

    const eventAmount = BigInt("1000000000000000000") // 1.0 token (18 decimals)
    const eventFee = BigInt("1") // Tiny fee (18 decimals)

    // WRONG: normalizing (amount - fee) truncates incorrectly
    const wrongAmount = normalizeAmount(
      eventAmount - eventFee,
      decimals.decimals,
      decimals.origin_decimals
    )
    // = normalizeAmount(999999999999999999, 18, 8) = 99999999 (truncated)

    // CORRECT: normalize separately then subtract
    const normalizedAmount = normalizeAmount(eventAmount, decimals.decimals, decimals.origin_decimals)
    const normalizedFee = normalizeAmount(eventFee, decimals.decimals, decimals.origin_decimals)
    const correctAmount = normalizedAmount - normalizedFee
    // = 100000000 - 0 = 100000000

    // Verify they're different
    expect(wrongAmount).not.toBe(correctAmount)
    expect(wrongAmount).toBe(BigInt("99999999")) // Lost precision!
    expect(correctAmount).toBe(BigInt("100000000")) // Correct value

    // Verify ONLY the correct one satisfies contract validation
    const denormalizedEventAmount = denormalizeAmount(eventAmount, decimals)
    const denormalizedFee = denormalizeAmount(eventFee, decimals)

    // Wrong calculation fails validation
    expect(denormalizedEventAmount).not.toBe(wrongAmount + denormalizedFee)

    // Correct calculation passes validation
    expect(denormalizedEventAmount).toBe(correctAmount + denormalizedFee)
  })
})
