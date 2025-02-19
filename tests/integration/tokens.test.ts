import { beforeAll, describe, expect, it } from "vitest"
import { setNetwork } from "../../src"
import { ChainKind } from "../../src/types"
import { getTokenAddress } from "../../src/utils/tokens"

describe("Token Conversion Integration Tests", () => {
  beforeAll(() => {
    setNetwork("testnet")
  })
  describe("NEAR to other chains", () => {
    const nearToken = "near:wrap.testnet"

    it("converts NEAR to Solana", async () => {
      const result = await getTokenAddress(nearToken, ChainKind.Sol)
      expect(result).toMatchInlineSnapshot(`"sol:3wQct2e43J1Z99h2RWrhPAhf6E32ZpuzEt6tgwfEAKAy"`)
    })

    it("converts NEAR to Base", async () => {
      const result = await getTokenAddress(nearToken, ChainKind.Base)
      expect(result).toMatchInlineSnapshot(`"base:0xb8cae3ea035ab123c1833258835ef270c9934162"`)
    })

    it("converts NEAR to Arbitrum", async () => {
      const result = await getTokenAddress(nearToken, ChainKind.Arb)
      expect(result).toMatchInlineSnapshot(`"arb:0xf66f061ac678378c949bdfd3cb8c974272db3f59"`)
    })
  })

  describe("Other chains to NEAR", () => {
    const nearExpected = "near:wrap.testnet"

    it("converts Solana to NEAR", async () => {
      const result = await getTokenAddress(
        "sol:3wQct2e43J1Z99h2RWrhPAhf6E32ZpuzEt6tgwfEAKAy",
        ChainKind.Near,
      )
      expect(result).toBe(nearExpected)
    })

    it("converts Base to NEAR", async () => {
      const result = await getTokenAddress(
        "base:0xb8cae3ea035ab123c1833258835ef270c9934162",
        ChainKind.Near,
      )
      expect(result).toBe(nearExpected)
    })

    it("converts Arbitrum to NEAR", async () => {
      const result = await getTokenAddress(
        "arb:0xf66f061ac678378c949bdfd3cb8c974272db3f59",
        ChainKind.Near,
      )
      expect(result).toBe(nearExpected)
    })
  })

  describe("Cross-chain conversions", () => {
    it("converts Base to Arbitrum", async () => {
      const result = await getTokenAddress(
        "base:0xb8cae3ea035ab123c1833258835ef270c9934162",
        ChainKind.Arb,
      )
      expect(result).toMatchInlineSnapshot(`"arb:0xf66f061ac678378c949bdfd3cb8c974272db3f59"`)
    })

    it("converts Solana to Base", async () => {
      const result = await getTokenAddress(
        "sol:3wQct2e43J1Z99h2RWrhPAhf6E32ZpuzEt6tgwfEAKAy",
        ChainKind.Base,
      )
      expect(result).toMatchInlineSnapshot(`"base:0xb8cae3ea035ab123c1833258835ef270c9934162"`)
    })
  })

  describe("Error cases", () => {
    it("throws error when source and destination chains are the same", async () => {
      await expect(getTokenAddress("near:wrap.testnet", ChainKind.Near)).rejects.toThrow(
        "Source and destination chains must be different",
      )
    })

    it("throws error for invalid token address format", async () => {
      await expect(getTokenAddress("sol:address", ChainKind.Eth)).rejects.toThrow()
    })

    it("throws error for unknown token address", async () => {
      await expect(
        getTokenAddress("eth:0x1234567890123456789012345678901234567890", ChainKind.Near),
      ).rejects.toThrow()
    })
  })
})
