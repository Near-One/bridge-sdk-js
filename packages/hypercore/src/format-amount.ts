/**
 * Format an integer amount + decimals as a minimal Hyperliquid decimal string
 * (no trailing zeros, single leading zero before the decimal point).
 *
 * Mirrors `format_amount` in `bridge-sdk-rs/.../hypercore-bridge-client/src/action.rs`.
 */
export function formatAmount(amount: bigint, decimals: number): string {
  if (amount < 0n) throw new RangeError(`amount must be non-negative, got ${amount}`)
  if (decimals < 0 || !Number.isInteger(decimals)) {
    throw new RangeError(`decimals must be a non-negative integer, got ${decimals}`)
  }
  if (decimals === 0) return amount.toString()

  const raw = amount.toString()
  if (raw.length <= decimals) {
    const frac = raw.padStart(decimals, "0").replace(/0+$/, "")
    return frac === "" ? "0" : `0.${frac}`
  }

  const split = raw.length - decimals
  const intPart = raw.slice(0, split)
  const fracPart = raw.slice(split).replace(/0+$/, "")
  return fracPart === "" ? intPart : `${intPart}.${fracPart}`
}
