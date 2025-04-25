import type { Account } from "near-api-js"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NearBridgeClient } from "../../src/clients/near"
import {
  BindTokenArgsSchema,
  ChainKind,
  ProofKind,
  WormholeVerifyProofArgsSchema,
} from "../../src/types"

describe("NearBridgeClient", () => {
  let mockWallet: Account
  let client: NearBridgeClient
  const mockLockerAddress = "test.near"
  const mockTxHash = "mock-tx-hash"
  const mockViewFunction = "2"

  beforeEach(() => {
    // Create mock wallet with functionCall method
    mockWallet = {
      functionCall: vi.fn().mockResolvedValue({
        transaction: {
          hash: mockTxHash,
        },
      }),
      viewFunction: vi.fn().mockResolvedValue(mockViewFunction),
      connection: {
        networkId: "testnet",
      },
      signTransaction: vi.fn().mockResolvedValue({ signature: mockTxHash }),
    } as unknown as Account

    // Create client instance
    client = new NearBridgeClient(mockWallet, mockLockerAddress)
  })

  describe("constructor", () => {
    it("should create instance with provided wallet and locker address", () => {
      const client = new NearBridgeClient(mockWallet, mockLockerAddress)
      expect(client).toBeInstanceOf(NearBridgeClient)
    })
  })

  describe("logMetadata", () => {
    // Mock setTimeout to execute immediately
    const originalSetTimeout = global.setTimeout

    const mockProvider = {
      sendTransactionAsync: vi.fn(),
      txStatus: vi.fn(),
    }

    const mockLogMetadataEvent = {
      name: "Test Token",
      symbol: "TEST",
      decimals: 18,
    }

    beforeEach(() => {
      // Mock setTimeout to run immediately
      vi.spyOn(global, "setTimeout").mockImplementation((fn) => {
        fn()
        // biome-ignore lint/suspicious/noExplicitAny: Test mock
        return {} as any
      })

      // Reset mocks
      // @ts-expect-error: Account.signTransaction is protected but necessary here
      mockWallet.signTransaction = vi
        .fn()
        .mockResolvedValue(["mock-tx-hash", { transaction: "mock-signed-tx" }])

      // Default successful response
      const successResponse = {
        final_execution_status: "EXECUTED",
        receipts_outcome: [
          {
            outcome: {
              logs: [`{"LogMetadataEvent": ${JSON.stringify(mockLogMetadataEvent)}}`],
            },
          },
        ],
      }

      mockProvider.sendTransactionAsync = vi.fn().mockResolvedValue(successResponse)
      mockProvider.txStatus = vi.fn().mockResolvedValue(successResponse)

      // Update wallet with mock provider
      // @ts-expect-error: Just override it anyway
      mockWallet.connection.provider = mockProvider
    })

    it("should throw error if token address is not on NEAR", async () => {
      await expect(client.logMetadata("eth:0x123")).rejects.toThrow("Token address must be on NEAR")
    })

    it("should call signTransaction with correct arguments", async () => {
      const tokenAddress = "near:test-token.near"
      await client.logMetadata(tokenAddress)

      // Testing the first argument is the correct contract
      // @ts-expect-error: Account.signTransaction is protected but necessary here
      expect(mockWallet.signTransaction).toHaveBeenCalledWith(
        mockLockerAddress,
        expect.arrayContaining([
          expect.objectContaining({
            functionCall: expect.objectContaining({
              methodName: "log_metadata",
              gas: BigInt(3e14),
              deposit: BigInt(1),
            }),
          }),
        ]),
      )
    })

    it("should poll for transaction status and return event data", async () => {
      const tokenAddress = "near:test-token.near"
      const result = await client.logMetadata(tokenAddress)

      expect(mockProvider.sendTransactionAsync).toHaveBeenCalledWith({
        transaction: "mock-signed-tx",
      })
      expect(result).toEqual(mockLogMetadataEvent)
    })

    it("should throw error if transaction times out", async () => {
      // Override the mock to simulate a pending transaction
      const pendingResponse = {
        final_execution_status: "PENDING",
        receipts_outcome: [],
      }

      mockProvider.sendTransactionAsync = vi.fn().mockResolvedValue(pendingResponse)
      // Make txStatus always return pending
      mockProvider.txStatus = vi.fn().mockResolvedValue(pendingResponse)

      // Let setTimeout actually wait a tiny bit to allow for status check
      vi.spyOn(global, "setTimeout").mockImplementation((fn) => {
        // biome-ignore lint/suspicious/noExplicitAny: Test mock
        return originalSetTimeout(fn, 1) as any
      })

      const tokenAddress = "near:test-token.near"
      await expect(client.logMetadata(tokenAddress)).rejects.toThrow(
        "Transaction polling timed out after 60 seconds",
      )
    })

    it("should throw error if LogMetadataEvent not found in logs", async () => {
      // Override the sendTransactionAsync mock for this test
      mockProvider.sendTransactionAsync = vi.fn().mockResolvedValue({
        final_execution_status: "EXECUTED",
        receipts_outcome: [
          {
            outcome: {
              logs: ["Some other event"],
            },
          },
        ],
      })

      const tokenAddress = "near:test-token.near"
      await expect(client.logMetadata(tokenAddress)).rejects.toThrow(
        "LogMetadataEvent not found in transaction logs",
      )
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
        attachedDeposit: BigInt(2),
      })
      expect(txHash).toBe(mockTxHash)
    })
  })

  describe("bindToken", () => {
    it("should call bind_token with correct arguments", async () => {
      const destinationChain = ChainKind.Eth
      const mockVaa = "mock-vaa"

      const txHash = await client.bindToken(destinationChain, mockVaa)

      const proverArgs = WormholeVerifyProofArgsSchema.serialize({
        proof_kind: ProofKind.DeployToken,
        vaa: mockVaa,
      })
      const bindTokenArgs = BindTokenArgsSchema.serialize({
        chain_kind: destinationChain,
        prover_args: proverArgs,
      })

      expect(mockWallet.functionCall).toHaveBeenCalledWith({
        contractId: mockLockerAddress,
        methodName: "bind_token",
        args: bindTokenArgs,
        gas: BigInt(3e14),
        attachedDeposit: BigInt(2),
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
        methodName: "fin_transfer",
        args: expect.any(Uint8Array),
        gas: BigInt(3e14),
        attachedDeposit: BigInt(2),
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
        methodName: "fin_transfer",
        args: expect.any(Uint8Array),
        gas: BigInt(3e14),
        attachedDeposit: BigInt(2),
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
})
