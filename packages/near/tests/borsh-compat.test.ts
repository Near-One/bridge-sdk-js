/**
 * Tests that plain objects returned by toNearApiJsActions serialize identically
 * to near-api-js Action class instances via Borsh.
 *
 * This validates the core assumption that allows us to remove @near-js dependencies:
 * NAJ's Borsh serialization is schema-driven and works with plain objects.
 */

import { describe, expect, it } from "vitest"
import type { NearUnsignedTransaction } from "@omni-bridge/core"
import { toNearApiJsActions } from "../src/shims.js"

// Import near-api-js v7 for comparison
import { KeyPair, actions, SCHEMA, Transaction, type Action } from "near-api-js"
import { serialize } from "borsh"

const { functionCall: najFunctionCall, transfer: najTransfer } = actions

describe("Borsh serialization compatibility", () => {
  it("functionCall actions serialize identically to near-api-js", () => {
    const args = new TextEncoder().encode(
      JSON.stringify({
        receiver_id: "bob.near",
        amount: "1000000000000000000000000",
        msg: "",
      }),
    )

    const unsigned: NearUnsignedTransaction = {
      type: "near",
      signerId: "alice.near",
      receiverId: "token.near",
      actions: [
        {
          type: "FunctionCall",
          methodName: "ft_transfer_call",
          args,
          gas: 50_000_000_000_000n,
          deposit: 1n,
        },
      ],
    }

    // Get plain object from our SDK
    const plainActions = toNearApiJsActions(unsigned)

    // Create class-based action from near-api-js
    const classAction = najFunctionCall("ft_transfer_call", args, 50_000_000_000_000n, 1n)

    // Create transactions with both
    const keyPair = KeyPair.fromRandom("ed25519")
    const publicKey = keyPair.getPublicKey()
    const nonce = 12345n
    const blockHash = new Uint8Array(32).fill(1)

    const txWithClass = new Transaction({
      signerId: "alice.near",
      publicKey,
      nonce,
      receiverId: "token.near",
      blockHash,
      actions: [classAction],
    })

    const txWithPlain = new Transaction({
      signerId: "alice.near",
      publicKey,
      nonce,
      receiverId: "token.near",
      blockHash,
      actions: plainActions as Action[],
    })

    // Serialize both
    const serializedClass = serialize(SCHEMA.Transaction, txWithClass)
    const serializedPlain = serialize(SCHEMA.Transaction, txWithPlain)

    // They should be identical
    expect(Buffer.from(serializedPlain).toString("hex")).toBe(Buffer.from(serializedClass).toString("hex"))
  })

  it("multiple actions serialize identically", () => {
    const args1 = new TextEncoder().encode(JSON.stringify({}))
    const args2 = new TextEncoder().encode(
      JSON.stringify({
        receiver_id: "bob.near",
        amount: "1000",
        msg: "",
      }),
    )

    const unsigned: NearUnsignedTransaction = {
      type: "near",
      signerId: "alice.near",
      receiverId: "token.near",
      actions: [
        {
          type: "FunctionCall",
          methodName: "storage_deposit",
          args: args1,
          gas: 10_000_000_000_000n,
          deposit: 1_250_000_000_000_000_000_000n,
        },
        {
          type: "FunctionCall",
          methodName: "ft_transfer_call",
          args: args2,
          gas: 50_000_000_000_000n,
          deposit: 1n,
        },
      ],
    }

    const plainActions = toNearApiJsActions(unsigned)

    const classActions = [
      najFunctionCall("storage_deposit", args1, 10_000_000_000_000n, 1_250_000_000_000_000_000_000n),
      najFunctionCall("ft_transfer_call", args2, 50_000_000_000_000n, 1n),
    ]

    const keyPair = KeyPair.fromRandom("ed25519")
    const publicKey = keyPair.getPublicKey()
    const nonce = 99999n
    const blockHash = new Uint8Array(32).fill(0xab)

    const txWithClass = new Transaction({
      signerId: "alice.near",
      publicKey,
      nonce,
      receiverId: "token.near",
      blockHash,
      actions: classActions,
    })

    const txWithPlain = new Transaction({
      signerId: "alice.near",
      publicKey,
      nonce,
      receiverId: "token.near",
      blockHash,
      actions: plainActions as Action[],
    })

    const serializedClass = serialize(SCHEMA.Transaction, txWithClass)
    const serializedPlain = serialize(SCHEMA.Transaction, txWithPlain)

    expect(Buffer.from(serializedPlain).toString("hex")).toBe(Buffer.from(serializedClass).toString("hex"))
  })

  it("transactions can be signed after using plain objects", async () => {
    const args = new TextEncoder().encode(JSON.stringify({ amount: "100" }))

    const unsigned: NearUnsignedTransaction = {
      type: "near",
      signerId: "test.near",
      receiverId: "contract.near",
      actions: [
        {
          type: "FunctionCall",
          methodName: "deposit",
          args,
          gas: 30_000_000_000_000n,
          deposit: 0n,
        },
      ],
    }

    const plainActions = toNearApiJsActions(unsigned)

    const keyPair = KeyPair.fromRandom("ed25519")
    const publicKey = keyPair.getPublicKey()

    const tx = new Transaction({
      signerId: "test.near",
      publicKey,
      nonce: 1n,
      receiverId: "contract.near",
      blockHash: new Uint8Array(32),
      actions: plainActions as Action[],
    })

    // Import signer
    const { KeyPairSigner } = await import("near-api-js")
    const signer = new KeyPairSigner(keyPair)

    // This should not throw - proves NAJ accepts our plain objects
    const { signedTransaction, txHash } = await signer.signTransaction(tx)

    expect(signedTransaction).toBeDefined()
    expect(txHash).toBeInstanceOf(Uint8Array)
    expect(txHash.length).toBe(32)
  })
})
