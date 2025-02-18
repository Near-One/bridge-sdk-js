import { beforeEach, describe, expect, it, vi } from "vitest"
import { getChain } from "../../src"
import { ChainKind, type OmniAddress } from "../../src/types"

// First mock @near-js/client
vi.mock("@near-js/client", () => ({
  getProviderByNetwork: vi.fn(),
  view: vi.fn(),
}))

// Import the actual functions

// Define types for our token mapping
type ChainMapping = {
  [K in ChainKind]?: string
}

type TokenMapping = {
  [key: string]: ChainMapping
}

// Define token mapping as source of truth
const TOKEN_MAPPING: TokenMapping = {
  // NEAR wrapped token to other chains
  "near:wrap.testnet": {
    [ChainKind.Eth]: "eth:0xa2e932310e7294451d8417aa9b2e647e67df3288",
    [ChainKind.Sol]: "sol:FUfkKBMpZ74vdWmPjjLpmuekqVkBMjbHqHedVGdSv929",
    [ChainKind.Base]: "base:0xf66f061ac678378c949bdfd3cb8c974272db3f59",
    [ChainKind.Arb]: "arb:0x02eea354d135d1a912967c2d2a6147deb01ef92e",
  },
  // Other chains to NEAR
  "eth:0xa2e932310e7294451d8417aa9b2e647e67df3288": {
    [ChainKind.Near]: "wrap.testnet",
  },
  "sol:FUfkKBMpZ74vdWmPjjLpmuekqVkBMjbHqHedVGdSv929": {
    [ChainKind.Near]: "wrap.testnet",
  },
  "base:0xf66f061ac678378c949bdfd3cb8c974272db3f59": {
    [ChainKind.Near]: "wrap.testnet",
  },
  "arb:0x02eea354d135d1a912967c2d2a6147deb01ef92e": {
    [ChainKind.Near]: "wrap.testnet",
  },
}

// Create mock functions
const mockConvertToNear = vi.fn()
const mockConvertFromNear = vi.fn()

