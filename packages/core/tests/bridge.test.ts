import { beforeEach, describe, expect, it, vi } from "vitest"
import { createBridge, type Bridge } from "../src/bridge.js"
import { ValidationError } from "../src/errors.js"
import { ChainKind, type OmniAddress, type TransferParams } from "../src/types.js"

// Mock near-kit
const mockNearView = vi.fn()
const mockNearConstructor = vi.fn()
vi.mock("near-kit", () => ({
  Near: class {
    constructor(config: unknown) {
      mockNearConstructor(config)
    }
    view = mockNearView
  },
}))

describe("createBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("creates bridge with testnet config", () => {
    const bridge = createBridge({ network: "testnet" })

    expect(bridge.network).toBe("testnet")
    expect(bridge.addresses).toBeDefined()
    expect(bridge.api).toBeDefined()
  })

  it("creates bridge with mainnet config", () => {
    const bridge = createBridge({ network: "mainnet" })

    expect(bridge.network).toBe("mainnet")
    expect(bridge.addresses).toBeDefined()
  })

  it("uses default RPC when rpcUrls not provided", () => {
    createBridge({ network: "mainnet" })

    expect(mockNearConstructor).toHaveBeenCalledWith({ network: "mainnet" })
  })

  it("uses custom NEAR RPC URL when provided", () => {
    createBridge({
      network: "mainnet",
      rpcUrls: { [ChainKind.Near]: "https://custom-rpc.example.com" },
    })

    expect(mockNearConstructor).toHaveBeenCalledWith({
      rpcUrl: "https://custom-rpc.example.com",
      network: "mainnet",
    })
  })

  it("ignores non-NEAR rpcUrls entries", () => {
    createBridge({
      network: "mainnet",
      rpcUrls: { [ChainKind.Eth]: "https://eth-rpc.example.com" },
    })

    expect(mockNearConstructor).toHaveBeenCalledWith({ network: "mainnet" })
  })
})

