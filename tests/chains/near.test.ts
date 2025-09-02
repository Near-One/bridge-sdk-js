import type { Account } from "@near-js/accounts"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NearBridgeClient } from "../../src/clients/near.js"
import {
  ChainKind,
  type EvmVerifyProofArgs,
  type FastFinTransferArgs,
  type InitTransferEvent,
  type LogMetadataEvent,
  MPCSignature,
  type OmniAddress,
  type OmniTransferMessage,
  PayloadType,
  ProofKind,
  type SignTransferEvent,
} from "../../src/types/index.js"

describe("NearBridgeClient", () => {
  let mockWallet: Account
  let client: NearBridgeClient
  const mockLockerAddress = "test.near"
  const mockTxHash = "mock-tx-hash"
  const mockTokenAddress = "test-token.near"
  const mockTokenOmniAddress: OmniAddress = `near:${mockTokenAddress}`

  beforeEach(() => {
    // Create comprehensive mock wallet
    mockWallet = {
      accountId: "test-account.near",
      connection: {
        networkId: "testnet",
      },
      signAndSendTransaction: vi.fn().mockResolvedValue({
        transaction: {
          hash: mockTxHash,
        },
        receipts_outcome: [
          {
            outcome: {
              logs: [],
            },
          },
        ],
      }),
      viewFunction: vi.fn().mockResolvedValue("1000000000000000000000000"),
      functionCall: vi.fn().mockResolvedValue({
        transaction: {
          hash: mockTxHash,
        },
      }),
      provider: {
        callFunction: vi.fn().mockResolvedValue("1000000000000000000000000"),
      },
    } as unknown as Account

    // Create client instance
    client = new NearBridgeClient(mockWallet, mockLockerAddress)
  })

  describe("constructor", () => {
    it("should create instance with provided wallet and locker address", () => {
      const client = new NearBridgeClient(mockWallet, mockLockerAddress)
      expect(client).toBeInstanceOf(NearBridgeClient)
    })

    it("should use provided locker address when specified", () => {
      const customAddress = "custom.near"
      const client = new NearBridgeClient(mockWallet, customAddress)
      expect(client).toBeInstanceOf(NearBridgeClient)
    })
  })

  describe("logMetadata", () => {
    const mockLogMetadataEvent: LogMetadataEvent = {
      metadata_payload: {
        name: "Test Token",
        symbol: "TEST",
        decimals: 18,
        prefix: "test",
        token: "test-token.near",
      },
      signature: new MPCSignature({ affine_point: "mock-r" }, { scalar: "mock-s" }, 0),
    }

    beforeEach(() => {
      // Mock successful response with LogMetadataEvent
      mockWallet.signAndSendTransaction = vi.fn().mockResolvedValue({
        transaction: {
          hash: mockTxHash,
        },
        receipts_outcome: [
          {
            outcome: {
              logs: [`{"LogMetadataEvent": ${JSON.stringify(mockLogMetadataEvent)}}`],
            },
          },
        ],
      })
    })

    it("should throw error if token address is not on NEAR", async () => {
      await expect(client.logMetadata("eth:0x123")).rejects.toThrow("Token address must be on NEAR")
    })

    it("should call signAndSendTransaction with correct arguments", async () => {
      const tokenAddress = "near:test-token.near"
      await client.logMetadata(tokenAddress)

      expect(mockWallet.signAndSendTransaction).toHaveBeenCalledWith({
        receiverId: mockLockerAddress,
        actions: [
          expect.objectContaining({
            enum: "functionCall",
            functionCall: expect.objectContaining({
              methodName: "log_metadata",
              gas: BigInt(3e14),
              deposit: BigInt(1),
            }),
          }),
        ],
        waitUntil: "FINAL",
      })
    })

    it("should return parsed LogMetadataEvent from transaction logs", async () => {
      const tokenAddress = "near:test-token.near"
      const result = await client.logMetadata(tokenAddress)

      expect(result).toEqual(mockLogMetadataEvent)
    })

    it("should throw error if LogMetadataEvent not found in logs", async () => {
      mockWallet.signAndSendTransaction = vi.fn().mockResolvedValue({
        transaction: { hash: mockTxHash },
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
    const mockVaa = "mock-vaa"
    const mockDeployDeposit = "2000000000000000000000000"

    beforeEach(() => {
      mockWallet.provider.callFunction = vi.fn().mockResolvedValue(mockDeployDeposit)
    })

    it("should call deployToken with correct arguments and dynamic deposit", async () => {
      const destinationChain = ChainKind.Eth
      const txHash = await client.deployToken(destinationChain, mockVaa)

      expect(mockWallet.provider.callFunction).toHaveBeenCalledWith(
        mockLockerAddress,
        "required_balance_for_deploy_token",
        {},
      )

      expect(mockWallet.signAndSendTransaction).toHaveBeenCalledWith({
        receiverId: mockLockerAddress,
        actions: [
          expect.objectContaining({
            enum: "functionCall",
            functionCall: expect.objectContaining({
              methodName: "deploy_token",
              gas: BigInt(1.2e14),
              deposit: BigInt(mockDeployDeposit),
            }),
          }),
        ],
      })

      expect(txHash).toBe(mockTxHash)
    })
  })

  describe("bindToken", () => {
    const mockVaa = "mock-vaa"
    const mockEvmProof: EvmVerifyProofArgs = {
      proof_kind: ProofKind.DeployToken,
      proof: {
        log_index: BigInt(1),
        log_entry_data: new Uint8Array([1, 2, 3]),
        receipt_index: BigInt(0),
        receipt_data: new Uint8Array([4, 5, 6]),
        header_data: new Uint8Array([7, 8, 9]),
        proof: [new Uint8Array([10, 11, 12])],
      },
    }

    beforeEach(() => {
      mockWallet.provider.callFunction = vi.fn().mockResolvedValue("3000000000000000000000000")
    })

    it("should throw error if neither VAA nor EVM proof is provided", async () => {
      await expect(client.bindToken(ChainKind.Eth)).rejects.toThrow(
        "Must provide either VAA or EVM proof",
      )
    })

    it("should throw error if EVM proof is provided for non-EVM chain", async () => {
      await expect(client.bindToken(ChainKind.Near, undefined, mockEvmProof)).rejects.toThrow(
        "EVM proof is only valid for Ethereum",
      )
    })

    it("should call bindToken with VAA correctly", async () => {
      const sourceChain = ChainKind.Sol
      const txHash = await client.bindToken(sourceChain, mockVaa)

      expect(mockWallet.provider.callFunction).toHaveBeenCalledWith(
        mockLockerAddress,
        "required_balance_for_bind_token",
        {},
      )

      expect(mockWallet.signAndSendTransaction).toHaveBeenCalledWith({
        receiverId: mockLockerAddress,
        actions: [
          expect.objectContaining({
            enum: "functionCall",
            functionCall: expect.objectContaining({
              methodName: "bind_token",
              gas: BigInt(3e14),
            }),
          }),
        ],
      })

      expect(txHash).toBe(mockTxHash)
    })

    it("should call bindToken with EVM proof correctly", async () => {
      const sourceChain = ChainKind.Eth
      const txHash = await client.bindToken(sourceChain, undefined, mockEvmProof)

      expect(mockWallet.provider.callFunction).toHaveBeenCalledWith(
        mockLockerAddress,
        "required_balance_for_bind_token",
        {},
      )

      expect(mockWallet.signAndSendTransaction).toHaveBeenCalledWith({
        receiverId: mockLockerAddress,
        actions: [
          expect.objectContaining({
            enum: "functionCall",
            functionCall: expect.objectContaining({
              methodName: "bind_token",
              gas: BigInt(3e14),
            }),
          }),
        ],
      })

      expect(txHash).toBe(mockTxHash)
    })
  })

  describe("initTransfer", () => {
    const mockTransfer: OmniTransferMessage = {
      tokenAddress: mockTokenOmniAddress,
      recipient: "eth:0x1234567890123456789012345678901234567890",
      amount: BigInt("1000000000000000000"),
      fee: BigInt("100000000000000000"),
      nativeFee: BigInt("50000000000000000"),
    }

    const mockInitTransferEvent: InitTransferEvent = {
      transfer_message: {
        origin_nonce: 1,
        token: mockTokenOmniAddress,
        amount: mockTransfer.amount.toString(),
        recipient: mockTransfer.recipient,
        fee: {
          fee: mockTransfer.fee.toString(),
          native_fee: mockTransfer.nativeFee.toString(),
        },
        sender: "near:test-account.near",
        msg: "",
        destination_nonce: 1,
      },
    }

    beforeEach(() => {
      // Mock storage balance calls
      mockWallet.provider.callFunction = vi
        .fn()
        .mockImplementation((_contractId: string, methodName: string, _args: unknown) => {
          if (methodName === "storage_balance_of") {
            return Promise.resolve({
              total: "1000000000000000000000000",
              available: "500000000000000000000000",
            })
          }
          if (methodName.includes("required_balance_for")) {
            return Promise.resolve("1000000000000000000000")
          }
          if (methodName === "storage_balance_bounds") {
            return Promise.resolve({
              min: "1000000000000000000000",
              max: "2000000000000000000000",
            })
          }
          return Promise.resolve("1000000000000000000000000")
        })

      // Mock successful initTransfer
      mockWallet.signAndSendTransaction = vi.fn().mockResolvedValue({
        transaction: { hash: mockTxHash },
        receipts_outcome: [
          {
            outcome: {
              logs: [`{"InitTransferEvent": ${JSON.stringify(mockInitTransferEvent)}}`],
            },
          },
        ],
      })
    })

    it("should throw error if token address is not on NEAR", async () => {
      const invalidTransfer: OmniTransferMessage = {
        ...mockTransfer,
        tokenAddress: "eth:0x123" as OmniAddress,
      }
      await expect(client.initTransfer(invalidTransfer)).rejects.toThrow(
        "Token address must be on NEAR",
      )
    })

    it("should call ft_transfer_call with correct arguments", async () => {
      const result = await client.initTransfer(mockTransfer)

      expect(mockWallet.signAndSendTransaction).toHaveBeenCalledWith({
        receiverId: mockTokenAddress,
        actions: [
          expect.objectContaining({
            enum: "functionCall",
            functionCall: expect.objectContaining({
              methodName: "ft_transfer_call",
              gas: BigInt(3e14),
              deposit: BigInt(1),
            }),
          }),
        ],
      })

      expect(result).toEqual(mockInitTransferEvent)
    })

    it("should throw error if InitTransferEvent not found in logs", async () => {
      mockWallet.signAndSendTransaction = vi.fn().mockResolvedValue({
        transaction: { hash: mockTxHash },
        receipts_outcome: [
          {
            outcome: {
              logs: ["Some other event"],
            },
          },
        ],
      })

      await expect(client.initTransfer(mockTransfer)).rejects.toThrow(
        "InitTransferEvent not found in transaction logs",
      )
    })
  })

  describe("signTransfer", () => {
    const mockInitTransferEvent: InitTransferEvent = {
      transfer_message: {
        origin_nonce: 1,
        token: mockTokenOmniAddress,
        amount: "1000000000000000000",
        recipient: "eth:0x1234567890123456789012345678901234567890",
        fee: {
          fee: "100000000000000000",
          native_fee: "50000000000000000",
        },
        sender: "near:test-account.near",
        msg: "",
        destination_nonce: 1,
      },
    }

    const mockSignTransferEvent: SignTransferEvent = {
      signature: new MPCSignature({ affine_point: "mock-r" }, { scalar: "mock-s" }, 0),
      message_payload: {
        prefix: PayloadType.TransferMessage,
        destination_nonce: "1",
        transfer_id: {
          origin_chain: ChainKind.Near,
          origin_nonce: BigInt(1),
        },
        token_address: mockTokenOmniAddress,
        amount: "1000000000000000000",
        recipient: "eth:0x1234567890123456789012345678901234567890",
        fee_recipient: "fee-recipient.near",
      },
    }

    const mockFeeRecipient = "fee-recipient.near"

    // biome-ignore lint/suspicious/noExplicitAny: TS will complain that `toJSON()` does not exist on BigInt
    // biome-ignore lint/complexity/useLiteralKeys: TS will complain that `toJSON()` does not exist on BigInt
    ;(BigInt.prototype as any)["toJSON"] = function () {
      return this.toString()
    }

    beforeEach(() => {
      mockWallet.signAndSendTransaction = vi.fn().mockResolvedValue({
        transaction: { hash: mockTxHash },
        receipts_outcome: [
          {
            outcome: {
              logs: [`{"SignTransferEvent": ${JSON.stringify(mockSignTransferEvent)}}`],
            },
          },
        ],
      })
    })

    it("should call sign_transfer with correct arguments", async () => {
      const result = await client.signTransfer(mockInitTransferEvent, mockFeeRecipient)

      expect(mockWallet.signAndSendTransaction).toHaveBeenCalledWith({
        receiverId: mockLockerAddress,
        actions: [
          expect.objectContaining({
            enum: "functionCall",
            functionCall: expect.objectContaining({
              methodName: "sign_transfer",
              gas: BigInt(3e14),
              deposit: BigInt(1),
            }),
          }),
        ],
        waitUntil: "FINAL",
      })
      expect(result).toEqual(mockSignTransferEvent)
    })

    it("should throw error if SignTransferEvent not found in logs", async () => {
      mockWallet.signAndSendTransaction = vi.fn().mockResolvedValue({
        transaction: { hash: mockTxHash },
        receipts_outcome: [
          {
            outcome: {
              logs: ["Some other event"],
            },
          },
        ],
      })

      await expect(client.signTransfer(mockInitTransferEvent, mockFeeRecipient)).rejects.toThrow(
        "SignTransferEvent not found in transaction logs",
      )
    })
  })

  describe("finalizeTransfer", () => {
    const mockToken = "test-token.near"
    const mockAccount = "recipient.near"
    const mockStorageDeposit = BigInt("1000000000000000000000000")
    const mockVaa = "mock-vaa"
    const mockEvmProof: EvmVerifyProofArgs = {
      proof_kind: ProofKind.InitTransfer,
      proof: {
        log_index: BigInt(1),
        log_entry_data: new Uint8Array([1, 2, 3]),
        receipt_index: BigInt(0),
        receipt_data: new Uint8Array([4, 5, 6]),
        header_data: new Uint8Array([7, 8, 9]),
        proof: [new Uint8Array([10, 11, 12])],
      },
    }

    beforeEach(() => {
      mockWallet.provider.callFunction = vi.fn().mockResolvedValue("4000000000000000000000000")
    })

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
      ).rejects.toThrow("EVM proof is only valid for Ethereum")
    })

    it("should call finalize_transfer with VAA correctly", async () => {
      const txHash = await client.finalizeTransfer(
        mockToken,
        mockAccount,
        mockStorageDeposit,
        ChainKind.Sol,
        mockVaa,
      )

      expect(mockWallet.provider.callFunction).toHaveBeenCalledWith(
        mockLockerAddress,
        "required_balance_for_fin_transfer",
        {},
      )

      expect(mockWallet.signAndSendTransaction).toHaveBeenCalledWith({
        receiverId: mockLockerAddress,
        actions: [
          expect.objectContaining({
            enum: "functionCall",
            functionCall: expect.objectContaining({
              methodName: "fin_transfer",
              gas: BigInt(3e14),
            }),
          }),
        ],
        waitUntil: "FINAL",
      })

      expect(txHash.transaction.hash).toBe(mockTxHash)
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

      expect(mockWallet.provider.callFunction).toHaveBeenCalledWith(
        mockLockerAddress,
        "required_balance_for_fin_transfer",
        {},
      )

      expect(mockWallet.signAndSendTransaction).toHaveBeenCalledWith({
        receiverId: mockLockerAddress,
        actions: [
          expect.objectContaining({
            enum: "functionCall",
            functionCall: expect.objectContaining({
              methodName: "fin_transfer",
              gas: BigInt(3e14),
            }),
          }),
        ],
        waitUntil: "FINAL",
      })

      expect(txHash.transaction.hash).toBe(mockTxHash)
    })

    it("should use custom proof kind when provided", async () => {
      const customProofKind = ProofKind.FinTransfer
      const txHash = await client.finalizeTransfer(
        mockToken,
        mockAccount,
        mockStorageDeposit,
        ChainKind.Sol,
        mockVaa,
        undefined,
        customProofKind,
      )

      expect(txHash.transaction.hash).toBe(mockTxHash)
    })

    it("should handle errors from signAndSendTransaction", async () => {
      const error = new Error("NEAR finalize transfer error")
      mockWallet.signAndSendTransaction = vi.fn().mockRejectedValue(error)

      await expect(
        client.finalizeTransfer(mockToken, mockAccount, mockStorageDeposit, ChainKind.Sol, mockVaa),
      ).rejects.toThrow("NEAR finalize transfer error")
    })
  })

  describe("fastFinTransfer", () => {
    const mockFastFinTransferArgs: FastFinTransferArgs = {
      token_id: "wrap.near",
      amount: "1000000000000000000000000",
      transfer_id: {
        origin_chain: ChainKind.Eth,
        origin_nonce: 123n,
      },
      recipient: "recipient.near",
      fee: {
        fee: "100000000000000000000000",
        native_fee: "1000000000000000000000",
      },
      msg: "",
      storage_deposit_amount: "125000000000000000000000",
      relayer: "relayer.near",
    }

    beforeEach(() => {
      // Mock getRequiredBalanceForFastTransfer
      vi.spyOn(client, "getRequiredBalanceForFastTransfer").mockResolvedValue(
        BigInt("1000000000000000000000000"),
      )

      // Mock provider.callFunction for storage_balance_of
      mockWallet.provider.callFunction = vi
        .fn()
        .mockImplementation((_contractId, methodName, _args) => {
          if (methodName === "storage_balance_of") {
            return Promise.resolve({
              total: "125000000000000000000000",
              available: "125000000000000000000000",
            })
          }
          return Promise.resolve("2")
        })
    })

    it("should successfully execute fast finalize transfer", async () => {
      const txHash = await client.fastFinTransfer(mockFastFinTransferArgs)

      expect(client.getRequiredBalanceForFastTransfer).toHaveBeenCalled()
      expect(mockWallet.provider.callFunction).toHaveBeenCalledWith(
        mockLockerAddress,
        "storage_balance_of",
        {
          account_id: mockWallet.accountId,
        },
      )

      // Should call storage_deposit first, then ft_transfer_call
      expect(mockWallet.signAndSendTransaction).toHaveBeenCalledTimes(2)
      expect(mockWallet.signAndSendTransaction).toHaveBeenNthCalledWith(1, {
        receiverId: mockLockerAddress,
        actions: [
          expect.objectContaining({
            enum: "functionCall",
            functionCall: expect.objectContaining({
              methodName: "storage_deposit",
              args: expect.any(Object),
              gas: BigInt(1e14),
              deposit: BigInt("1000000000000000000000000"), // totalRequiredBalance (1125000000000000000000000) - existingBalance (125000000000000000000000)
            }),
          }),
        ],
      })
      expect(mockWallet.signAndSendTransaction).toHaveBeenNthCalledWith(2, {
        receiverId: mockFastFinTransferArgs.token_id,
        actions: [
          expect.objectContaining({
            enum: "functionCall",
            functionCall: expect.objectContaining({
              methodName: "ft_transfer_call",
              args: expect.any(Object),
              gas: BigInt(3e14),
              deposit: BigInt(1),
            }),
          }),
        ],
      })
      expect(txHash).toBe(mockTxHash)
    })

    it("should handle case without storage deposit amount", async () => {
      const argsWithoutStorageDeposit = {
        ...mockFastFinTransferArgs,
        storage_deposit_amount: undefined,
      }

      const txHash = await client.fastFinTransfer(argsWithoutStorageDeposit)

      // Should call storage_deposit first (with required balance only), then ft_transfer_call
      expect(mockWallet.signAndSendTransaction).toHaveBeenCalledTimes(2)
      expect(mockWallet.signAndSendTransaction).toHaveBeenNthCalledWith(1, {
        receiverId: mockLockerAddress,
        actions: [
          expect.objectContaining({
            enum: "functionCall",
            functionCall: expect.objectContaining({
              methodName: "storage_deposit",
              args: expect.any(Object),
              gas: BigInt(1e14),
              deposit: BigInt("875000000000000000000000"), // required balance - existing balance
            }),
          }),
        ],
      })
      expect(mockWallet.signAndSendTransaction).toHaveBeenNthCalledWith(2, {
        receiverId: argsWithoutStorageDeposit.token_id,
        actions: [
          expect.objectContaining({
            enum: "functionCall",
            functionCall: expect.objectContaining({
              methodName: "ft_transfer_call",
              args: expect.any(Object),
              gas: BigInt(3e14),
              deposit: BigInt(1),
            }),
          }),
        ],
      })
      expect(txHash).toBe(mockTxHash)
    })

    it("should deposit storage when storage balance is insufficient", async () => {
      // Mock insufficient storage balance
      mockWallet.provider.callFunction = vi
        .fn()
        .mockImplementation((_contractId, methodName, _args) => {
          if (methodName === "storage_balance_of") {
            return Promise.resolve(null) // No storage balance
          }
          return Promise.resolve("2")
        })

      const txHash = await client.fastFinTransfer(mockFastFinTransferArgs)

      // Should call storage_deposit first, then ft_transfer_call
      expect(mockWallet.signAndSendTransaction).toHaveBeenCalledTimes(2)
      expect(mockWallet.signAndSendTransaction).toHaveBeenNthCalledWith(1, {
        receiverId: mockLockerAddress,
        actions: [
          expect.objectContaining({
            enum: "functionCall",
            functionCall: expect.objectContaining({
              methodName: "storage_deposit",
              args: expect.any(Object),
              gas: BigInt(1e14),
              deposit: BigInt("1125000000000000000000000"), // full required balance + storage deposit
            }),
          }),
        ],
      })
      expect(mockWallet.signAndSendTransaction).toHaveBeenNthCalledWith(2, {
        receiverId: mockFastFinTransferArgs.token_id,
        actions: [
          expect.objectContaining({
            enum: "functionCall",
            functionCall: expect.objectContaining({
              methodName: "ft_transfer_call",
              args: expect.any(Object),
              gas: BigInt(3e14),
              deposit: BigInt(1),
            }),
          }),
        ],
      })
      expect(txHash).toBe(mockTxHash)
    })

    it("should handle errors from signAndSendTransaction", async () => {
      const error = new Error("NEAR fast finalize transfer error")
      mockWallet.signAndSendTransaction = vi.fn().mockRejectedValue(error)

      await expect(client.fastFinTransfer(mockFastFinTransferArgs)).rejects.toThrow(
        "NEAR fast finalize transfer error",
      )
    })

    it("should handle errors from getRequiredBalanceForFastTransfer", async () => {
      const error = new Error("Failed to get required balance")
      vi.spyOn(client, "getRequiredBalanceForFastTransfer").mockRejectedValue(error)

      await expect(client.fastFinTransfer(mockFastFinTransferArgs)).rejects.toThrow(
        "Failed to get required balance",
      )
    })
  })
})
