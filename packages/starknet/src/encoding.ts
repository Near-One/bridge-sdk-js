/**
 * Starknet calldata encoding utilities (internal)
 *
 * Uses starknet.js native APIs where possible. Only hand-rolls encoding
 * for the 65-byte ECDSA signature format that the bridge contract expects
 * (r_u256 + s_u256 + v), which starknet.js doesn't natively handle.
 */

import { byteArray, CairoUint256, CallData, encode, num } from "starknet"

/**
 * Encode a string as a Cairo ByteArray, flattened to calldata.
 */
export function encodeByteArray(s: string): string[] {
  return CallData.compile([byteArray.byteArrayFromString(s)])
}

/**
 * Decode a Cairo ByteArray from calldata starting at `offset`.
 * Returns [decoded_string, next_offset].
 */
export function decodeByteArray(data: string[], offset: number): [string, number] {
  const numFullWords = Number(BigInt(data[offset] ?? "0"))
  const totalFelts = 1 + numFullWords + 2
  const pendingWordIdx = offset + 1 + numFullWords

  const decoded = byteArray.stringFromByteArray({
    data: data.slice(offset + 1, offset + 1 + numFullWords),
    pending_word: data[pendingWordIdx] ?? "0",
    pending_word_len: Number(BigInt(data[pendingWordIdx + 1] ?? "0")),
  })

  return [decoded, offset + totalFelts]
}

/**
 * Encode a 65-byte ECDSA signature as Starknet calldata.
 *
 * Layout matches the Rust SDK: r(u256) + s(u256) + v(felt)
 *   → [r_low, r_high, s_low, s_high, v]
 */
export function encodeSignature(sigBytes: Uint8Array): string[] {
  if (sigBytes.length !== 65) {
    throw new Error(`Signature must be 65 bytes, got ${sigBytes.length}`)
  }

  const r = num.toBigInt(`0x${encode.buf2hex(sigBytes.slice(0, 32))}`)
  const s = num.toBigInt(`0x${encode.buf2hex(sigBytes.slice(32, 64))}`)
  const v = sigBytes[64]

  return [
    ...CallData.compile([new CairoUint256(r).toUint256DecimalString()]),
    ...CallData.compile([new CairoUint256(s).toUint256DecimalString()]),
    String(v),
  ]
}