describe("Bridge.validateTransfer", () => {
  let bridge: Bridge

  beforeEach(() => {
    vi.clearAllMocks()
    bridge = createBridge({ network: "testnet" })

    // Default mock for token decimals
    mockNearView.mockImplementation(async (_contract: string, method: string, args: unknown) => {
      if (method === "get_token_decimals") {
        return { decimals: 18, origin_decimals: 18 }
      }
      if (method === "get_bridged_token") {
        const { chain, address } = args as { chain: string; address: string }
        if (address === "near:wrap.testnet") {
          if (chain === "Eth") return "eth:0x1234567890123456789012345678901234567890"
          if (chain === "Sol") return "sol:So11111111111111111111111111111111111111112"
        }
        return null
      }
      return null
    })
  })

  describe("basic validation", () => {
    it("validates a simple ETH to NEAR transfer", async () => {
      const params: TransferParams = {
        token: "eth:0x1234567890123456789012345678901234567890" as OmniAddress,
        amount: 1000000000000000000n, // 1 ETH
        fee: 0n,
        nativeFee: 0n,
        sender: "eth:0xABCDEF0123456789ABCDEF0123456789ABCDEF01" as OmniAddress,
        recipient: "near:alice.testnet" as OmniAddress,
      }

      const result = await bridge.validateTransfer(params)

      expect(result.sourceChain).toBe(ChainKind.Eth)
      expect(result.destChain).toBe(ChainKind.Near)
      expect(result.params).toEqual(params)
      expect(result.contractAddress).toBeDefined()
      expect(result.normalizedAmount).toBe(1000000000000000000n)
    })

    it("validates a NEAR to ETH transfer", async () => {
      const params: TransferParams = {
        token: "near:wrap.testnet" as OmniAddress,
        amount: 1000000000000000000n,
        fee: 0n,
        nativeFee: 0n,
        sender: "near:alice.testnet" as OmniAddress,
        recipient: "eth:0xABCDEF0123456789ABCDEF0123456789ABCDEF01" as OmniAddress,
      }

      const result = await bridge.validateTransfer(params)

      expect(result.sourceChain).toBe(ChainKind.Near)
      expect(result.destChain).toBe(ChainKind.Eth)
      expect(result.bridgedToken).toBe("eth:0x1234567890123456789012345678901234567890")
    })

    it("validates a NEAR to Solana transfer", async () => {
      const params: TransferParams = {
        token: "near:wrap.testnet" as OmniAddress,
        amount: 1000000000000000000n,
        fee: 0n,
        nativeFee: 0n,
        sender: "near:alice.testnet" as OmniAddress,
        recipient: "sol:So11111111111111111111111111111111111111112" as OmniAddress,
      }

      const result = await bridge.validateTransfer(params)

      expect(result.sourceChain).toBe(ChainKind.Near)
      expect(result.destChain).toBe(ChainKind.Sol)
    })
  })

  describe("amount validation", () => {
    it("throws for zero amount", async () => {
      const params: TransferParams = {
        token: "eth:0x1234567890123456789012345678901234567890" as OmniAddress,
        amount: 0n,
        fee: 0n,
        nativeFee: 0n,
        sender: "eth:0xABCDEF0123456789ABCDEF0123456789ABCDEF01" as OmniAddress,
        recipient: "near:alice.testnet" as OmniAddress,
      }

      await expect(bridge.validateTransfer(params)).rejects.toThrow(ValidationError)
      await expect(bridge.validateTransfer(params)).rejects.toThrow("Amount must be positive")
    })

    it("throws for negative amount", async () => {
      const params: TransferParams = {
        token: "eth:0x1234567890123456789012345678901234567890" as OmniAddress,
        amount: -1n,
        fee: 0n,
        nativeFee: 0n,
        sender: "eth:0xABCDEF0123456789ABCDEF0123456789ABCDEF01" as OmniAddress,
        recipient: "near:alice.testnet" as OmniAddress,
      }

      await expect(bridge.validateTransfer(params)).rejects.toThrow("Amount must be positive")
    })

    it("throws for negative fee", async () => {
      const params: TransferParams = {
        token: "eth:0x1234567890123456789012345678901234567890" as OmniAddress,
        amount: 1000000000000000000n,
        fee: -1n,
        nativeFee: 0n,
        sender: "eth:0xABCDEF0123456789ABCDEF0123456789ABCDEF01" as OmniAddress,
        recipient: "near:alice.testnet" as OmniAddress,
      }

      await expect(bridge.validateTransfer(params)).rejects.toThrow("Fee cannot be negative")
    })

    it("throws for negative native fee", async () => {
      const params: TransferParams = {
        token: "eth:0x1234567890123456789012345678901234567890" as OmniAddress,
        amount: 1000000000000000000n,
        fee: 0n,
        nativeFee: -1n,
        sender: "eth:0xABCDEF0123456789ABCDEF0123456789ABCDEF01" as OmniAddress,
        recipient: "near:alice.testnet" as OmniAddress,
      }

      await expect(bridge.validateTransfer(params)).rejects.toThrow("Native fee cannot be negative")
    })
  })

  describe("EVM address validation", () => {
    it("throws for invalid EVM sender address", async () => {
      const params: TransferParams = {
        token: "eth:0x1234567890123456789012345678901234567890" as OmniAddress,
        amount: 1000000000000000000n,
        fee: 0n,
        nativeFee: 0n,
        sender: "eth:0xinvalid" as OmniAddress,
        recipient: "near:alice.testnet" as OmniAddress,
      }

      await expect(bridge.validateTransfer(params)).rejects.toThrow("Invalid EVM sender address")
    })

    it("throws for invalid EVM recipient address", async () => {
      const params: TransferParams = {
        token: "near:wrap.testnet" as OmniAddress,
        amount: 1000000000000000000n,
        fee: 0n,
        nativeFee: 0n,
        sender: "near:alice.testnet" as OmniAddress,
        recipient: "eth:0xshort" as OmniAddress,
      }

      await expect(bridge.validateTransfer(params)).rejects.toThrow("Invalid EVM recipient address")
    })

    it("accepts valid checksummed EVM addresses", async () => {
      const params: TransferParams = {
        token: "eth:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as OmniAddress,
        amount: 1000000n, // USDC has 6 decimals
        fee: 0n,
        nativeFee: 0n,
        sender: "eth:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as OmniAddress,
        recipient: "near:alice.testnet" as OmniAddress,
      }

      // Should not throw
      const result = await bridge.validateTransfer(params)
      expect(result.sourceChain).toBe(ChainKind.Eth)
    })
  })

  describe("token registration", () => {
    it("throws when NEAR token not registered on destination", async () => {
      mockNearView.mockImplementation(async (_contract: string, method: string) => {
        if (method === "get_bridged_token") return null
        if (method === "get_token_decimals") return { decimals: 18, origin_decimals: 18 }
        return null
      })

      const params: TransferParams = {
        token: "near:unregistered.testnet" as OmniAddress,
        amount: 1000000000000000000n,
        fee: 0n,
        nativeFee: 0n,
        sender: "near:alice.testnet" as OmniAddress,
        recipient: "eth:0xABCDEF0123456789ABCDEF0123456789ABCDEF01" as OmniAddress,
      }

      await expect(bridge.validateTransfer(params)).rejects.toThrow(
        "Token not registered on destination chain",
      )
    })

    it("throws when foreign token decimals not found", async () => {
      mockNearView.mockImplementation(async (_contract: string, method: string) => {
        if (method === "get_token_decimals") return null
        return null
      })

      const params: TransferParams = {
        token: "eth:0x1234567890123456789012345678901234567890" as OmniAddress,
        amount: 1000000000000000000n,
        fee: 0n,
        nativeFee: 0n,
        sender: "eth:0xABCDEF0123456789ABCDEF0123456789ABCDEF01" as OmniAddress,
        recipient: "near:alice.testnet" as OmniAddress,
      }

      await expect(bridge.validateTransfer(params)).rejects.toThrow("Token not registered")
    })
  })

  describe("decimal normalization", () => {
    it("normalizes 18 decimal token to 6 decimals", async () => {
      mockNearView.mockImplementation(async (_contract: string, method: string) => {
        if (method === "get_token_decimals") {
          return { decimals: 18, origin_decimals: 6 }
        }
        return null
      })

      const params: TransferParams = {
        token: "eth:0x1234567890123456789012345678901234567890" as OmniAddress,
        amount: 1000000000000000000n, // 1.0 with 18 decimals
        fee: 0n,
        nativeFee: 0n,
        sender: "eth:0xABCDEF0123456789ABCDEF0123456789ABCDEF01" as OmniAddress,
        recipient: "near:alice.testnet" as OmniAddress,
      }

      const result = await bridge.validateTransfer(params)

      // Normalized to 6 decimals: 1.0 = 1000000
      expect(result.normalizedAmount).toBe(1000000n)
    })

    it("handles fee normalization correctly", async () => {
      mockNearView.mockImplementation(async (_contract: string, method: string) => {
        if (method === "get_token_decimals") {
          return { decimals: 18, origin_decimals: 6 }
        }
        return null
      })

      const params: TransferParams = {
        token: "eth:0x1234567890123456789012345678901234567890" as OmniAddress,
        amount: 1000000000000000000n, // 1.0
        fee: 100000000000000000n, // 0.1
        nativeFee: 0n,
        sender: "eth:0xABCDEF0123456789ABCDEF0123456789ABCDEF01" as OmniAddress,
        recipient: "near:alice.testnet" as OmniAddress,
      }

      const result = await bridge.validateTransfer(params)

      expect(result.normalizedAmount).toBe(1000000n) // 1.0
      expect(result.normalizedFee).toBe(100000n) // 0.1
    })

    it("throws when amount would be lost to decimal truncation", async () => {
      mockNearView.mockImplementation(async (_contract: string, method: string) => {
        if (method === "get_token_decimals") {
          return { decimals: 18, origin_decimals: 6 }
        }
        return null
      })

      const params: TransferParams = {
        token: "eth:0x1234567890123456789012345678901234567890" as OmniAddress,
        amount: 1n, // Too small - would be 0 after normalization
        fee: 0n,
        nativeFee: 0n,
        sender: "eth:0xABCDEF0123456789ABCDEF0123456789ABCDEF01" as OmniAddress,
        recipient: "near:alice.testnet" as OmniAddress,
      }

      await expect(bridge.validateTransfer(params)).rejects.toThrow()
    })
  })

  describe("contract address resolution", () => {
    it("returns correct contract for ETH source", async () => {
      const params: TransferParams = {
        token: "eth:0x1234567890123456789012345678901234567890" as OmniAddress,
        amount: 1000000000000000000n,
        fee: 0n,
        nativeFee: 0n,
        sender: "eth:0xABCDEF0123456789ABCDEF0123456789ABCDEF01" as OmniAddress,
        recipient: "near:alice.testnet" as OmniAddress,
      }

      const result = await bridge.validateTransfer(params)

      expect(result.contractAddress).toBe(bridge.addresses.eth.bridge)
    })

    it("returns correct contract for NEAR source", async () => {
      const params: TransferParams = {
        token: "near:wrap.testnet" as OmniAddress,
        amount: 1000000000000000000n,
        fee: 0n,
        nativeFee: 0n,
        sender: "near:alice.testnet" as OmniAddress,
        recipient: "eth:0xABCDEF0123456789ABCDEF0123456789ABCDEF01" as OmniAddress,
      }

      const result = await bridge.validateTransfer(params)

      expect(result.contractAddress).toBe(bridge.addresses.near.contract)
    })

    it("returns correct contract for Base source", async () => {
      const params: TransferParams = {
        token: "base:0x1234567890123456789012345678901234567890" as OmniAddress,
        amount: 1000000000000000000n,
        fee: 0n,
        nativeFee: 0n,
        sender: "base:0xABCDEF0123456789ABCDEF0123456789ABCDEF01" as OmniAddress,
        recipient: "near:alice.testnet" as OmniAddress,
      }

      const result = await bridge.validateTransfer(params)

      expect(result.contractAddress).toBe(bridge.addresses.base.bridge)
    })

    it("returns correct contract for Arbitrum source", async () => {
      const params: TransferParams = {
        token: "arb:0x1234567890123456789012345678901234567890" as OmniAddress,
        amount: 1000000000000000000n,
        fee: 0n,
        nativeFee: 0n,
        sender: "arb:0xABCDEF0123456789ABCDEF0123456789ABCDEF01" as OmniAddress,
        recipient: "near:alice.testnet" as OmniAddress,
      }

      const result = await bridge.validateTransfer(params)

      expect(result.contractAddress).toBe(bridge.addresses.arb.bridge)
    })
  })
})

