import { describe, expect, it } from "vitest"
import { calculateStorageAccountId } from "../src/storage.js"

describe("calculateStorageAccountId", () => {
  it("verify known storage account ID", () => {
    const transferMessage = {
      token: "near:token.publicailab.near" as const,
      amount: 1000000000n,
      recipient: "sol:3XfLNw6yhA78USrm6R3H4m4igjPepG5B88tJ216DT8Gv" as const,
      fee: {
        fee: 0n,
        native_fee: 4996147724985508560896n,
      },
      sender: "near:intents.near" as const,
      msg: "",
    }

    const accountId = calculateStorageAccountId(transferMessage)

    expect(accountId).toBe("bff694d8802e268908ea311a613331eaa278628b55ab4adbe850fd3aa2e3cc7c")
  })

  it("calculates consistent storage account ID for the same input", () => {
    const transferMessage = {
      token: "near:token.near" as const,
      amount: 1000000000000000000000000n,
      recipient: "eth:0x742d35Cc6734C0532925a3b8D84f8FBf4D7bE86f" as const,
      fee: {
        fee: 100000000000000000000000n,
        native_fee: 1000000000000000000000n,
      },
      sender: "near:sender.near" as const,
      msg: "test transfer",
    }

    const accountId1 = calculateStorageAccountId(transferMessage)
    const accountId2 = calculateStorageAccountId(transferMessage)

    expect(accountId1).toBe(accountId2)
    expect(accountId1).toMatch(/^[a-f0-9]{64}$/)
  })

  it("produces different account IDs for different inputs", () => {
    const baseMessage = {
      token: "near:token.near" as const,
      amount: 1000000000000000000000000n,
      recipient: "eth:0x742d35Cc6734C0532925a3b8D84f8FBf4D7bE86f" as const,
      fee: {
        fee: 100000000000000000000000n,
        native_fee: 1000000000000000000000n,
      },
      sender: "near:sender.near" as const,
      msg: "test transfer",
    }

    const message1 = { ...baseMessage }
    const message2 = { ...baseMessage, amount: 2000000000000000000000000n }
    const message3 = { ...baseMessage, msg: "different message" }

    const accountId1 = calculateStorageAccountId(message1)
    const accountId2 = calculateStorageAccountId(message2)
    const accountId3 = calculateStorageAccountId(message3)

    expect(accountId1).not.toBe(accountId2)
    expect(accountId1).not.toBe(accountId3)
    expect(accountId2).not.toBe(accountId3)
  })

  it("handles different chain prefixes", () => {
    const messages = [
      {
        token: "eth:0x742d35Cc6734C0532925a3b8D84f8FBf4D7bE86f" as const,
        amount: 1000000000000000000n,
        recipient: "near:recipient.near" as const,
        fee: { fee: 100000000000000000n, native_fee: 1000000000000000n },
        sender: "eth:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" as const,
        msg: "",
      },
      {
        token: "sol:11111111111111111111111111111112" as const,
        amount: 1000000000n,
        recipient: "near:recipient.near" as const,
        fee: { fee: 10000000n, native_fee: 1000000n },
        sender: "sol:So11111111111111111111111111111111111111112" as const,
        msg: "",
      },
      {
        token: "near:token.near" as const,
        amount: 1000000000000000000000000n,
        recipient: "eth:0x742d35Cc6734C0532925a3b8D84f8FBf4D7bE86f" as const,
        fee: { fee: 100000000000000000000000n, native_fee: 1000000000000000000000n },
        sender: "near:sender.near" as const,
        msg: "",
      },
      {
        token: "near:strk.omdep.near",
        amount: 1000000n,
        recipient:
          "strk:0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7" as const,
        fee: { fee: 0n, native_fee: 0n },
        sender: "near:intents.near" as const,
        msg: "",
      },
      {
        token: "near:abs.omdep.near",
        amount: 1000000n,
        recipient: "abs:0x742d35Cc6734C0532925a3b8D84f8FBf4D7bE86f" as const,
        fee: { fee: 0n, native_fee: 0n },
        sender: "near:intents.near" as const,
        msg: "",
      },
      {
        // Starknet felts often arrive with leading zero bytes stripped — must
        // be left-padded to 32 bytes for borsh serialization to succeed.
        token: "near:strk.omdep.near",
        amount: 1000000n,
        recipient: "strk:0x1234" as const,
        fee: { fee: 0n, native_fee: 0n },
        sender: "near:intents.near" as const,
        msg: "",
      },
    ]

    const accountIds = messages.map(calculateStorageAccountId)

    // All should be valid hex strings of 64 characters (32 bytes)
    for (const accountId of accountIds) {
      expect(accountId).toMatch(/^[a-f0-9]{64}$/)
    }

    // All should be different
    expect(new Set(accountIds).size).toBe(accountIds.length)
  })

  it("handles zero amounts", () => {
    const transferMessage = {
      token: "near:token.near" as const,
      amount: 0n,
      recipient: "eth:0x742d35Cc6734C0532925a3b8D84f8FBf4D7bE86f" as const,
      fee: {
        fee: 0n,
        native_fee: 0n,
      },
      sender: "near:sender.near" as const,
      msg: "",
    }

    const accountId = calculateStorageAccountId(transferMessage)
    expect(accountId).toMatch(/^[a-f0-9]{64}$/)
  })

  it("handles large amounts", () => {
    const transferMessage = {
      token: "near:token.near" as const,
      amount: 340282366920938463463374607431768211455n, // Max U128
      recipient: "eth:0x742d35Cc6734C0532925a3b8D84f8FBf4D7bE86f" as const,
      fee: {
        fee: 1000000000000000000000000n,
        native_fee: 100000000000000000000000n,
      },
      sender: "near:sender.near" as const,
      msg: "large amount test",
    }

    const accountId = calculateStorageAccountId(transferMessage)
    expect(accountId).toMatch(/^[a-f0-9]{64}$/)
  })

  it("handles empty and long messages", () => {
    const baseMessage = {
      token: "near:token.near" as const,
      amount: 1000000000000000000000000n,
      recipient: "eth:0x742d35Cc6734C0532925a3b8D84f8FBf4D7bE86f" as const,
      fee: {
        fee: 100000000000000000000000n,
        native_fee: 1000000000000000000000n,
      },
      sender: "near:sender.near" as const,
      msg: "",
    }

    const emptyMessage = { ...baseMessage, msg: "" }
    const longMessage = { ...baseMessage, msg: "x".repeat(1000) }

    const emptyAccountId = calculateStorageAccountId(emptyMessage)
    const longAccountId = calculateStorageAccountId(longMessage)

    expect(emptyAccountId).toMatch(/^[a-f0-9]{64}$/)
    expect(longAccountId).toMatch(/^[a-f0-9]{64}$/)
    expect(emptyAccountId).not.toBe(longAccountId)
  })

  it("handles special characters in messages", () => {
    const transferMessage = {
      token: "near:token.near" as const,
      amount: 1000000000000000000000000n,
      recipient: "eth:0x742d35Cc6734C0532925a3b8D84f8FBf4D7bE86f" as const,
      fee: {
        fee: 100000000000000000000000n,
        native_fee: 1000000000000000000000n,
      },
      sender: "near:sender.near" as const,
      msg: "🚀 Unicode test! 特殊文字 №123 @#$%^&*()",
    }

    const accountId = calculateStorageAccountId(transferMessage)
    expect(accountId).toMatch(/^[a-f0-9]{64}$/)
  })

  it("produces deterministic results across multiple calls", () => {
    const transferMessage = {
      token: "near:usdc.near" as const,
      amount: 123456789000000n,
      recipient: "sol:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" as const,
      fee: {
        fee: 123456000000n,
        native_fee: 987654000000000000000n,
      },
      sender: "near:alice.near" as const,
      msg: "Cross-chain transfer",
    }

    // Call the function multiple times to ensure deterministic behavior
    const results = Array.from({ length: 10 }, () => calculateStorageAccountId(transferMessage))

    // All results should be identical
    const firstResult = results[0]
    expect(results.every((result) => result === firstResult)).toBe(true)
    expect(firstResult).toMatch(/^[a-f0-9]{64}$/)
  })

  describe("externalId", () => {
    const transferMessage = {
      token: "near:token.near" as const,
      amount: 1000000000000000000000000n,
      recipient: "eth:0x742d35Cc6734C0532925a3b8D84f8FBf4D7bE86f" as const,
      fee: {
        fee: 100000000000000000000000n,
        native_fee: 1000000000000000000000n,
      },
      sender: "near:sender.near" as const,
      msg: "test transfer",
    }

    it("changes the account ID compared to omitting externalId", () => {
      const withoutExternalId = calculateStorageAccountId(transferMessage)
      const withExternalId = calculateStorageAccountId(transferMessage, "external-id")

      expect(withExternalId).not.toBe(withoutExternalId)
      expect(withExternalId).toMatch(/^[a-f0-9]{64}$/)
    })

    it("treats an empty string the same as omitting externalId", () => {
      const withoutExternalId = calculateStorageAccountId(transferMessage)
      const withEmptyExternalId = calculateStorageAccountId(transferMessage, "")

      expect(withEmptyExternalId).toBe(withoutExternalId)
    })

    it("is deterministic for the same externalId", () => {
      const accountId1 = calculateStorageAccountId(transferMessage, "external-id")
      const accountId2 = calculateStorageAccountId(transferMessage, "external-id")

      expect(accountId1).toBe(accountId2)
    })

    it("produces different account IDs for different externalId values", () => {
      const accountId1 = calculateStorageAccountId(transferMessage, "external-id-1")
      const accountId2 = calculateStorageAccountId(transferMessage, "external-id-2")

      expect(accountId1).not.toBe(accountId2)
    })

    it("handles unicode externalId values", () => {
      const accountId = calculateStorageAccountId(transferMessage, "🚀 external 特殊文字")

      expect(accountId).toMatch(/^[a-f0-9]{64}$/)
    })

    it("accepts an externalId at exactly the 64-byte limit", () => {
      const externalId = "a".repeat(64)
      const accountId = calculateStorageAccountId(transferMessage, externalId)

      expect(accountId).toMatch(/^[a-f0-9]{64}$/)
    })

    it("throws when externalId exceeds the 64-byte limit", () => {
      const externalId = "a".repeat(65)

      expect(() => calculateStorageAccountId(transferMessage, externalId)).toThrow(
        /externalId exceeds 64 bytes/,
      )
    })

    it("enforces the limit on UTF-8 byte length, not string length", () => {
      // Each "🚀" is 2 UTF-16 code units but 4 UTF-8 bytes, so 17 copies are
      // only 34 code units long yet 68 bytes — over the limit.
      const externalId = "🚀".repeat(17)

      expect(externalId.length).toBeLessThan(64)
      expect(() => calculateStorageAccountId(transferMessage, externalId)).toThrow(
        /externalId exceeds 64 bytes/,
      )
    })
  })
})
