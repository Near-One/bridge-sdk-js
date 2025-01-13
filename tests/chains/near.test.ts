import type { Account } from "near-api-js"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NearBridgeClient } from "../../src/clients/near"
import { ChainKind, ProofKind } from "../../src/types"

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
  },
}))

describe("NearBridgeClient", () => {
  let mockWallet: Account
  let client: NearBridgeClient
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

    // Create client instance
    client = new NearBridgeClient(mockWallet, mockLockerAddress)
  })

  describe("constructor", () => {
    it("should throw error if locker address is not provided", () => {
      expect(() => new NearBridgeClient(mockWallet, "")).toThrow(
        "OMNI_BRIDGE_NEAR address not configured",
      )
    })

    it("should create instance with provided wallet and locker address", () => {
      const client = new NearBridgeClient(mockWallet, mockLockerAddress)
      expect(client).toBeInstanceOf(NearBridgeClient)
    })
  })

  describe("logMetadata", () => {
    it("should throw error if token address is not on NEAR", async () => {
      await expect(client.logMetadata("eth:0x123")).rejects.toThrow("Token address must be on NEAR")
    })

    it("should call log_metadata with correct arguments", async () => {
      const tokenAddress = "near:test-token.near"
      const txHash = await client.logMetadata(tokenAddress)

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

      const txHash = await client.deployToken(destinationChain, mockVaa)

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

      const txHash = await client.bindToken(destinationChain, mockVaa)

      expect(mockWallet.functionCall).toHaveBeenCalledWith({
        contractId: mockLockerAddress,
        methodName: "bind_token",
        args: Uint8Array.from([1, 2, 3]),
        gas: BigInt(3e14),
        attachedDeposit: BigInt(2e23),
      })
      expect(txHash).toBe(mockTxHash)
    })
  })
  describe("finalizeTransfer", () => {
    const mockToken = "test-token.near"
    const mockAccount = "recipient.near"
    const mockStorageDeposit = BigInt(1000000000000000000000000)
    const mockVaa = "mock-vaa"
    const mockEvmProof = {
      proof_kind: ProofKind.FinTransfer,
      proof: {
        log_index: BigInt(1),
        log_entry_data: new Uint8Array([1, 2, 3]),
        receipt_index: BigInt(0),
        receipt_data: new Uint8Array([4, 5, 6]),
        header_data: new Uint8Array([7, 8, 9]),
        proof: [new Uint8Array([10, 11, 12])],
      },
    }

    it("should throw error if neither VAA nor EVM proof is provided", async () => {
      await expect(
        client.finalizeTransfer(mockToken, mockAccount, mockStorageDeposit, ChainKind.Near),
      ).rejects.toThrow("Must provide either VAA or EVM proof")
    })

    it("should throw error if EVM proof is provided for non-EVM chain", async () => {
      await expect(
        client.finalizeTransfer(
          mockToken,
          mockAccount,
          mockStorageDeposit,
          ChainKind.Near,
          undefined,
          mockEvmProof,
        ),
      ).rejects.toThrow("EVM proof is only valid for Ethereum, Arbitrum, or Base")
    })

    it("should call finalize_transfer with VAA correctly", async () => {
      const txHash = await client.finalizeTransfer(
        mockToken,
        mockAccount,
        mockStorageDeposit,
        ChainKind.Sol,
        mockVaa,
      )

      expect(mockWallet.functionCall).toHaveBeenCalledWith({
        contractId: mockLockerAddress,
        methodName: "finalize_transfer",
        args: expect.any(Uint8Array),
        gas: BigInt(3e14),
        attachedDeposit: BigInt(1),
      })
      expect(txHash).toBe(mockTxHash)
    })

    it("should call finalize_transfer with EVM proof correctly", async () => {
      const txHash = await client.finalizeTransfer(
        mockToken,
        mockAccount,
        mockStorageDeposit,
        ChainKind.Eth,
        undefined,
        mockEvmProof,
      )

      expect(mockWallet.functionCall).toHaveBeenCalledWith({
        contractId: mockLockerAddress,
        methodName: "finalize_transfer",
        args: expect.any(Uint8Array),
        gas: BigInt(3e14),
        attachedDeposit: BigInt(1),
      })
      expect(txHash).toBe(mockTxHash)
    })

    it("should handle errors from functionCall", async () => {
      const error = new Error("NEAR finalize transfer error")
      mockWallet.functionCall = vi.fn().mockRejectedValue(error)

      await expect(
        client.finalizeTransfer(mockToken, mockAccount, mockStorageDeposit, ChainKind.Sol, mockVaa),
      ).rejects.toThrow("NEAR finalize transfer error")
    })
  })

  describe("error handling", () => {
    it("should propagate errors from functionCall", async () => {
      const error = new Error("NEAR error")
      mockWallet.functionCall = vi.fn().mockRejectedValue(error)

      await expect(client.logMetadata("near:test-token.near")).rejects.toThrow("NEAR error")
    })
  })
})
