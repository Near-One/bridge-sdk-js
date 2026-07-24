import { describe, expect, it } from "vitest"
import {
  aptosAddressToBytes,
  bytesToHex,
  decodeUtf8Message,
  deriveBridgedTokenAddress,
  deriveBridgeObjectAddress,
  normalizeAptosAddress,
  normalizeEventData,
  splitSignature,
  utf8ToBytes,
} from "../src/encoding.js"

describe("normalizeAptosAddress", () => {
  it("left-pads short-form addresses to 64 hex chars", () => {
    expect(normalizeAptosAddress("0xa")).toBe(
      "0x000000000000000000000000000000000000000000000000000000000000000a",
    )
    expect(normalizeAptosAddress("0x1")).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000001",
    )
  })

  it("accepts addresses without the 0x prefix", () => {
    expect(normalizeAptosAddress("cafe")).toBe(
      "0x000000000000000000000000000000000000000000000000000000000000cafe",
    )
  })

  it("lowercases the address", () => {
    expect(normalizeAptosAddress("0xCAFE")).toBe(
      "0x000000000000000000000000000000000000000000000000000000000000cafe",
    )
  })

  it("keeps already-canonical addresses unchanged", () => {
    const canonical = "0x05558831a603eca8cd69a42d4251f08de3573039b69f23972265cac76639f1cf"
    expect(normalizeAptosAddress(canonical)).toBe(canonical)
  })

  it("rejects addresses longer than 32 bytes", () => {
    expect(() => normalizeAptosAddress(`0x${"1".repeat(65)}`)).toThrow(
      "Invalid Aptos address length",
    )
  })

  it("rejects empty and non-hex addresses", () => {
    expect(() => normalizeAptosAddress("")).toThrow("Invalid Aptos address length")
    expect(() => normalizeAptosAddress("0x")).toThrow("Invalid Aptos address length")
    expect(() => normalizeAptosAddress("0xnothex")).toThrow("Invalid Aptos address")
  })
})

describe("aptosAddressToBytes", () => {
  it("decodes to exactly 32 bytes with left padding", () => {
    const bytes = aptosAddressToBytes("0xa")
    expect(bytes.length).toBe(32)
    expect(bytes[31]).toBe(0x0a)
    expect(bytes.slice(0, 31).every((b) => b === 0)).toBe(true)
  })
})

describe("splitSignature", () => {
  it("splits a 65-byte signature into rs and v", () => {
    const sig = new Uint8Array(65)
    sig[0] = 0xaa
    sig[63] = 0xbb
    sig[64] = 27

    const { rs, v } = splitSignature(sig)
    expect(rs.length).toBe(64)
    expect(rs[0]).toBe(0xaa)
    expect(rs[63]).toBe(0xbb)
    expect(v).toBe(27)
  })

  it("rejects signatures of other lengths", () => {
    expect(() => splitSignature(new Uint8Array(64))).toThrow("Signature must be 65 bytes")
    expect(() => splitSignature(new Uint8Array(66))).toThrow("Signature must be 65 bytes")
  })
})

describe("hex helpers", () => {
  it("encodes bytes with 0x prefix", () => {
    expect(bytesToHex(new Uint8Array([0xde, 0xad]))).toBe("0xdead")
    expect(bytesToHex(new Uint8Array(0))).toBe("0x")
  })

  it("encodes UTF-8 strings as byte arrays", () => {
    expect(utf8ToBytes("")).toEqual([])
    expect(utf8ToBytes("hello")).toEqual([0x68, 0x65, 0x6c, 0x6c, 0x6f])
  })

  it("decodes UTF-8 messages with raw-hex fallback", () => {
    expect(decodeUtf8Message("0x")).toBe("")
    expect(decodeUtf8Message("0x68656c6c6f")).toBe("hello")
    // Invalid UTF-8 falls back to the raw hex string.
    expect(decodeUtf8Message("0xff00")).toBe("0xff00")
    // A leading BOM is preserved (Rust String::from_utf8 parity).
    expect(decodeUtf8Message("0xefbbbf6869")).toBe("\ufeffhi")
  })
})

describe("named object address derivation", () => {
  // Ground-truth vectors generated with @aptos-labs/ts-sdk v7.1.0
  // `createObjectAddress(creator, seed)` (= sha3_256(creator || seed || 0xFE)).
  it("derives the bridge state object address from the module address", () => {
    expect(deriveBridgeObjectAddress("0xcafe")).toBe(
      "0x6cac04c1fda67a68c01cca6a52719243d08b0fab3abe20058e552c639df1b9df",
    )
  })

  it("derives a bridged token FA address from the NEAR token id", () => {
    const bridgeObject = deriveBridgeObjectAddress("0xcafe")
    expect(deriveBridgedTokenAddress(bridgeObject, "wrap.testnet")).toBe(
      "0xae14bb4d3bc7a04649b5b9a9ce77ae5c3796f056e0b8ad3a912c5db8ac37e246",
    )
    // Different token ids must give different addresses.
    expect(deriveBridgedTokenAddress(bridgeObject, "usdt.tether-token.near")).not.toBe(
      deriveBridgedTokenAddress(bridgeObject, "wrap.testnet"),
    )
  })
})

describe("normalizeEventData", () => {
  it("sorts object keys recursively", () => {
    const value = { z: 1, a: 2, nested: { y: 1, x: 2 } }
    expect(normalizeEventData(value)).toBe('{"a":2,"nested":{"x":2,"y":1},"z":1}')
  })

  it("preserves array order while sorting nested objects", () => {
    const value = { list: [{ b: 1, a: 2 }, 3] }
    expect(normalizeEventData(value)).toBe('{"list":[{"a":2,"b":1},3]}')
  })

  it("passes through primitives", () => {
    expect(normalizeEventData("x")).toBe('"x"')
    expect(normalizeEventData(7)).toBe("7")
    expect(normalizeEventData(null)).toBe("null")
  })
})