describe("Bridge.getTokenDecimals", () => {
  let bridge: Bridge

  beforeEach(() => {
    vi.clearAllMocks()
    bridge = createBridge({ network: "testnet" })
  })

  it("returns decimals for registered token", async () => {
    mockNearView.mockResolvedValue({ decimals: 18, origin_decimals: 6 })

    const result = await bridge.getTokenDecimals(
      "eth:0x1234567890123456789012345678901234567890" as OmniAddress,
    )

    expect(result).toEqual({ decimals: 18, origin_decimals: 6 })
    expect(mockNearView).toHaveBeenCalledWith(
      expect.any(String),
      "get_token_decimals",
      { address: "eth:0x1234567890123456789012345678901234567890" },
    )
  })

  it("returns null for unregistered token", async () => {
    mockNearView.mockResolvedValue(null)

    const result = await bridge.getTokenDecimals(
      "eth:0x0000000000000000000000000000000000000000" as OmniAddress,
    )

    expect(result).toBeNull()
  })
})

describe("Bridge.getBridgedToken", () => {
  let bridge: Bridge

  beforeEach(() => {
    vi.clearAllMocks()
    bridge = createBridge({ network: "testnet" })
  })

  it("returns bridged token address", async () => {
    mockNearView.mockResolvedValue("eth:0xABCDEF0123456789ABCDEF0123456789ABCDEF01")

    const result = await bridge.getBridgedToken(
      "near:wrap.testnet" as OmniAddress,
      ChainKind.Eth,
    )

    expect(result).toBe("eth:0xABCDEF0123456789ABCDEF0123456789ABCDEF01")
    expect(mockNearView).toHaveBeenCalledWith(
      expect.any(String),
      "get_bridged_token",
      { chain: "Eth", address: "near:wrap.testnet" },
    )
  })

  it("returns null for unregistered token", async () => {
    mockNearView.mockResolvedValue(null)

    const result = await bridge.getBridgedToken(
      "near:unknown.testnet" as OmniAddress,
      ChainKind.Eth,
    )

    expect(result).toBeNull()
  })

  it("uses correct chain name for Solana", async () => {
    mockNearView.mockResolvedValue("sol:So11111111111111111111111111111111111111112")

    await bridge.getBridgedToken("near:wrap.testnet" as OmniAddress, ChainKind.Sol)

    expect(mockNearView).toHaveBeenCalledWith(
      expect.any(String),
      "get_bridged_token",
      { chain: "Sol", address: "near:wrap.testnet" },
    )
  })

  it("uses correct chain name for Base", async () => {
    mockNearView.mockResolvedValue("base:0x1234567890123456789012345678901234567890")

    await bridge.getBridgedToken("near:wrap.testnet" as OmniAddress, ChainKind.Base)

    expect(mockNearView).toHaveBeenCalledWith(
      expect.any(String),
      "get_bridged_token",
      { chain: "Base", address: "near:wrap.testnet" },
    )
  })
})
