import { describe, expect, it } from "vitest"
import { decodeByteArray, encodeByteArray, encodeSignature } from "../src/encoding.js"

/**
 * Ground-truth calldata vectors generated from the Rust bridge-sdk-rs
 * StarknetBridgeClient (via `cargo test -p starknet-bridge-client
 * test_calldata_vectors -- --nocapture`).
 *
 * Any change to these expected values means our encoding has diverged
 * from the Rust SDK and must be investigated.
 */
describe("Cross-SDK calldata vectors", () => {
  describe("encodeByteArray", () => {
    it("hello → matches Rust", () => {
      expect(encodeByteArray("hello")).toEqual(["0", "448378203247", "5"])
    })

    it("empty → matches Rust", () => {
      expect(encodeByteArray("")).toEqual(["0", "0", "0"])
    })

    it("near:alice.testnet → matches Rust", () => {
      expect(encodeByteArray("near:alice.testnet")).toEqual([
        "0",
        "9616849499774173366311784142897139239773556",
        "18",
      ])
    })

    it("exactly 31 bytes → matches Rust", () => {
      expect(encodeByteArray("abcdefghijklmnopqrstuvwxyz01234")).toEqual([
        "1",
        "172063216033151516844329818169388221396727601204421676283161692175877681972",
        "0",
        "0",
      ])
    })

    it("multi-word string → matches Rust", () => {
      expect(
        encodeByteArray("This string is longer than thirty-one bytes for sure!!"),
      ).toEqual([
        "1",
        "149135777980113660302976027175263839158575643561217598571266257844995385714",
        "11155930549729203056617989748418325399161411837058425121",
        "23",
      ])
    })
  })

  describe("encodeSignature", () => {
    it("sparse signature → matches Rust", () => {
      const sig = new Uint8Array(65)
      sig[31] = 0xff
      sig[63] = 0xaa
      sig[64] = 27
      expect(encodeSignature(sig)).toEqual(["255", "0", "170", "0", "27"])
    })

    it("dense signature → matches Rust", () => {
      const sig = new Uint8Array(65)
      sig.fill(1, 0, 32)
      sig.fill(2, 32, 64)
      sig[64] = 27
      expect(encodeSignature(sig)).toEqual([
        "1334440654591915542993625911497130241",
        "1334440654591915542993625911497130241",
        "2668881309183831085987251822994260482",
        "2668881309183831085987251822994260482",
        "27",
      ])
    })

    it("throws for wrong length", () => {
      expect(() => encodeSignature(new Uint8Array(64))).toThrow("65 bytes")
    })
  })
})

describe("encodeByteArray / decodeByteArray roundtrips", () => {
  const cases = [
    "",
    "hello",
    "abcdefghijklmnopqrstuvwxyz01234",
    "This string is longer than thirty-one bytes for sure!!",
    "near:alice.testnet",
    "a",
  ]

  for (const input of cases) {
    it(`roundtrips "${input.slice(0, 30)}${input.length > 30 ? "..." : ""}"`, () => {
      const encoded = encodeByteArray(input)
      const [decoded, next] = decodeByteArray(encoded, 0)
      expect(decoded).toBe(input)
      expect(next).toBe(encoded.length)
    })
  }

  it("decodes at non-zero offset", () => {
    const prefix = ["99", "100"]
    const encoded = encodeByteArray("test")
    const combined = [...prefix, ...encoded]
    const [decoded, next] = decodeByteArray(combined, 2)
    expect(decoded).toBe("test")
    expect(next).toBe(2 + encoded.length)
  })
})
