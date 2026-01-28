import { describe, expect, it } from "vitest"
import { ChainKind } from "../src/types.js"
import { isBridgeToken, parseOriginChain } from "../src/utils/token.js"

describe("Token Utils", () => {
  describe("isBridgeToken", () => {
    it("should return true for known mainnet bridge tokens", () => {
      expect(isBridgeToken("nbtc.bridge.near")).toBe(true)
      expect(isBridgeToken("nzec.bridge.near")).toBe(true)
      expect(isBridgeToken("eth.bridge.near")).toBe(true)
      expect(isBridgeToken("sol.omdep.near")).toBe(true)
      expect(isBridgeToken("base.omdep.near")).toBe(true)
      expect(isBridgeToken("arb.omdep.near")).toBe(true)
      expect(isBridgeToken("bnb.omdep.near")).toBe(true)
    })

    it("should return true for known testnet bridge tokens", () => {
      expect(isBridgeToken("nbtc.n-bridge.testnet")).toBe(true)
      expect(isBridgeToken("sol.omnidep.testnet")).toBe(true)
      expect(isBridgeToken("base.omnidep.testnet")).toBe(true)
    })

    it("should return true for wrapped tokens with factory suffix", () => {
      expect(isBridgeToken("sol-ABC123.omdep.near")).toBe(true)
      expect(isBridgeToken("base-0x1234.omdep.near")).toBe(true)
      expect(isBridgeToken("arb-0xabcd.omnidep.testnet")).toBe(true)
      expect(isBridgeToken("eth-token.factory.bridge.near")).toBe(true)
      expect(isBridgeToken("usdc.factory.bridge.testnet")).toBe(true)
    })

    it("should return false for non-bridge tokens", () => {
      expect(isBridgeToken("random.near")).toBe(false)
      expect(isBridgeToken("alice.near")).toBe(false)
      expect(isBridgeToken("wrap.near")).toBe(false)
      expect(isBridgeToken("usdt.tether-token.near")).toBe(false)
      expect(isBridgeToken("")).toBe(false)
    })
  })

  describe("parseOriginChain", () => {
    describe("exact matches", () => {
      it("should parse mainnet BTC token", () => {
        expect(parseOriginChain("nbtc.bridge.near")).toBe(ChainKind.Btc)
      })

      it("should parse mainnet Zcash token", () => {
        expect(parseOriginChain("nzec.bridge.near")).toBe(ChainKind.Zcash)
      })

      it("should parse mainnet ETH token", () => {
        expect(parseOriginChain("eth.bridge.near")).toBe(ChainKind.Eth)
      })

      it("should parse mainnet SOL token", () => {
        expect(parseOriginChain("sol.omdep.near")).toBe(ChainKind.Sol)
      })

      it("should parse mainnet Base token", () => {
        expect(parseOriginChain("base.omdep.near")).toBe(ChainKind.Base)
      })

      it("should parse mainnet Arb token", () => {
        expect(parseOriginChain("arb.omdep.near")).toBe(ChainKind.Arb)
      })

      it("should parse mainnet BNB token", () => {
        expect(parseOriginChain("bnb.omdep.near")).toBe(ChainKind.Bnb)
      })

      it("should parse testnet tokens", () => {
        expect(parseOriginChain("nbtc.n-bridge.testnet")).toBe(ChainKind.Btc)
        expect(parseOriginChain("sol.omnidep.testnet")).toBe(ChainKind.Sol)
        expect(parseOriginChain("base.omnidep.testnet")).toBe(ChainKind.Base)
      })
    })

    describe("prefix patterns", () => {
      it("should parse SOL-prefixed wrapped tokens", () => {
        expect(parseOriginChain("sol-ABC123.omdep.near")).toBe(ChainKind.Sol)
        expect(parseOriginChain("sol-TokenMint.omnidep.testnet")).toBe(ChainKind.Sol)
      })

      it("should parse Base-prefixed wrapped tokens", () => {
        expect(parseOriginChain("base-0x1234.omdep.near")).toBe(ChainKind.Base)
      })

      it("should parse Arb-prefixed wrapped tokens", () => {
        expect(parseOriginChain("arb-0xabcd.omdep.near")).toBe(ChainKind.Arb)
      })

      it("should parse BNB-prefixed wrapped tokens", () => {
        expect(parseOriginChain("bnb-0x5678.omdep.near")).toBe(ChainKind.Bnb)
      })

      it("should parse Pol-prefixed wrapped tokens", () => {
        expect(parseOriginChain("pol-0x9999.omdep.near")).toBe(ChainKind.Pol)
      })
    })

    describe("factory.bridge pattern", () => {
      it("should parse ETH tokens from factory.bridge", () => {
        expect(parseOriginChain("usdc.factory.bridge.near")).toBe(ChainKind.Eth)
        expect(parseOriginChain("dai.factory.bridge.testnet")).toBe(ChainKind.Eth)
      })
    })

    describe("unrecognized patterns", () => {
      it("should return null for random NEAR accounts", () => {
        expect(parseOriginChain("random.near")).toBeNull()
        expect(parseOriginChain("alice.near")).toBeNull()
      })

      it("should return null for non-bridge tokens", () => {
        expect(parseOriginChain("wrap.near")).toBeNull()
        expect(parseOriginChain("usdt.tether-token.near")).toBeNull()
      })

      it("should return null for empty string", () => {
        expect(parseOriginChain("")).toBeNull()
      })

      it("should return null for tokens with unknown prefix but valid suffix", () => {
        // Has valid suffix but unknown prefix - could be a new chain or unknown token
        expect(parseOriginChain("unknown-abc.omdep.near")).toBeNull()
      })
    })
  })
})
