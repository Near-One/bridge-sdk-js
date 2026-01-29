import { describe, expect, it } from "vitest"
import { ChainKind } from "../src/types.js"
import { isBridgeToken, parseOriginChain } from "../src/utils/bridge-token.js"

describe("Bridge Token Utils", () => {
  describe("isBridgeToken", () => {
    it("should return true for native bridge tokens on mainnet", () => {
      expect(isBridgeToken("nbtc.bridge.near")).toBe(true)
      expect(isBridgeToken("nzec.bridge.near")).toBe(true)
    })

    it("should return true for native bridge tokens on testnet", () => {
      expect(isBridgeToken("nbtc.n-bridge.testnet")).toBe(true)
      expect(isBridgeToken("nzcash.n-bridge.testnet")).toBe(true)
    })

    it("should return true for deployed bridge tokens with chain prefixes", () => {
      expect(isBridgeToken("eth-abc123.omdep.near")).toBe(true)
      expect(isBridgeToken("sol-xyz789.omdep.near")).toBe(true)
      expect(isBridgeToken("arb-token.omdep.near")).toBe(true)
      expect(isBridgeToken("base-usdc.omdep.near")).toBe(true)
      expect(isBridgeToken("bnb-token.omdep.near")).toBe(true)
      expect(isBridgeToken("pol-matic.omdep.near")).toBe(true)
    })

    it("should return true for tokens under bridge.near suffix", () => {
      expect(isBridgeToken("some-token.bridge.near")).toBe(true)
    })

    it("should return true for tokens under n-bridge.testnet suffix", () => {
      expect(isBridgeToken("some-token.n-bridge.testnet")).toBe(true)
    })

    it("should return false for regular NEAR accounts", () => {
      expect(isBridgeToken("alice.near")).toBe(false)
      expect(isBridgeToken("random.testnet")).toBe(false)
      expect(isBridgeToken("wrap.near")).toBe(false)
      expect(isBridgeToken("usdt.tether-token.near")).toBe(false)
    })

    it("should return false for similar but non-bridge addresses", () => {
      expect(isBridgeToken("notbridge.near")).toBe(false)
      expect(isBridgeToken("my-bridge.near")).toBe(false)
    })
  })

  describe("parseOriginChain", () => {
    it("should return ChainKind.Btc for nbtc tokens", () => {
      expect(parseOriginChain("nbtc.bridge.near")).toBe(ChainKind.Btc)
      expect(parseOriginChain("nbtc.n-bridge.testnet")).toBe(ChainKind.Btc)
    })

    it("should return ChainKind.Zcash for nzec tokens", () => {
      expect(parseOriginChain("nzec.bridge.near")).toBe(ChainKind.Zcash)
      expect(parseOriginChain("nzcash.n-bridge.testnet")).toBe(ChainKind.Zcash)
    })

    it("should parse chain from deployed tokens with eth prefix", () => {
      expect(parseOriginChain("eth-abc123.omdep.near")).toBe(ChainKind.Eth)
      expect(parseOriginChain("eth-usdc.bridge.near")).toBe(ChainKind.Eth)
    })

    it("should parse chain from deployed tokens with sol prefix", () => {
      expect(parseOriginChain("sol-xyz789.omdep.near")).toBe(ChainKind.Sol)
    })

    it("should parse chain from deployed tokens with arb prefix", () => {
      expect(parseOriginChain("arb-token.omdep.near")).toBe(ChainKind.Arb)
    })

    it("should parse chain from deployed tokens with base prefix", () => {
      expect(parseOriginChain("base-usdc.omdep.near")).toBe(ChainKind.Base)
    })

    it("should parse chain from deployed tokens with bnb prefix", () => {
      expect(parseOriginChain("bnb-token.omdep.near")).toBe(ChainKind.Bnb)
    })

    it("should parse chain from deployed tokens with pol prefix", () => {
      expect(parseOriginChain("pol-matic.omdep.near")).toBe(ChainKind.Pol)
    })

    it("should return null for non-bridge tokens", () => {
      expect(parseOriginChain("alice.near")).toBe(null)
      expect(parseOriginChain("wrap.near")).toBe(null)
      expect(parseOriginChain("random.testnet")).toBe(null)
    })

    it("should return null for bridge suffix without chain prefix", () => {
      expect(parseOriginChain("unknown-token.bridge.near")).toBe(null)
    })
  })
})