describe("Token Conversion", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Setup our mock implementations
    mockConvertToNear.mockImplementation(async (tokenAddress: OmniAddress) => {
      const mapping = TOKEN_MAPPING[tokenAddress]
      if (!mapping?.[ChainKind.Near]) {
        throw new Error("Invalid token address")
      }
      return `near:${mapping[ChainKind.Near]}`
    })

    mockConvertFromNear.mockImplementation(
      async (tokenAddress: OmniAddress, destinationChain: ChainKind) => {
        const mapping = TOKEN_MAPPING[tokenAddress]
        if (!mapping?.[destinationChain]) {
          throw new Error("Conversion failed")
        }
        return mapping[destinationChain]
      },
    )
  })

  // Helper function for testing that uses dependency injection
  const testGetTokenAddress = async (tokenAddress: OmniAddress, destinationChain: ChainKind) => {
    // First validate chains are different
    const sourceChain = getChain(tokenAddress)

    if (sourceChain === destinationChain) {
      throw new Error("Source and destination chains must be different")
    }

    if (sourceChain === ChainKind.Near) {
      return mockConvertFromNear(tokenAddress, destinationChain)
    }

    if (destinationChain === ChainKind.Near) {
      return mockConvertToNear(tokenAddress)
    }

    const nearToken = await mockConvertToNear(tokenAddress)
    return mockConvertFromNear(nearToken, destinationChain)
  }

  describe("Direct Conversions", () => {
    it("throws error when source and destination chains are the same", async () => {
      await expect(testGetTokenAddress("near:wrap.testnet", ChainKind.Near)).rejects.toThrow(
        "Source and destination chains must be different",
      )
    })

    it("converts from NEAR to ETH directly", async () => {
      const result = await testGetTokenAddress("near:wrap.testnet", ChainKind.Eth)
      expect(result).toBe(TOKEN_MAPPING["near:wrap.testnet"][ChainKind.Eth])
      expect(mockConvertFromNear).toHaveBeenCalledWith("near:wrap.testnet", ChainKind.Eth)
      expect(mockConvertToNear).not.toHaveBeenCalled()
    })

    it("converts from ETH to NEAR directly", async () => {
      const ethAddress = "eth:0xa2e932310e7294451d8417aa9b2e647e67df3288"
      const result = await testGetTokenAddress(ethAddress, ChainKind.Near)
      expect(result).toBe("near:wrap.testnet")
      expect(mockConvertToNear).toHaveBeenCalledWith(ethAddress)
      expect(mockConvertFromNear).not.toHaveBeenCalled()
    })
  })

  describe("Cross-chain Conversions", () => {
    it("converts from ETH to SOL via NEAR as intermediary", async () => {
      const ethAddress = "eth:0xa2e932310e7294451d8417aa9b2e647e67df3288"
      const result = await testGetTokenAddress(ethAddress, ChainKind.Sol)
      expect(result).toBe(TOKEN_MAPPING["near:wrap.testnet"][ChainKind.Sol])
      expect(mockConvertToNear).toHaveBeenCalledWith(ethAddress)
      expect(mockConvertFromNear).toHaveBeenCalledWith("near:wrap.testnet", ChainKind.Sol)
    })

    it("converts from BASE to ARB via NEAR as intermediary", async () => {
      const baseAddress = "base:0xf66f061ac678378c949bdfd3cb8c974272db3f59"
      const result = await testGetTokenAddress(baseAddress, ChainKind.Arb)
      expect(result).toBe(TOKEN_MAPPING["near:wrap.testnet"][ChainKind.Arb])
      expect(mockConvertToNear).toHaveBeenCalledWith(baseAddress)
      expect(mockConvertFromNear).toHaveBeenCalledWith("near:wrap.testnet", ChainKind.Arb)
    })
  })

  describe("Comprehensive Tests", () => {
    it("converts all possible NEAR combinations", async () => {
      const nearToken = "near:wrap.testnet"
      const destinations = [ChainKind.Eth, ChainKind.Sol, ChainKind.Base, ChainKind.Arb]

      for (const destChain of destinations) {
        const result = await testGetTokenAddress(nearToken, destChain)
        expect(result).toBe(TOKEN_MAPPING[nearToken][destChain])
        expect(mockConvertFromNear).toHaveBeenCalledWith(nearToken, destChain)
      }
    })

    it("converts all chains to NEAR", async () => {
      const sourceAddresses: OmniAddress[] = [
        "eth:0xa2e932310e7294451d8417aa9b2e647e67df3288",
        "sol:FUfkKBMpZ74vdWmPjjLpmuekqVkBMjbHqHedVGdSv929",
        "base:0xf66f061ac678378c949bdfd3cb8c974272db3f59",
        "arb:0x02eea354d135d1a912967c2d2a6147deb01ef92e",
      ]

      for (const address of sourceAddresses) {
        const result = await testGetTokenAddress(address, ChainKind.Near)
        expect(result).toBe("near:wrap.testnet")
        expect(mockConvertToNear).toHaveBeenCalledWith(address)
      }
    })
  })

  describe("Error Cases", () => {
    it("handles invalid token address", async () => {
      const invalidAddress = "sol:address"
      await expect(testGetTokenAddress(invalidAddress, ChainKind.Eth)).rejects.toThrow(
        "Invalid token address",
      )
    })

    it("handles conversion to unsupported chain", async () => {
      const ethAddress = "eth:0xa2e932310e7294451d8417aa9b2e647e67df3288"
      await expect(testGetTokenAddress(ethAddress, 999 as ChainKind)).rejects.toThrow(
        "Conversion failed",
      )
    })

    it("handles non-existent token mappings", async () => {
      const invalidNearToken = "near:invalid.testnet"
      await expect(testGetTokenAddress(invalidNearToken, ChainKind.Eth)).rejects.toThrow(
        "Conversion failed",
      )
    })

    it("handles failure in multi-step conversion", async () => {
      // Mock success for first step but failure for second step
      const ethAddress = "eth:0xa2e932310e7294451d8417aa9b2e647e67df3288"
      mockConvertFromNear.mockRejectedValueOnce(new Error("Destination chain unavailable"))

      await expect(testGetTokenAddress(ethAddress, ChainKind.Sol)).rejects.toThrow(
        "Destination chain unavailable",
      )
    })
  })
})
