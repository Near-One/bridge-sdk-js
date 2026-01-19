import { describe, expect, it, vi } from "vitest"
import type { NearUnsignedTransaction } from "@omni-bridge/core"
import { toNearApiJsActions, toNearKitTransaction } from "../src/shims.js"

// Helper to create a valid args Uint8Array from an object
function encodeArgs(obj: object): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj))
}

describe("toNearKitTransaction", () => {
  it("should convert unsigned transaction to near-kit transaction builder", () => {
    const unsigned: NearUnsignedTransaction = {
      type: "near",
      signerId: "alice.near",
      receiverId: "bridge.near",
      actions: [
        {
          type: "FunctionCall",
          methodName: "ft_transfer",
          args: encodeArgs({ receiver_id: "bob.near", amount: "1000" }),
          gas: 30_000_000_000_000n,
          deposit: 1n,
        },
      ],
    }

    // Mock near-kit Near instance
    const mockTxBuilder = {
      functionCall: vi.fn().mockReturnThis(),
    }
    const mockNear = {
      transaction: vi.fn().mockReturnValue(mockTxBuilder),
    }

    const result = toNearKitTransaction(mockNear as never, unsigned)

    expect(mockNear.transaction).toHaveBeenCalledWith("alice.near")
    expect(mockTxBuilder.functionCall).toHaveBeenCalledWith(
      "bridge.near",
      "ft_transfer",
      expect.any(Uint8Array),
      {
        gas: expect.objectContaining({}),
        attachedDeposit: expect.objectContaining({}),
      },
    )
    expect(result).toBe(mockTxBuilder)
  })

  it("should handle multiple function call actions", () => {
    const unsigned: NearUnsignedTransaction = {
      type: "near",
      signerId: "alice.near",
      receiverId: "bridge.near",
      actions: [
        {
          type: "FunctionCall",
          methodName: "storage_deposit",
          args: encodeArgs({}),
          gas: 10_000_000_000_000n,
          deposit: 1250000000000000000000n,
        },
        {
          type: "FunctionCall",
          methodName: "ft_transfer_call",
          args: encodeArgs({ receiver_id: "bob.near", amount: "1000", msg: "" }),
          gas: 50_000_000_000_000n,
          deposit: 1n,
        },
      ],
    }

    const mockTxBuilder = {
      functionCall: vi.fn().mockReturnThis(),
    }
    const mockNear = {
      transaction: vi.fn().mockReturnValue(mockTxBuilder),
    }

    toNearKitTransaction(mockNear as never, unsigned)

    expect(mockTxBuilder.functionCall).toHaveBeenCalledTimes(2)
  })
})

describe("toNearApiJsActions", () => {
  it("should convert function call actions to near-api-js format", () => {
    const unsigned: NearUnsignedTransaction = {
      type: "near",
      signerId: "alice.near",
      receiverId: "bridge.near",
      actions: [
        {
          type: "FunctionCall",
          methodName: "ft_transfer",
          args: encodeArgs({ receiver_id: "bob.near", amount: "1000" }),
          gas: 30_000_000_000_000n,
          deposit: 1n,
        },
      ],
    }

    const actions = toNearApiJsActions(unsigned)

    expect(actions).toHaveLength(1)
    expect(actions[0]).toBeDefined()
  })

  it("should handle multiple actions", () => {
    const unsigned: NearUnsignedTransaction = {
      type: "near",
      signerId: "alice.near",
      receiverId: "bridge.near",
      actions: [
        {
          type: "FunctionCall",
          methodName: "storage_deposit",
          args: encodeArgs({}),
          gas: 10_000_000_000_000n,
          deposit: 1250000000000000000000n,
        },
        {
          type: "FunctionCall",
          methodName: "ft_transfer_call",
          args: encodeArgs({ receiver_id: "bob.near", amount: "1000", msg: "" }),
          gas: 50_000_000_000_000n,
          deposit: 1n,
        },
      ],
    }

    const actions = toNearApiJsActions(unsigned)

    expect(actions).toHaveLength(2)
  })

  it("should throw for unsupported action types", () => {
    const unsigned: NearUnsignedTransaction = {
      type: "near",
      signerId: "alice.near",
      receiverId: "bridge.near",
      actions: [
        {
          type: "Transfer" as "FunctionCall",
          methodName: "",
          args: new Uint8Array(),
          gas: 0n,
          deposit: 1n,
        },
      ],
    }

    expect(() => toNearApiJsActions(unsigned)).toThrow("Unsupported action type: Transfer")
  })
})
