import { describe, expect, it } from "vitest"
import type { OmniAddress } from "../../src/types/index.js"
import { ChainKind } from "../../src/types/index.js"
import { getChain, isEvmChain, omniAddress, validateAddress, validateOmniAddress } from "../../src/utils/index.js"
describe("Omni Address Utils", () => {
  describe("omniAddress", () => {
    it("should construct valid omni addresses", () => {
      expect(omniAddress(ChainKind.Eth, "0x123")).toBe("eth:0x123")
      expect(omniAddress(ChainKind.Near, "alice.near")).toBe("near:alice.near")
      expect(omniAddress(ChainKind.Sol, "solana123")).toBe("sol:solana123")
      expect(omniAddress(ChainKind.Arb, "0xarb456")).toBe("arb:0xarb456")
      expect(omniAddress(ChainKind.Base, "0xbase789")).toBe("base:0xbase789")
      expect(omniAddress(ChainKind.Bnb, "0xbnb123")).toBe("bnb:0xbnb123")
      expect(omniAddress(ChainKind.Btc, "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")).toBe("btc:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")
    })

    it("should work with empty addresses", () => {
      expect(omniAddress(ChainKind.Eth, "")).toBe("eth:")
    })

    it("should preserve address case", () => {
      expect(omniAddress(ChainKind.Eth, "0xAbCdEf")).toBe("eth:0xAbCdEf")
    })
  })

  describe("getChain", () => {
    it("should extract chain from omni address", () => {
      const addr: OmniAddress = "eth:0x123"
      expect(getChain(addr)).toBe(ChainKind.Eth)
    })

    it("should work with all chain types", () => {
      const addresses: OmniAddress[] = [
        "eth:0x123",
        "near:alice.near",
        "sol:solana123",
        "arb:0xarb456",
        "base:0xbase789",
        "bnb:0xbnb123",
        "btc:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
      ]

      const expected = [
        ChainKind.Eth,
        ChainKind.Near,
        ChainKind.Sol,
        ChainKind.Arb,
        ChainKind.Base,
        ChainKind.Bnb,
        ChainKind.Btc,
      ]

      addresses.forEach((addr, i) => {
        expect(getChain(addr)).toBe(expected[i])
      })
    })
  })

  describe("type system", () => {
    it("should allow valid literal omni addresses", () => {
      const validAddresses: OmniAddress[] = [
        "eth:0x123",
        "near:alice.near",
        "sol:solana123",
        "arb:0xarb456",
        "base:0xbase789",
        "bnb:0xbnb123",
        "btc:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
      ]

      expect(validAddresses.length).toBe(7) // Just to use the array
    })

    it("should allow construction via omniAddress helper", () => {
      const addresses: OmniAddress[] = [
        omniAddress(ChainKind.Eth, "0x123"),
        omniAddress(ChainKind.Near, "alice.near"),
      ]

      expect(addresses.length).toBe(2)
    })

    // TypeScript will catch these at compile time
    // but we can document the behavior in tests
    it("should not allow invalid chain prefixes", () => {
      // @ts-expect-error - invalid chain
      const _invalidAddr: OmniAddress = "invalid:0x123"

      // @ts-expect-error - missing chain
      const _noPrefix: OmniAddress = "0x123"

      // @ts-expect-error - wrong separator
      const _wrongSeparator: OmniAddress = "eth-0x123"

      // Suppress unused variable warnings
      expect(true).toBe(true)
    })
  })

  describe("isEvmChain", () => {
    it("should return true for EVM chains", () => {
      expect(isEvmChain(ChainKind.Eth)).toBe(true)
      expect(isEvmChain(ChainKind.Arb)).toBe(true)
      expect(isEvmChain(ChainKind.Base)).toBe(true)
      expect(isEvmChain(ChainKind.Bnb)).toBe(true)
    })

    it("should return false for non-EVM chains", () => {
      expect(isEvmChain(ChainKind.Near)).toBe(false)
      expect(isEvmChain(ChainKind.Sol)).toBe(false)
      expect(isEvmChain(ChainKind.Btc)).toBe(false)
    })

    it("should work with type checking", () => {
      const chain = ChainKind.Eth
      if (isEvmChain(chain)) {
        // TypeScript should infer that chain is EVMChainKind here
        expect([ChainKind.Eth, ChainKind.Arb, ChainKind.Base, ChainKind.Bnb]).toContain(chain)
      }
    })
  })

  describe("validateAddress", () => {
    describe("EVM chains", () => {
      const evmChains = [ChainKind.Eth, ChainKind.Arb, ChainKind.Base, ChainKind.Bnb]
      
      it("should accept valid EVM addresses", () => {
        const validAddresses = [
          "0x742d35cc6634c0532925a3b8d47cc67d971f111a",
          "0x0000000000000000000000000000000000000000",
          "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
        ]

        for (const chain of evmChains) {
          for (const address of validAddresses) {
            expect(() => validateAddress(chain, address)).not.toThrow()
          }
        }
      })

      it("should reject invalid EVM addresses", () => {
        const invalidAddresses = [
          "0x123", // too short
          "0xgg742d35cc6634c0532925a3b8d47cc67d971f111a", // invalid hex
          "0x742d35cc6634c0532925a3b8d47cc67d971f111", // too short
          "",
          "not_an_address",
          "0x", // just prefix
          "0xGG", // invalid hex chars
        ]

        for (const chain of evmChains) {
          for (const address of invalidAddresses) {
            expect(() => validateAddress(chain, address))
              .toThrow(new RegExp(`Invalid ${ChainKind[chain]} address: ${address}`))
          }
        }
      })
    })

    describe("NEAR chain", () => {
      it("should accept valid NEAR account IDs", () => {
        const validAccountIds = [
          "alice.near",
          "bob.testnet",
          "contract.factory.near",
          "my-account",
          "account_with_underscores",
          "a1", // minimum length
          "a".repeat(64), // maximum length
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", // 64-char hex (implicit account)
        ]

        for (const accountId of validAccountIds) {
          expect(() => validateAddress(ChainKind.Near, accountId)).not.toThrow()
        }
      })

      it("should reject invalid NEAR account IDs", () => {
        const invalidAccountIds = [
          "", // too short
          "a", // too short
          "a".repeat(65), // too long
          "Alice.near", // uppercase not allowed
          "-alice.near", // cannot start with separator
          "alice.near-", // cannot end with separator
          "_alice.near", // cannot start with separator
          "alice.near_", // cannot end with separator
          "alice--bob.near", // consecutive separators
          "alice__bob.near", // consecutive separators
          "alice-_bob.near", // consecutive separators
          "alice_-bob.near", // consecutive separators
          "alice.near!", // invalid character
          "alice@near", // invalid character
        ]

        for (const accountId of invalidAccountIds) {
          expect(() => validateAddress(ChainKind.Near, accountId))
            .toThrow(`Invalid NEAR account ID: ${accountId}`)
        }
      })
    })

    describe("Solana chain", () => {
      it("should accept valid Solana addresses", () => {
        const validAddresses = [
          "11111111111111111111111111111112", // System program
          "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // Token program
          "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", // Random valid address
        ]

        for (const address of validAddresses) {
          expect(() => validateAddress(ChainKind.Sol, address)).not.toThrow()
        }
      })

      it("should reject invalid Solana addresses", () => {
        const invalidAddresses = [
          "invalid",
          "", // empty
          "O", // invalid character (O not in base58)
          "0", // invalid character (0 not in base58)
          "I", // invalid character (I not in base58)
          "l", // invalid character (l not in base58)
          "toolong" + "a".repeat(50), // too long
        ]

        for (const address of invalidAddresses) {
          expect(() => validateAddress(ChainKind.Sol, address))
            .toThrow(`Invalid Solana address: ${address}`)
        }
      })
    })

    describe("Bitcoin chain", () => {
      it("should accept valid Bitcoin addresses", () => {
        const validAddresses = [
          "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", // P2PKH (legacy)
          "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy", // P2SH
          "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", // P2WPKH (bech32)
          "bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3", // P2WSH (bech32)
        ]

        for (const address of validAddresses) {
          expect(() => validateAddress(ChainKind.Btc, address)).not.toThrow()
        }
      })

      it("should reject invalid Bitcoin addresses", () => {
        const invalidAddresses = [
          "invalid",
          "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfN", // invalid checksum
          "", // empty
          "bc1qinvalid", // invalid bech32
          "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNL", // invalid checksum
        ]

        for (const address of invalidAddresses) {
          expect(() => validateAddress(ChainKind.Btc, address))
            .toThrow(`Invalid Bitcoin address: ${address}`)
        }
      })
    })
  })

  describe("validateOmniAddress", () => {
    it("should return valid OmniAddress for valid inputs", () => {
      const testCases = [
        { chain: ChainKind.Eth, address: "0x742d35cc6634c0532925a3b8d47cc67d971f111a", expected: "eth:0x742d35cc6634c0532925a3b8d47cc67d971f111a" },
        { chain: ChainKind.Near, address: "alice.near", expected: "near:alice.near" },
        { chain: ChainKind.Sol, address: "11111111111111111111111111111112", expected: "sol:11111111111111111111111111111112" },
        { chain: ChainKind.Btc, address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", expected: "btc:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa" },
      ]

      for (const { chain, address, expected } of testCases) {
        const result = validateOmniAddress(chain, address)
        expect(result).toBe(expected)
      }
    })

    it("should throw for invalid addresses", () => {
      const testCases = [
        { chain: ChainKind.Eth, address: "invalid" },
        { chain: ChainKind.Near, address: "Alice.near" },
        { chain: ChainKind.Sol, address: "invalid" },
        { chain: ChainKind.Btc, address: "invalid" },
      ]

      for (const { chain, address } of testCases) {
        expect(() => validateOmniAddress(chain, address)).toThrow()
      }
    })
  })
})
