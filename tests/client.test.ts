import { ethers } from "ethers"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type * as decimalsModule from "../src/utils/decimals" // Import for selective mocking
import { getTokenDecimals } from "../src/utils/decimals"
import { getBridgedToken } from "../src/utils/tokens" // Import getBridgedToken

// Mock getTokenDecimals *before* importing client.ts, using importActual
vi.mock("../src/utils/decimals", async () => {
  const actual = await vi.importActual<typeof decimalsModule>("../src/utils/decimals")
  return {
    ...actual, // Keep all the *real* exports
    getTokenDecimals: vi.fn(), // *Only* mock getTokenDecimals
  }
})

// Mock getBridgedToken
vi.mock("../src/utils/tokens", () => ({
  getBridgedToken: vi.fn(),
}))

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

// Shared mock implementation for getTokenDecimals
const mockGetTokenDecimals = async (_contract: string, address: string) => {
  if (address.startsWith("near:")) {
    return { decimals: 24, origin_decimals: 24 }
  }
  if (address.startsWith("sol:")) {
    return { decimals: 9, origin_decimals: 9 }
  }
  if (address.startsWith("eth:")) {
    return { decimals: 18, origin_decimals: 18 }
  }
  throw new Error("Unexpected token address")
}

// Import after mocks are set up
import { omniTransfer } from "../src/client"

describe("omniTransfer", () => {
  // Setup mock wallet
  const mockProvider = new ethers.JsonRpcProvider()
  const wallet = new ethers.Wallet(
    "0x0123456789012345678901234567890123456789012345678901234567890123",
    mockProvider,
  )

  beforeEach(() => {
    vi.clearAllMocks()
    // Set default mock implementation
    vi.mocked(getTokenDecimals).mockImplementation(mockGetTokenDecimals)
  })

  it("rejects transfer of 1 yoctoNEAR to Solana", async () => {
    // Mock getBridgedToken
    vi.mocked(getBridgedToken).mockResolvedValue("sol:mocked_sol_address")

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
    // Mock getBridgedToken to return a Solana address
    vi.mocked(getBridgedToken).mockResolvedValue("sol:mocked_sol_address")

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
    // Mock getBridgedToken
    vi.mocked(getBridgedToken).mockResolvedValue("sol:mocked_sol_address")

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
    // Mock RPC error using mockRejectedValueOnce
    vi.mocked(getTokenDecimals).mockRejectedValueOnce(new Error("Failed to get token decimals"))

    // Mock getBridgedToken
    vi.mocked(getBridgedToken).mockResolvedValue("sol:mocked_sol_address")

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

  it("handles getBridgedToken errors gracefully", async () => {
    // Mock RPC error using mockRejectedValueOnce
    vi.mocked(getBridgedToken).mockRejectedValueOnce(new Error("Failed to get token address"))

    await expect(
      omniTransfer(wallet, {
        tokenAddress: "near:token.near",
        amount: 1000000000000000000000000n,
        fee: 0n,
        nativeFee: 0n,
        recipient: "sol:pubkey",
      }),
    ).rejects.toThrow("Failed to get token address")
  })
})
