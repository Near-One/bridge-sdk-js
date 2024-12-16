import type { Account } from "near-api-js"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NearDeployer } from "../../src/deployer/near"
import { ChainKind } from "../../src/types"

// Mock the entire borsher module
vi.mock("borsher", () => ({
  borshSerialize: vi.fn().mockReturnValue(new Uint8Array([1, 2, 3])),
  BorshSchema: {
    Enum: vi.fn().mockReturnValue({}),
    Unit: {},
    String: vi.fn().mockReturnValue({}),
    Struct: vi.fn().mockReturnValue({}),
    Option: vi.fn().mockReturnValue({}),
    Vec: vi.fn().mockReturnValue({}),
    // Add any other schema types you're using
  },
}))

describe("NearDeployer", () => {
  let mockWallet: Account
  let deployer: NearDeployer
  const mockLockerAddress = "test.near"
  const mockTxHash = "mock-tx-hash"

  beforeEach(() => {
    // Create mock wallet with functionCall method
    mockWallet = {
      functionCall: vi.fn().mockResolvedValue({
        transaction: {
          hash: mockTxHash,
        },
      }),
    } as unknown as Account

    // Create deployer instance
    deployer = new NearDeployer(mockWallet, mockLockerAddress)
  })

  describe("constructor", () => {
    it("should throw error if locker address is not provided", () => {
      expect(() => new NearDeployer(mockWallet, "")).toThrow(
        "OMNI_LOCKER_NEAR address not configured",
      )
    })

    it("should create instance with provided wallet and locker address", () => {
      const deployer = new NearDeployer(mockWallet, mockLockerAddress)
      expect(deployer).toBeInstanceOf(NearDeployer)
    })
  })

  describe("logMetadata", () => {
    it("should throw error if token address is not on NEAR", async () => {
      await expect(deployer.logMetadata("eth:0x123")).rejects.toThrow(
        "Token address must be on NEAR",
      )
    })

    it("should call log_metadata with correct arguments", async () => {
      const tokenAddress = "near:test-token.near"
      const txHash = await deployer.logMetadata(tokenAddress)

      expect(mockWallet.functionCall).toHaveBeenCalledWith({
        contractId: mockLockerAddress,
        methodName: "log_metadata",
        args: {
          token_id: "test-token.near",
        },
        gas: BigInt(3e14),
        attachedDeposit: BigInt(2e23),
      })
      expect(txHash).toBe(mockTxHash)
    })
  })

  describe("deployToken", () => {
    it("should call deploy_token with correct arguments", async () => {
      const destinationChain = ChainKind.Eth
      const mockVaa = "mock-vaa"

      const txHash = await deployer.deployToken(destinationChain, mockVaa)

      expect(mockWallet.functionCall).toHaveBeenCalledWith({
        contractId: mockLockerAddress,
        methodName: "deploy_token",
        args: expect.any(Uint8Array), // We can't easily check the exact serialized value
        gas: BigInt(1.2e14),
        attachedDeposit: BigInt(4e24),
      })
      expect(txHash).toBe(mockTxHash)
    })
  })

  describe("bindToken", () => {
    it("should call bind_token with correct arguments", async () => {
      const destinationChain = ChainKind.Eth
      const mockVaa = "mock-vaa"

      const txHash = await deployer.bindToken(destinationChain, mockVaa)

      expect(mockWallet.functionCall).toHaveBeenCalledWith({
        contractId: mockLockerAddress,
        methodName: "bind_token",
        args: {
          chain_kind: destinationChain,
          prover_args: expect.any(Uint8Array),
        },
        gas: BigInt(3e14),
        attachedDeposit: BigInt(2e23),
      })
      expect(txHash).toBe(mockTxHash)
    })
  })

  describe("error handling", () => {
    it("should propagate errors from functionCall", async () => {
      const error = new Error("NEAR error")
      mockWallet.functionCall = vi.fn().mockRejectedValue(error)

      await expect(deployer.logMetadata("near:test-token.near")).rejects.toThrow("NEAR error")
    })
  })
})
