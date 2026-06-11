import { ChainKind } from "@omni-bridge/core"
import { describe, expect, it } from "vitest"
import { ChainKindSchema } from "../src/types.js"

// `b.nativeEnum` serializes the position of each variant in declaration order
// — not its numeric value. These assertions lock the wire format to match
// `omni_types::ChainKind` in the Rust omni-bridge repo so `fin_transfer`,
// `deploy_token`, and `bind_token` payloads can't silently drift again.
describe("ChainKindSchema borsh discriminants", () => {
  const cases: Array<[keyof typeof ChainKind, number]> = [
    ["Eth", 0],
    ["Near", 1],
    ["Sol", 2],
    ["Arb", 3],
    ["Base", 4],
    ["Bnb", 5],
    ["Btc", 6],
    ["Zcash", 7],
    ["Pol", 8],
    ["HyperEvm", 9],
    ["Strk", 10],
    ["Abs", 11],
    ["Fogo", 12],
    ["Aptos", 13],
  ]

  for (const [name, expectedByte] of cases) {
    it(`serializes ${name} as ${expectedByte}`, () => {
      const bytes = ChainKindSchema.serialize(ChainKind[name])
      expect(bytes).toEqual(new Uint8Array([expectedByte]))
    })
  }
})
