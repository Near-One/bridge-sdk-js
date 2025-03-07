import { beforeEach, describe, expect, it, vi } from "vitest"
import { ChainKind, type OmniAddress } from "../../src/types"
import { getBridgedToken } from "../../src/utils"

// Mock @near-js/client
vi.mock("@near-js/client", () => ({
  getProviderByNetwork: vi.fn(),
  view: vi.fn(),
}))

// Import the mocked function
import { view } from "@near-js/client"

// Define token mapping with proper types
type ChainMapping = {
  [key in ChainKind]?: OmniAddress
}

type TokenMapping = {
  [address: string]: ChainMapping
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
  // Other chains to their mapped tokens
  "eth:0xa2e932310e7294451d8417aa9b2e647e67df3288": {
    [ChainKind.Near]: "near:wrap.testnet",
    [ChainKind.Sol]: "sol:FUfkKBMpZ74vdWmPjjLpmuekqVkBMjbHqHedVGdSv929",
    [ChainKind.Base]: "base:0xf66f061ac678378c949bdfd3cb8c974272db3f59",
    [ChainKind.Arb]: "arb:0x02eea354d135d1a912967c2d2a6147deb01ef92e",
  },
  "sol:FUfkKBMpZ74vdWmPjjLpmuekqVkBMjbHqHedVGdSv929": {
    [ChainKind.Near]: "near:wrap.testnet",
    [ChainKind.Eth]: "eth:0xa2e932310e7294451d8417aa9b2e647e67df3288",
  },
}

describe("Token Resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Mock the view function to simulate contract responses using proper vitest syntax
    const mockView = vi.mocked(view)

    // @ts-ignore mock params
    mockView.mockImplementation(async (params: unknown) => {
      const chain = (params as { args: { chain: string } }).args?.chain
      const address = (params as { args: { address: string } }).args?.address

      if (!chain || !address) return null

      // Convert string enum name to enum value
      const chainEnum = ChainKind[chain as keyof typeof ChainKind]

      if (!TOKEN_MAPPING[address] || !TOKEN_MAPPING[address][chainEnum]) {
        return null
      }
      return TOKEN_MAPPING[address][chainEnum]
    })
  })

  describe("getBridgedToken", () => {
    it("resolves a token from NEAR to ETH", async () => {
      const result = await getBridgedToken("near:wrap.testnet", ChainKind.Eth)
      expect(result).toBe("eth:0xa2e932310e7294451d8417aa9b2e647e67df3288")
      expect(view).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "get_bridged_token",
          args: {
            chain: "Eth",
            address: "near:wrap.testnet",
          },
        }),
      )
    })

    it("resolves a token from ETH to NEAR", async () => {
      const ethAddress = "eth:0xa2e932310e7294451d8417aa9b2e647e67df3288"
      const result = await getBridgedToken(ethAddress, ChainKind.Near)
      expect(result).toBe("near:wrap.testnet")
    })

    it("resolves a token from ETH to SOL directly", async () => {
      const ethAddress = "eth:0xa2e932310e7294451d8417aa9b2e647e67df3288"
      const result = await getBridgedToken(ethAddress, ChainKind.Sol)
      expect(result).toBe("sol:FUfkKBMpZ74vdWmPjjLpmuekqVkBMjbHqHedVGdSv929")
    })

    it("returns null for unregistered tokens", async () => {
      const invalidAddress = "sol:unregistered"
      const result = await getBridgedToken(invalidAddress, ChainKind.Eth)
      expect(result).toBeNull()
    })

    it("returns null for valid tokens with no mapping to the destination chain", async () => {
      // SOL token has no direct mapping to BASE
      const solToken = "sol:FUfkKBMpZ74vdWmPjjLpmuekqVkBMjbHqHedVGdSv929"
      const result = await getBridgedToken(solToken, ChainKind.Base)
      expect(result).toBeNull()
    })
  })
})
