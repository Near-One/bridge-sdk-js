import { describe, expect, it, vi } from "vitest"
import type { WalletSelector } from "@near-wallet-selector/core"
import { najActionToInternal } from "@near-wallet-selector/core"
import type { Action } from "@near-js/transactions"
import type { FinalExecutionOutcome } from "@near-js/types"
import { NearWalletSelectorBridgeClient } from "../../src/clients/near-wallet-selector.js"

/**
 * Test suite to validate that NearWalletSelectorBridgeClient properly uses NAJAction format
 * (from @near-js/transactions) instead of InternalAction format.
 *
 * Background: The wallet selector expects NAJAction format (created by actionCreators.functionCall).
 * actionCreators.functionCall accepts either:
 * - Plain objects (automatically serialized to JSON)
 * - Uint8Array (passed as-is, for Borsh-serialized data)
 *
 * These tests validate that we're using the correct format and that args are properly handled.
 */
describe("NearWalletSelectorBridgeClient - Args Serialization", () => {
  /**
   * Validates that NAJAction format works correctly by converting to internal format
   * and checking the args are properly serialized.
   */
  const validateNajAction = (najAction: Action, expectedParsedValue: object) => {
    // Convert NAJAction to InternalAction to verify proper serialization
    const internalAction = najActionToInternal(najAction)

    expect(internalAction.type).toBe("FunctionCall")
    expect(internalAction.params.args).toEqual(expectedParsedValue)
  }

  it("logMetadata should use NAJAction format with proper args", async () => {
    const mockWallet = {
      signAndSendTransaction: vi.fn().mockResolvedValue({
        transaction: { hash: "test-hash" },
        receipts_outcome: [
          {
            outcome: {
              logs: ['{"LogMetadataEvent":{"token":"test.near"}}'],
            },
          },
        ],
      } as FinalExecutionOutcome),
      getAccounts: vi.fn().mockResolvedValue([{ accountId: "test.near" }]),
    }

    const mockSelector = {
      wallet: vi.fn().mockResolvedValue(mockWallet),
    } as unknown as WalletSelector

    const client = new NearWalletSelectorBridgeClient(mockSelector)

    await client.logMetadata("near:test.near")

    expect(mockWallet.signAndSendTransaction).toHaveBeenCalledTimes(1)
    const callArgs = mockWallet.signAndSendTransaction.mock.calls[0]?.[0]
    const najAction = callArgs?.actions[0]

    // Validate it's a proper NAJAction
    expect(najAction).toBeDefined()
    expect(najAction.functionCall).toBeDefined()

    // Validate args serialization by converting to InternalAction
    validateNajAction(najAction, {
      token_id: "test.near",
    })
  })

  it("signTransfer should use NAJAction format with proper args", async () => {
    const mockWallet = {
      signAndSendTransaction: vi.fn().mockResolvedValue({
        transaction: { hash: "test-hash" },
        receipts_outcome: [
          {
            outcome: {
              logs: [
                '{"SignTransferEvent":{"signature":{"big_r":"r","s":"s","recovery_id":0},"transfer_id":{"origin_chain":"Eth","origin_nonce":"1"}}}',
              ],
            },
          },
        ],
      } as FinalExecutionOutcome),
      getAccounts: vi.fn().mockResolvedValue([{ accountId: "test.near" }]),
    }

    const mockSelector = {
      wallet: vi.fn().mockResolvedValue(mockWallet),
    } as unknown as WalletSelector

    const client = new NearWalletSelectorBridgeClient(mockSelector)

    const mockInitTransferEvent = {
      transfer_message: {
        sender: "eth:0x123",
        origin_nonce: "1",
        fee: {
          fee: "100",
          native_fee: "50",
        },
      },
    } as any

    await client.signTransfer(mockInitTransferEvent, "fee.near")

    expect(mockWallet.signAndSendTransaction).toHaveBeenCalledTimes(1)
    const callArgs = mockWallet.signAndSendTransaction.mock.calls[0]?.[0]
    const najAction = callArgs?.actions[0]

    // Validate it's a proper NAJAction
    expect(najAction).toBeDefined()
    expect(najAction.functionCall).toBeDefined()

    // Validate args serialization by converting to InternalAction
    const internalAction = najActionToInternal(najAction)
    expect(internalAction.type).toBe("FunctionCall")
    expect(internalAction.params.args).toMatchObject({
      transfer_id: {
        origin_chain: "Eth",
      },
      fee_recipient: "fee.near",
      fee: {
        fee: "100",
        native_fee: "50",
      },
    })
  })

  it("initTransfer should use NAJAction format in ft_transfer_call", async () => {
    const mockWallet = {
      signAndSendTransactions: vi.fn().mockResolvedValue([
        {
          transaction: { hash: "test-hash" },
          receipts_outcome: [
            {
              outcome: {
                logs: ['{"InitTransferEvent":{"nonce":"1"}}'],
              },
            },
          ],
        } as FinalExecutionOutcome,
      ]),
      getAccounts: vi.fn().mockResolvedValue([{ accountId: "test.near" }]),
    }

    const mockSelector = {
      wallet: vi.fn().mockResolvedValue(mockWallet),
    } as unknown as WalletSelector

    // Mock viewFunction to return balance data
    const client = new NearWalletSelectorBridgeClient(mockSelector)
    vi.spyOn(client as any, "viewFunction").mockImplementation(async (args: any) => {
      if (args.methodName === "storage_balance_of") {
        return { total: "1000000", available: "1000000" }
      }
      if (args.methodName.includes("required_balance")) {
        return "100000"
      }
      return null
    })

    await client.initTransfer({
      tokenAddress: "near:test.near",
      recipient: "eth:0x123",
      amount: 1000000n,
      fee: 100n,
      nativeFee: 50n,
    })

    expect(mockWallet.signAndSendTransactions).toHaveBeenCalledTimes(1)
    const callArgs = mockWallet.signAndSendTransactions.mock.calls[0]?.[0]
    const transactions = callArgs?.transactions

    // Find the ft_transfer_call transaction (NAJAction has functionCall property)
    const ftTransferTx = transactions?.find((tx: any) =>
      tx.actions.some((action: any) => action.functionCall?.methodName === "ft_transfer_call"),
    )
    expect(ftTransferTx).toBeDefined()

    const ftTransferAction = ftTransferTx.actions.find(
      (action: any) => action.functionCall?.methodName === "ft_transfer_call",
    )

    // Validate it's a proper NAJAction
    expect(ftTransferAction).toBeDefined()
    expect(ftTransferAction.functionCall).toBeDefined()

    // Validate args serialization by converting to InternalAction
    const internalAction = najActionToInternal(ftTransferAction)
    expect(internalAction.type).toBe("FunctionCall")
    expect(internalAction.params.args).toMatchObject({
      receiver_id: expect.any(String),
      amount: "1000000",
      memo: null,
      msg: expect.stringContaining("eth:0x123"),
    })
  })

  it("storage_deposit should use NAJAction format", async () => {
    const mockWallet = {
      signAndSendTransactions: vi.fn().mockResolvedValue([
        {
          transaction: { hash: "test-hash" },
          receipts_outcome: [
            {
              outcome: {
                logs: ['{"InitTransferEvent":{"nonce":"1"}}'],
              },
            },
          ],
        } as FinalExecutionOutcome,
      ]),
      getAccounts: vi.fn().mockResolvedValue([{ accountId: "test.near" }]),
    }

    const mockSelector = {
      wallet: vi.fn().mockResolvedValue(mockWallet),
    } as unknown as WalletSelector

    const client = new NearWalletSelectorBridgeClient(mockSelector)

    // Mock viewFunction to simulate needing storage deposit
    vi.spyOn(client as any, "viewFunction").mockImplementation(async (args: any) => {
      if (args.methodName === "storage_balance_of") {
        return null // No storage balance, will trigger deposit
      }
      if (args.methodName === "storage_balance_bounds") {
        return { min: "1000000", max: "2000000" }
      }
      if (args.methodName.includes("required_balance")) {
        return "100000"
      }
      return null
    })

    await client.initTransfer({
      tokenAddress: "near:test.near",
      recipient: "eth:0x123",
      amount: 1000000n,
      fee: 100n,
      nativeFee: 50n,
    })

    expect(mockWallet.signAndSendTransactions).toHaveBeenCalledTimes(1)
    const callArgs = mockWallet.signAndSendTransactions.mock.calls[0]?.[0]
    const transactions = callArgs?.transactions

    // Find storage_deposit transactions (NAJAction has functionCall property)
    const storageDepositTxs = transactions?.filter((tx: any) =>
      tx.actions.some((action: any) => action.functionCall?.methodName === "storage_deposit"),
    )

    expect(storageDepositTxs.length).toBeGreaterThan(0)

    // Check all storage_deposit calls use NAJAction format with proper args
    for (const tx of storageDepositTxs) {
      const storageDepositAction = tx.actions.find(
        (action: any) => action.functionCall?.methodName === "storage_deposit",
      )
      if (storageDepositAction) {
        // Validate it's a proper NAJAction
        expect(storageDepositAction.functionCall).toBeDefined()

        // Validate args serialization by converting to InternalAction
        const internalAction = najActionToInternal(storageDepositAction)
        expect(internalAction.type).toBe("FunctionCall")
        expect(typeof internalAction.params.args).toBe("object")
      }
    }
  })
})
