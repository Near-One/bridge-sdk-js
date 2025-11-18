import { describe, expect, it, vi } from "vitest"
import type { WalletSelector } from "@near-wallet-selector/core"
import { internalActionToNaj, najActionToInternal } from "@near-wallet-selector/core"
import type { FinalExecutionOutcome } from "@near-js/types"
import { NearBridgeClient } from "../../src/clients/near-kit.js"

/**
 * Test suite to validate that NearBridgeClient properly serializes
 * function call arguments as Buffer/Uint8Array, as expected by the NEAR wallet selector.
 *
 * Background: The wallet selector core uses najActionToInternal() which does
 * JSON.parse(Buffer.from(args).toString()) on line 4462 of
 * node_modules/@near-wallet-selector/core/index.js.
 *
 * The flow is:
 * 1. SDK creates internal format actions (type: "FunctionCall", params: {args: ...})
 * 2. Wallet selector converts to NAJ format via internalActionToNaj() [line 4532]
 * 3. Some wallets convert back to internal via najActionToInternal() for processing
 * 4. najActionToInternal() expects args to be Buffer/Uint8Array (line 4462)
 *
 * These tests simulate this round-trip to validate args are properly serialized.
 */
describe("NearBridgeClient - Args Serialization", () => {
  /**
   * Directly test what line 4462 of wallet selector does: JSON.parse(Buffer.from(args).toString())
   * This is the exact code that fails if args is a plain object instead of Buffer/Uint8Array.
   */
  const validateArgsWithDirectParsing = (args: any, expectedParsedValue: object) => {
    // This is the EXACT code from wallet selector line 4462
    // It will throw if args is a plain object
    const parsed = JSON.parse(Buffer.from(args).toString())
    expect(parsed).toEqual(expectedParsedValue)
  }

  /**
   * Additionally validate args work with actual wallet selector round-trip conversion.
   */
  const validateArgsWithWalletSelector = (
    internalAction: any,
    expectedParsedValue: object,
  ) => {
    // First, verify direct parsing works (line 4462 simulation)
    validateArgsWithDirectParsing(internalAction.params.args, expectedParsedValue)

    // Then verify round-trip conversion
    const najAction = internalActionToNaj(internalAction)
    const roundTrippedAction = najActionToInternal(najAction)

    expect(roundTrippedAction.type).toBe("FunctionCall")
    expect(roundTrippedAction.params.args).toEqual(expectedParsedValue)
  }

  it("logMetadata should serialize args as Buffer", async () => {
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

    const client = new NearBridgeClient(mockSelector)

    await client.logMetadata("near:test.near")

    expect(mockWallet.signAndSendTransaction).toHaveBeenCalledTimes(1)
    const callArgs = mockWallet.signAndSendTransaction.mock.calls[0]?.[0]
    const functionCallAction = callArgs?.actions[0]

    expect(functionCallAction?.type).toBe("FunctionCall")
    expect(functionCallAction?.params.methodName).toBe("log_metadata")

    // Validate args serialization using ACTUAL wallet selector round-trip
    validateArgsWithWalletSelector(functionCallAction, {
      token_id: "test.near",
    })
  })

  it("signTransfer should serialize args as Buffer", async () => {
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

    const client = new NearBridgeClient(mockSelector)

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
    const functionCallAction = callArgs?.actions[0]

    expect(functionCallAction?.type).toBe("FunctionCall")
    expect(functionCallAction?.params.methodName).toBe("sign_transfer")

    // Validate args serialization using ACTUAL wallet selector round-trip
    const najAction = internalActionToNaj(functionCallAction)
    const roundTrippedAction = najActionToInternal(najAction)

    expect(roundTrippedAction.type).toBe("FunctionCall")
    expect(roundTrippedAction.params.args).toMatchObject({
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

  it("initTransfer should serialize args as Buffer in ft_transfer_call", async () => {
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
    const client = new NearBridgeClient(mockSelector)
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

    // Find the ft_transfer_call transaction
    const ftTransferTx = transactions?.find((tx: any) =>
      tx.actions.some((action: any) => action.params?.methodName === "ft_transfer_call"),
    )
    expect(ftTransferTx).toBeDefined()

    const ftTransferAction = ftTransferTx.actions.find(
      (action: any) => action.params?.methodName === "ft_transfer_call",
    )

    // Validate args serialization using ACTUAL wallet selector round-trip
    const najAction = internalActionToNaj(ftTransferAction)
    const roundTrippedAction = najActionToInternal(najAction)

    expect(roundTrippedAction.type).toBe("FunctionCall")
    expect(roundTrippedAction.params.args).toMatchObject({
      receiver_id: expect.any(String),
      amount: "1000000",
      memo: null,
      msg: expect.stringContaining("eth:0x123"),
    })
  })

  it("storage_deposit should serialize args as Buffer", async () => {
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

    const client = new NearBridgeClient(mockSelector)

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

    // Find storage_deposit transactions
    const storageDepositTxs = transactions?.filter((tx: any) =>
      tx.actions.some((action: any) => action.params?.methodName === "storage_deposit"),
    )

    expect(storageDepositTxs.length).toBeGreaterThan(0)

    // Check all storage_deposit calls have serialized args using ACTUAL wallet selector round-trip
    for (const tx of storageDepositTxs) {
      const storageDepositAction = tx.actions.find(
        (action: any) => action.params?.methodName === "storage_deposit",
      )
      if (storageDepositAction) {
        // This will throw if args aren't properly serialized
        const najAction = internalActionToNaj(storageDepositAction)
        const roundTrippedAction = najActionToInternal(najAction)

        expect(roundTrippedAction.type).toBe("FunctionCall")
        expect(typeof roundTrippedAction.params.args).toBe("object")
      }
    }
  })
})
