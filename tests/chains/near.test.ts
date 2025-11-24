import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Near } from "near-kit"
import { NearBridgeClient } from "../../src/clients/near-kit.js"
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
  let mockNear: Near
  let mockTransactionBuilder: {
    functionCall: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
  }
  let client: NearBridgeClient
  const mockLockerAddress = "test.near"
  const mockTxHash = "mock-tx-hash"
  const mockTokenAddress = "test-token.near"
  const mockTokenOmniAddress: OmniAddress = `near:${mockTokenAddress}`
  const mockSignerId = "test-account.near"

  beforeEach(() => {
    // Create mock transaction builder
    mockTransactionBuilder = {
      functionCall: vi.fn().mockReturnThis(),
      send: vi.fn().mockResolvedValue({
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
    }

    // Create comprehensive mock Near instance
    mockNear = {
      transaction: vi.fn().mockReturnValue(mockTransactionBuilder),
      view: vi.fn().mockResolvedValue("1000000000000000000000000"),
      getTransactionStatus: vi.fn(),
    } as unknown as Near

    // Create client instance with defaultSignerId
    client = new NearBridgeClient(mockNear, mockLockerAddress, {
      defaultSignerId: mockSignerId,
    })
  })

  describe("constructor", () => {
    it("should create instance with provided near instance and locker address", () => {
      const client = new NearBridgeClient(mockNear, mockLockerAddress)
      expect(client).toBeInstanceOf(NearBridgeClient)
    })

    it("should use provided locker address when specified", () => {
      const customAddress = "custom.near"
      const client = new NearBridgeClient(mockNear, customAddress)
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
      mockTransactionBuilder.send = vi.fn().mockResolvedValue({
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

    it("should call transaction builder with correct arguments", async () => {
      const tokenAddress = "near:test-token.near"
      await client.logMetadata(tokenAddress)

      expect(mockNear.transaction).toHaveBeenCalledWith(mockSignerId)
      expect(mockTransactionBuilder.functionCall).toHaveBeenCalledWith(
        mockLockerAddress,
        "log_metadata",
        { token_id: "test-token.near" },
        {
          gas: "300 Tgas",
          attachedDeposit: "1 yocto",
        }
      )
      expect(mockTransactionBuilder.send).toHaveBeenCalledWith({ waitUntil: "FINAL" })
    })

    it("should return parsed LogMetadataEvent from transaction logs", async () => {
      const tokenAddress = "near:test-token.near"
      const result = await client.logMetadata(tokenAddress)

      expect(result).toEqual(mockLogMetadataEvent)
    })

    it("should throw error if LogMetadataEvent not found in logs", async () => {
      mockTransactionBuilder.send = vi.fn().mockResolvedValue({
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
      mockNear.view = vi.fn().mockResolvedValue(mockDeployDeposit)
    })

    it("should call deployToken with correct arguments and dynamic deposit", async () => {
      const destinationChain = ChainKind.Eth
      const txHash = await client.deployToken(destinationChain, mockVaa)

      expect(mockNear.view).toHaveBeenCalledWith(
        mockLockerAddress,
        "required_balance_for_deploy_token",
        {},
      )

      expect(mockNear.transaction).toHaveBeenCalledWith(mockSignerId)
      expect(mockTransactionBuilder.functionCall).toHaveBeenCalledWith(
        mockLockerAddress,
        "deploy_token",
        expect.any(Uint8Array),
        {
          gas: "120 Tgas",
          attachedDeposit: expect.stringContaining("yocto"),
        }
      )

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
      mockNear.view = vi.fn().mockResolvedValue("3000000000000000000000000")
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

      expect(mockNear.view).toHaveBeenCalledWith(
        mockLockerAddress,
        "required_balance_for_bind_token",
        {},
      )

      expect(mockNear.transaction).toHaveBeenCalledWith(mockSignerId)
      expect(mockTransactionBuilder.functionCall).toHaveBeenCalledWith(
        mockLockerAddress,
        "bind_token",
        expect.any(Uint8Array),
        expect.objectContaining({
          gas: "300 Tgas",
        })
      )

      expect(txHash).toBe(mockTxHash)
    })

    it("should call bindToken with EVM proof correctly", async () => {
      const sourceChain = ChainKind.Eth
      const txHash = await client.bindToken(sourceChain, undefined, mockEvmProof)

      expect(mockNear.view).toHaveBeenCalledWith(
        mockLockerAddress,
        "required_balance_for_bind_token",
        {},
      )

      expect(mockNear.transaction).toHaveBeenCalledWith(mockSignerId)
      expect(mockTransactionBuilder.functionCall).toHaveBeenCalledWith(
        mockLockerAddress,
        "bind_token",
        expect.any(Uint8Array),
        expect.objectContaining({
          gas: "300 Tgas",
        })
      )

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
      mockNear.view = vi
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
      mockTransactionBuilder.send = vi.fn().mockResolvedValue({
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

      expect(mockNear.transaction).toHaveBeenCalledWith(mockSignerId)
      expect(mockTransactionBuilder.functionCall).toHaveBeenCalledWith(
        mockTokenAddress,
        "ft_transfer_call",
        expect.any(Object),
        expect.objectContaining({
          gas: "300 Tgas",
          attachedDeposit: "1 yocto",
        })
      )

      expect(result).toEqual(mockInitTransferEvent)
    })

    it("should throw error if InitTransferEvent not found in logs", async () => {
      mockTransactionBuilder.send = vi.fn().mockResolvedValue({
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
          origin_nonce: "1",
        },
        token_address: mockTokenOmniAddress,
        amount: "1000000000000000000",
        recipient: "eth:0x1234567890123456789012345678901234567890",
        fee_recipient: "fee-recipient.near",
      },
    }

    const mockFeeRecipient = "fee-recipient.near"

    beforeEach(() => {
      mockTransactionBuilder.send = vi.fn().mockResolvedValue({
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

      expect(mockNear.transaction).toHaveBeenCalledWith(mockSignerId)
      expect(mockTransactionBuilder.functionCall).toHaveBeenCalledWith(
        mockLockerAddress,
        "sign_transfer",
        expect.any(Object),
        expect.objectContaining({
          gas: "300 Tgas",
          attachedDeposit: "1 yocto",
        })
      )
      expect(mockTransactionBuilder.send).toHaveBeenCalledWith({ waitUntil: "FINAL" })
      expect(result).toEqual(mockSignTransferEvent)
    })

    it("should throw error if SignTransferEvent not found in logs", async () => {
      mockTransactionBuilder.send = vi.fn().mockResolvedValue({
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
      mockNear.view = vi.fn().mockResolvedValue("4000000000000000000000000")
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
          undefined, // signerId
          undefined, // vaa
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
        undefined, // signerId
        mockVaa,
      )

      expect(mockNear.view).toHaveBeenCalledWith(
        mockLockerAddress,
        "required_balance_for_fin_transfer",
        {},
      )

      expect(mockNear.transaction).toHaveBeenCalledWith(mockSignerId)
      expect(mockTransactionBuilder.functionCall).toHaveBeenCalledWith(
        mockLockerAddress,
        "fin_transfer",
        expect.any(Object),
        expect.objectContaining({
          gas: "300 Tgas",
        })
      )
      expect(mockTransactionBuilder.send).toHaveBeenCalledWith({ waitUntil: "FINAL" })

      expect(txHash.transaction.hash).toBe(mockTxHash)
    })

    it("should call finalize_transfer with EVM proof correctly", async () => {
      const txHash = await client.finalizeTransfer(
        mockToken,
        mockAccount,
        mockStorageDeposit,
        ChainKind.Eth,
        undefined, // signerId
        undefined, // vaa
        mockEvmProof,
      )

      expect(mockNear.view).toHaveBeenCalledWith(
        mockLockerAddress,
        "required_balance_for_fin_transfer",
        {},
      )

      expect(mockNear.transaction).toHaveBeenCalledWith(mockSignerId)
      expect(mockTransactionBuilder.functionCall).toHaveBeenCalledWith(
        mockLockerAddress,
        "fin_transfer",
        expect.any(Object),
        expect.objectContaining({
          gas: "300 Tgas",
        })
      )
      expect(mockTransactionBuilder.send).toHaveBeenCalledWith({ waitUntil: "FINAL" })

      expect(txHash.transaction.hash).toBe(mockTxHash)
    })

    it("should use custom proof kind when provided", async () => {
      const customProofKind = ProofKind.FinTransfer
      const txHash = await client.finalizeTransfer(
        mockToken,
        mockAccount,
        mockStorageDeposit,
        ChainKind.Sol,
        undefined, // signerId
        mockVaa,
        undefined, // evmProof
        customProofKind,
      )

      expect(txHash.transaction.hash).toBe(mockTxHash)
    })

    it("should handle errors from signAndSendTransaction", async () => {
      const error = new Error("NEAR finalize transfer error")
      mockTransactionBuilder.send = vi.fn().mockRejectedValue(error)

      await expect(
        client.finalizeTransfer(mockToken, mockAccount, mockStorageDeposit, ChainKind.Sol, undefined, mockVaa),
      ).rejects.toThrow("NEAR finalize transfer error")
    })
  })

  describe("fastFinTransfer", () => {
    const mockFastFinTransferArgs: FastFinTransferArgs = {
      token_id: "wrap.near",
      amount: "1000000000000000000000000",
      amount_to_send: "900000000000000000000000",
      transfer_id: {
        origin_chain: ChainKind.Eth,
        origin_nonce: "123",
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
      mockNear.view = vi
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
      expect(mockNear.view).toHaveBeenCalledWith(
        mockLockerAddress,
        "storage_balance_of",
        {
          account_id: mockSignerId,
        },
      )

      // Should chain storage_deposit and ft_transfer_call in single transaction
      expect(mockNear.transaction).toHaveBeenCalledWith(mockSignerId)
      expect(mockTransactionBuilder.functionCall).toHaveBeenCalledTimes(2)
      expect(mockTransactionBuilder.functionCall).toHaveBeenNthCalledWith(
        1,
        mockLockerAddress,
        "storage_deposit",
        {},
        expect.objectContaining({
          gas: "10 Tgas",
        })
      )
      expect(mockTransactionBuilder.functionCall).toHaveBeenNthCalledWith(
        2,
        mockFastFinTransferArgs.token_id,
        "ft_transfer_call",
        expect.any(Object),
        expect.objectContaining({
          gas: "300 Tgas",
          attachedDeposit: "1 yocto",
        })
      )
      expect(mockTransactionBuilder.send).toHaveBeenCalledTimes(1)
      expect(txHash).toBe(mockTxHash)
    })

    it("should handle case without storage deposit amount", async () => {
      const argsWithoutStorageDeposit = {
        ...mockFastFinTransferArgs,
        storage_deposit_amount: undefined,
      }

      const txHash = await client.fastFinTransfer(argsWithoutStorageDeposit)

      // Should chain storage_deposit and ft_transfer_call in single transaction
      expect(mockTransactionBuilder.functionCall).toHaveBeenCalledTimes(2)
      expect(mockTransactionBuilder.functionCall).toHaveBeenNthCalledWith(
        1,
        mockLockerAddress,
        "storage_deposit",
        {},
        expect.objectContaining({
          gas: "10 Tgas",
        })
      )
      expect(mockTransactionBuilder.functionCall).toHaveBeenNthCalledWith(
        2,
        argsWithoutStorageDeposit.token_id,
        "ft_transfer_call",
        expect.any(Object),
        expect.objectContaining({
          gas: "300 Tgas",
          attachedDeposit: "1 yocto",
        })
      )
      expect(mockTransactionBuilder.send).toHaveBeenCalledTimes(1)
      expect(txHash).toBe(mockTxHash)
    })

    it("should deposit storage when storage balance is insufficient", async () => {
      // Mock insufficient storage balance
      mockNear.view = vi
        .fn()
        .mockImplementation((_contractId, methodName, _args) => {
          if (methodName === "storage_balance_of") {
            return Promise.resolve(null) // No storage balance
          }
          return Promise.resolve("2")
        })

      const txHash = await client.fastFinTransfer(mockFastFinTransferArgs)

      // Should chain storage_deposit and ft_transfer_call in single transaction
      expect(mockTransactionBuilder.functionCall).toHaveBeenCalledTimes(2)
      expect(mockTransactionBuilder.functionCall).toHaveBeenNthCalledWith(
        1,
        mockLockerAddress,
        "storage_deposit",
        {},
        expect.objectContaining({
          gas: "10 Tgas",
        })
      )
      expect(mockTransactionBuilder.functionCall).toHaveBeenNthCalledWith(
        2,
        mockFastFinTransferArgs.token_id,
        "ft_transfer_call",
        expect.any(Object),
        expect.objectContaining({
          gas: "300 Tgas",
          attachedDeposit: "1 yocto",
        })
      )
      expect(mockTransactionBuilder.send).toHaveBeenCalledTimes(1)
      expect(txHash).toBe(mockTxHash)
    })

    it("should handle errors from signAndSendTransaction", async () => {
      const error = new Error("NEAR fast finalize transfer error")
      mockTransactionBuilder.send = vi.fn().mockRejectedValue(error)

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

  describe("submitBitcoinTransfer", () => {
    const mockInitTransferEvent: InitTransferEvent = {
      transfer_message: {
        origin_nonce: 1,
        token: mockTokenOmniAddress,
        amount: "10000000",
        recipient: "btc:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        fee: {
          fee: "100000",
          native_fee: "50000",
        },
        sender: "near:test-account.near",
        msg: '{"MaxGasFee":500000}',
        destination_nonce: 1,
      },
    }

    const mockUtxos = [
      {
        txid: "mock-txid-1",
        vout: 0,
        value: 5000000,
        confirmations: 6,
      },
      {
        txid: "mock-txid-2",
        vout: 1,
        value: 8000000,
        confirmations: 10,
      },
    ]

    const mockBitcoinConfig = {
      withdraw_bridge_fee: {
        fee_min: "1000000",
        fee_rate: 0,
        protocol_fee_rate: 9000,
      },
      btc_fee_recipient: "btc:mock-fee-recipient",
      btc_light_client: "btc-light-client.near",
      max_deposit_amount: "100000000",
      min_deposit_amount: "10000",
    }

    beforeEach(() => {
      // Mock UTXO methods
      vi.spyOn(client, "getUtxoAvailableOutputs").mockResolvedValue(mockUtxos as any)
      vi.spyOn(client, "getUtxoBridgeConfig").mockResolvedValue(mockBitcoinConfig as any)
      vi.spyOn(client as any, "buildUtxoWithdrawalPlan").mockReturnValue({
        inputs: [
          {
            txid: "mock-txid-1",
            vout: 0,
            value: 5000000,
          },
        ],
        outputs: [
          {
            address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
            value: 8500000,
          },
        ],
        fee: 500000,
      } as any)

      mockTransactionBuilder.send = vi.fn().mockResolvedValue({
        transaction: { hash: mockTxHash },
      })
    })

    it("should successfully submit bitcoin transfer with message", async () => {
      const result = await client.submitBitcoinTransfer(mockInitTransferEvent)

      expect(client.getUtxoAvailableOutputs).toHaveBeenCalledWith(ChainKind.Btc)
      expect(client.getUtxoBridgeConfig).toHaveBeenCalledWith(ChainKind.Btc)
      expect(mockNear.transaction).toHaveBeenCalledWith(mockSignerId)
      expect(mockTransactionBuilder.functionCall).toHaveBeenCalledWith(
        expect.any(String),
        "submit_transfer_to_utxo_chain_connector",
        expect.any(Object),
        expect.any(Object)
      )
      expect(mockTransactionBuilder.send).toHaveBeenCalledWith({ waitUntil: "FINAL" })
      expect(result).toBe(mockTxHash)
    })

    it("should successfully submit bitcoin transfer without message", async () => {
      const eventWithoutMsg: InitTransferEvent = {
        transfer_message: {
          ...mockInitTransferEvent.transfer_message,
          msg: "",
        },
      }

      const result = await client.submitBitcoinTransfer(eventWithoutMsg)

      expect(result).toBe(mockTxHash)
    })

    it("should throw error for malformed recipient address", async () => {
      const invalidEvent: InitTransferEvent = {
        transfer_message: {
          ...mockInitTransferEvent.transfer_message,
          recipient: "invalid-address" as OmniAddress,
        },
      }

      await expect(client.submitBitcoinTransfer(invalidEvent)).rejects.toThrow(
        'Malformed recipient address: "invalid-address"',
      )
    })

    it("should throw error for recipient address without address part", async () => {
      const invalidEvent: InitTransferEvent = {
        transfer_message: {
          ...mockInitTransferEvent.transfer_message,
          recipient: "btc:" as OmniAddress,
        },
      }

      await expect(client.submitBitcoinTransfer(invalidEvent)).rejects.toThrow(
        'Malformed recipient address: "btc:"',
      )
    })

    it("should throw error for invalid JSON in message", async () => {
      const invalidEvent: InitTransferEvent = {
        transfer_message: {
          ...mockInitTransferEvent.transfer_message,
          msg: "invalid json {",
        },
      }

      await expect(client.submitBitcoinTransfer(invalidEvent)).rejects.toThrow(
        "Failed to parse transfer message:",
      )
    })

    it("should throw error when amount is less than or equal to withdrawal fee", async () => {
      const lowAmountEvent: InitTransferEvent = {
        transfer_message: {
          ...mockInitTransferEvent.transfer_message,
          amount: "1000000", // Equal to withdrawal fee
        },
      }

      await expect(client.submitBitcoinTransfer(lowAmountEvent)).rejects.toThrow(
        "Transfer amount (900000) must be greater than withdrawal fee (1000000)",
      )
    })

    it("should throw error when max gas fee exceeds transfer amount", async () => {
      const highFeeEvent: InitTransferEvent = {
        transfer_message: {
          ...mockInitTransferEvent.transfer_message,
          amount: "5000000",
          msg: '{"MaxGasFee":6000000}',
        },
      }

      await expect(client.submitBitcoinTransfer(highFeeEvent)).rejects.toThrow(
        "Max gas fee (6000000) plus withdrawal fee (1000000) cannot exceed transfer amount (4900000)",
      )
    })

    it("should parse MaxGasFee correctly from message format", async () => {
      const result = await client.submitBitcoinTransfer(mockInitTransferEvent)

      expect(mockTransactionBuilder.send).toHaveBeenCalled()
      expect(mockTransactionBuilder.functionCall).toHaveBeenCalledWith(
        expect.any(String),
        "submit_transfer_to_utxo_chain_connector",
        expect.any(Object),
        expect.any(Object)
      )
      expect(result).toBe(mockTxHash)
    })

    it("should handle missing MaxGasFee in message", async () => {
      const eventWithoutMaxFee: InitTransferEvent = {
        transfer_message: {
          ...mockInitTransferEvent.transfer_message,
          msg: "{}",
        },
      }

      const result = await client.submitBitcoinTransfer(eventWithoutMaxFee)

      expect(mockTransactionBuilder.send).toHaveBeenCalled()
      expect(mockTransactionBuilder.functionCall).toHaveBeenCalledWith(
        expect.any(String),
        "submit_transfer_to_utxo_chain_connector",
        expect.any(Object),
        expect.any(Object)
      )
      expect(result).toBe(mockTxHash)
    })
  })

  describe("initTransfer with UTXO options", () => {
    const mockTransferWithMaxFee: OmniTransferMessage = {
      tokenAddress: mockTokenOmniAddress,
      recipient: "btc:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
      amount: BigInt("10000000"),
      fee: BigInt("100000"),
      nativeFee: BigInt("50000"),
      options: {
        maxGasFee: BigInt("500000"),
      },
    }

    const mockTransferWithUtxoFees: OmniTransferMessage = {
      tokenAddress: mockTokenOmniAddress,
      recipient: "btc:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
      amount: BigInt("10000000"),
      fee: BigInt("100000"),
      nativeFee: BigInt("50000"),
      options: {
        maxGasFee: BigInt("30000"),
      },
    }

    const mockInitTransferEvent: InitTransferEvent = {
      transfer_message: {
        origin_nonce: 1,
        token: mockTokenOmniAddress,
        amount: "10000000",
        recipient: "btc:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        fee: {
          fee: "100000",
          native_fee: "50000",
        },
        sender: "near:test-account.near",
        msg: "",
        destination_nonce: 1,
      },
    }

    beforeEach(() => {
      // Mock storage balance calls
      mockNear.view = vi
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
      mockTransactionBuilder.send = vi.fn().mockResolvedValue({
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

    it("should auto-construct message from maxGasFee option", async () => {
      const result = await client.initTransfer(mockTransferWithMaxFee)

      expect(mockTransactionBuilder.functionCall).toHaveBeenCalledWith(
        expect.any(String),
        "ft_transfer_call",
        expect.any(Object),
        expect.any(Object)
      )
      expect(mockTransactionBuilder.send).toHaveBeenCalled()
      expect(result).toEqual(mockInitTransferEvent)
    })

    it("should include maxGasFee in initTransfer for UTXO chains", async () => {
      const result = await client.initTransfer(mockTransferWithUtxoFees)

      expect(mockTransactionBuilder.functionCall).toHaveBeenCalledWith(
        expect.any(String),
        "ft_transfer_call",
        expect.any(Object),
        expect.any(Object)
      )
      expect(mockTransactionBuilder.send).toHaveBeenCalled()

      // Verify the message contains MaxGasFee by checking functionCall args
      const functionCallArgs = (mockTransactionBuilder.functionCall as any).mock.calls[0]
      const argsObj = functionCallArgs[2] // Third parameter is the args object
      if (typeof argsObj.msg === "string") {
        const msgArg = JSON.parse(argsObj.msg)
        if (msgArg.msg) {
          const innerMsg = JSON.parse(msgArg.msg)
          expect(innerMsg).toEqual({ MaxGasFee: "30000" })
        }
      }
      expect(result).toEqual(mockInitTransferEvent)
    })

    it("should handle transfer with maxGasFee option", async () => {
      const transferWithMaxFee: OmniTransferMessage = {
        tokenAddress: mockTokenOmniAddress,
        recipient: "btc:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        amount: BigInt("10000000"),
        fee: BigInt("100000"),
        nativeFee: BigInt("50000"),
        options: {
          maxGasFee: BigInt("500000"),
        },
      }

      const result = await client.initTransfer(transferWithMaxFee)

      expect(mockTransactionBuilder.functionCall).toHaveBeenCalledWith(
        expect.any(String),
        "ft_transfer_call",
        expect.any(Object),
        expect.any(Object)
      )
      expect(mockTransactionBuilder.send).toHaveBeenCalled()
      expect(result).toEqual(mockInitTransferEvent)
    })
  })
})
