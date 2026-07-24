/**
 * Aptos encoding utilities (internal helpers + exported address derivation)
 *
 * Address handling mirrors `omni_types::H256`: parsing accepts an optional
 * `0x` prefix and short-form hex (left-zero-padded to 32 bytes), display is
 * always `0x` + 64 lowercase hex chars.
 */

import { sha3_256 } from "@noble/hashes/sha3.js"
import { hex } from "@scure/base"

/** Seed of the named object that holds the bridge state and token custody. */
const BRIDGE_OBJECT_SEED = "omni_bridge::state"

/** Aptos `object::create_object_address` scheme byte (OBJECT_FROM_SEED). */
const OBJECT_FROM_SEED_SCHEME = 0xfe

/**
 * Normalize an Aptos account address to its canonical form:
 * `0x` + 64 lowercase hex characters.
 *
 * Accepts short-form addresses (`0xa`, `0xCAFE`) with or without the `0x`
 * prefix and left-pads them with zeros, matching the on-chain address
 * semantics and `omni_types::H256` parsing.
 */
export function normalizeAptosAddress(address: string): string {
  const stripped = address.startsWith("0x") || address.startsWith("0X") ? address.slice(2) : address
  if (stripped.length === 0 || stripped.length > 64) {
    throw new Error(`Invalid Aptos address length: ${address}`)
  }
  if (!/^[0-9a-fA-F]+$/.test(stripped)) {
    throw new Error(`Invalid Aptos address: ${address}`)
  }
  return `0x${stripped.padStart(64, "0").toLowerCase()}`
}

/**
 * Decode an Aptos account address into its 32 raw bytes.
 */
export function aptosAddressToBytes(address: string): Uint8Array {
  return hex.decode(normalizeAptosAddress(address).slice(2))
}

/**
 * Split a 65-byte Ethereum-style MPC signature into `(r||s, v)` — the form
 * the `omni_bridge` Move contract expects (`signature_rs: vector<u8>`,
 * `signature_v: u8`).
 */
export function splitSignature(signature: Uint8Array): { rs: Uint8Array; v: number } {
  if (signature.length !== 65) {
    throw new Error(`Signature must be 65 bytes, got ${signature.length}`)
  }
  const v = signature[64]
  if (v === undefined) {
    throw new Error("Signature is missing the recovery byte")
  }
  return { rs: signature.slice(0, 64), v }
}

/**
 * Encode bytes as a `0x`-prefixed hex string (the fullnode REST encoding of
 * `vector<u8>` event fields).
 */
export function bytesToHex(bytes: Uint8Array): string {
  return `0x${hex.encode(bytes)}`
}

/**
 * Encode a UTF-8 string as a plain byte array for `vector<u8>` arguments.
 *
 * Note: `vector<u8>` payload arguments must be number arrays (or
 * `Uint8Array`), NOT hex strings — the ts-sdk argument converter treats a
 * string for `vector<u8>` as UTF-8 text, so a `"0x…"` string would be
 * encoded as the literal characters.
 */
export function utf8ToBytes(s: string): number[] {
  return Array.from(new TextEncoder().encode(s))
}

/**
 * Decode a `vector<u8>` event field (`0x…` hex) to text. Bridge messages
 * carry UTF-8; the raw hex string is kept if the bytes aren't valid UTF-8.
 * Mirrors the Rust SDK's `decode_message`.
 */
export function decodeUtf8Message(hexStr: string): string {
  const stripped = hexStr.startsWith("0x") ? hexStr.slice(2) : hexStr
  if (stripped.length === 0) {
    return ""
  }
  try {
    const bytes = hex.decode(stripped)
    // ignoreBOM keeps a leading U+FEFF, matching Rust's String::from_utf8.
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    return hexStr
  }
}

/**
 * Aptos named-object address derivation:
 * `sha3_256(creator_address(32) || seed || 0xFE)`.
 */
function createObjectAddress(creator: string, seed: Uint8Array): string {
  const creatorBytes = aptosAddressToBytes(creator)
  const input = new Uint8Array(creatorBytes.length + seed.length + 1)
  input.set(creatorBytes, 0)
  input.set(seed, creatorBytes.length)
  input[input.length - 1] = OBJECT_FROM_SEED_SCHEME
  return bytesToHex(sha3_256(input))
}

/**
 * Compute the bridge state object address for an `omni_bridge` deployment.
 *
 * This deterministic named object (seed `"omni_bridge::state"`) holds the
 * bridge state and custodies locked tokens. It is also the address that gets
 * registered as the Aptos factory on the NEAR bridge contract.
 */
export function deriveBridgeObjectAddress(moduleAddress: string): string {
  return createObjectAddress(moduleAddress, new TextEncoder().encode(BRIDGE_OBJECT_SEED))
}

/**
 * Compute the deterministic Fungible Asset metadata object address of a
 * bridge-deployed token. The seed is the NEAR token id's raw UTF-8 bytes,
 * and the creator is the bridge state object (see
 * {@link deriveBridgeObjectAddress}).
 */
export function deriveBridgedTokenAddress(
  bridgeObjectAddress: string,
  nearTokenId: string,
): string {
  return createObjectAddress(bridgeObjectAddress, new TextEncoder().encode(nearTokenId))
}

/**
 * Canonical string form of an event's `data`: object keys sorted recursively
 * so consumers hash identical bytes regardless of provider key ordering.
 * Mirrors the MPC node's (and Rust SDK's) `normalize_event_data`.
 */
export function normalizeEventData(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys)
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return Object.fromEntries(entries.map(([k, v]) => [k, sortKeys(v)]))
  }
  return value
}
