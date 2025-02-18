import { ethers } from "ethers"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { TokenDecimals } from "../src/utils/decimals"

// Mock all the clients and dependencies
vi.mock("../src/clients/evm", () => ({
  EvmBridgeClient: vi.fn().mockImplementation(() => ({
    initTransfer: vi.fn().mockResolvedValue("tx-hash"),
  })),
}))

vi.mock("../src/clients/near", () => ({
  NearBridgeClient: vi.fn(),
}))

vi.mock("../src/clients/near-wallet-selector", () => ({
  NearWalletSelectorBridgeClient: vi.fn(),
}))

vi.mock("../src/clients/solana", () => ({
  SolanaBridgeClient: vi.fn(),
}))

// Important: Mock fetch before importing omniTransfer
global.fetch = vi.fn()

// Import after mocks are set up
import { omniTransfer } from "../src/client"

function mockNearResponse(decimals: TokenDecimals) {
  const response = {
    jsonrpc: "2.0",
    id: "dontcare",
    result: {
      result: Array.from(Buffer.from(JSON.stringify(decimals))),
    },
  }
  return Promise.resolve({
    json: () => Promise.resolve(response),
  })
}

describe("omniTransfer", () => {
  // Setup mock wallet
  const mockProvider = new ethers.JsonRpcProvider()
  const wallet = new ethers.Wallet(
    "0x0123456789012345678901234567890123456789012345678901234567890123",
    mockProvider,
  )

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects transfer of 1 yoctoNEAR to Solana", async () => {
    // Mock token decimal responses
    // @ts-expect-error mock implementation
    global.fetch.mockImplementation((_url, options) => {
      const body = JSON.parse(options.body)
      if (body.params.args_base64) {
        const args = JSON.parse(Buffer.from(body.params.args_base64, "base64").toString())
        if (args.address.startsWith("near:")) {
          return mockNearResponse({ decimals: 24, origin_decimals: 24 })
        }
        if (args.address.startsWith("sol:")) {
          return mockNearResponse({ decimals: 9, origin_decimals: 9 })
        }
      }
      throw new Error("Unexpected RPC call")
    })

    await expect(
      omniTransfer(wallet, {
        tokenAddress: "near:token.near",
        amount: 1n, // 1 yoctoNEAR
        fee: 0n,
        nativeFee: 0n,
        recipient: "sol:pubkey",
      }),
    ).rejects.toThrow("Transfer amount too small")
  })

  it("allows valid NEAR to Solana transfer", async () => {
    // Mock token decimal responses
    // @ts-expect-error mock implementation
    global.fetch.mockImplementation((_url, options) => {
      const body = JSON.parse(options.body)
      if (body.params.args_base64) {
        const args = JSON.parse(Buffer.from(body.params.args_base64, "base64").toString())
        if (args.address.startsWith("near:")) {
          return mockNearResponse({ decimals: 24, origin_decimals: 24 })
        }
        if (args.address.startsWith("sol:")) {
          return mockNearResponse({ decimals: 9, origin_decimals: 9 })
        }
      }
      throw new Error("Unexpected RPC call")
    })

    const result = await omniTransfer(wallet, {
      tokenAddress: "near:token.near",
      amount: 2000000000000000000000000n, // 2.0 NEAR
      fee: 1000000000000000000000000n, // 1.0 NEAR fee
      nativeFee: 0n,
      recipient: "sol:pubkey",
    })

    expect(result).toBe("tx-hash")
  })

  it("rejects transfer where fee equals amount", async () => {
    // Mock token decimal responses
    // @ts-expect-error mock implementation
    global.fetch.mockImplementation((_url, options) => {
      const body = JSON.parse(options.body)
      if (body.params.args_base64) {
        const args = JSON.parse(Buffer.from(body.params.args_base64, "base64").toString())
        if (args.address.startsWith("eth:")) {
          return mockNearResponse({ decimals: 18, origin_decimals: 18 })
        }
        if (args.address.startsWith("sol:")) {
          return mockNearResponse({ decimals: 9, origin_decimals: 9 })
        }
      }
      throw new Error("Unexpected RPC call")
    })

    await expect(
      omniTransfer(wallet, {
        tokenAddress: "eth:0x123",
        amount: 1000000000000000000n, // 1.0 ETH
        fee: 1000000000000000000n, // 1.0 ETH fee
        nativeFee: 0n,
        recipient: "sol:pubkey",
      }),
    ).rejects.toThrow("Transfer amount too small")
  })

  it("handles NEAR RPC errors gracefully", async () => {
    // Mock RPC error
    // @ts-expect-error mock implementation
    global.fetch.mockImplementationOnce(() =>
      Promise.resolve({
        json: () =>
          Promise.resolve({
            error: { message: "Contract not found" },
          }),
      }),
    )

    await expect(
      omniTransfer(wallet, {
        tokenAddress: "near:token.near",
        amount: 1000000000000000000000000n,
        fee: 0n,
        nativeFee: 0n,
        recipient: "sol:pubkey",
      }),
    ).rejects.toThrow("Failed to get token decimals")
  })
})
