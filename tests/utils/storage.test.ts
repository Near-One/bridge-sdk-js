import { describe, expect, it } from "vitest"
import { calculateStorageAccountId, calculateStorageAccountIdFromOmniTransfer, type TransferMessage, TransferMessageStorageAccountSchema } from "../../src/utils/storage.js"
import type { OmniAddress } from "../../src/types/common.js"
import type { OmniTransferMessage } from "../../src/types/omni.js"

describe("Storage Account ID Calculation", () => {
  describe("calculateStorageAccountId", () => {
    it("should calculate storage account ID for basic transfer message", () => {
      const transferMessage: TransferMessage = {
        token: "near:token.near",
        amount: 1000000n,
        recipient: "near:recipient.near",
        fee: 100n,
        sender: "near:sender.near",
        msg: "test message",
      }

      const accountId = calculateStorageAccountId(transferMessage)
      
      // Should return a valid hex string (64 characters for SHA256)
      expect(accountId).toMatch(/^[a-f0-9]{64}$/)
      expect(accountId).toHaveLength(64)
    })

    it("should produce consistent results for identical inputs", () => {
      const transferMessage: TransferMessage = {
        token: "near:token.near",
        amount: 1000000n,
        recipient: "near:recipient.near",
        fee: 100n,
        sender: "near:sender.near",
        msg: "test message",
      }

      const accountId1 = calculateStorageAccountId(transferMessage)
      const accountId2 = calculateStorageAccountId(transferMessage)
      
      expect(accountId1).toBe(accountId2)
    })

    it("should produce different results for different inputs", () => {
      const transferMessage1: TransferMessage = {
        token: "near:token.near",
        amount: 1000000n,
        recipient: "near:recipient.near",
        fee: 100n,
        sender: "near:sender.near",
        msg: "test message",
      }

      const transferMessage2: TransferMessage = {
        ...transferMessage1,
        amount: 2000000n, // Different amount
      }

      const accountId1 = calculateStorageAccountId(transferMessage1)
      const accountId2 = calculateStorageAccountId(transferMessage2)
      
      expect(accountId1).not.toBe(accountId2)
    })

    it("should handle different chain prefixes", () => {
      const transferMessage: TransferMessage = {
        token: "eth:0x1234567890abcdef1234567890abcdef12345678",
        amount: 1000000n,
        recipient: "sol:SomeBase58AddressHere123456789",
        fee: 100n,
        sender: "arb:0xabcdef1234567890abcdef1234567890abcdef12",
        msg: "cross-chain transfer",
      }

      const accountId = calculateStorageAccountId(transferMessage)
      
      expect(accountId).toMatch(/^[a-f0-9]{64}$/)
      expect(accountId).toHaveLength(64)
    })

    it("should handle empty message", () => {
      const transferMessage: TransferMessage = {
        token: "near:token.near",
        amount: 1000000n,
        recipient: "near:recipient.near",
        fee: 100n,
        sender: "near:sender.near",
        msg: "",
      }

      const accountId = calculateStorageAccountId(transferMessage)
      
      expect(accountId).toMatch(/^[a-f0-9]{64}$/)
      expect(accountId).toHaveLength(64)
    })

    it("should handle large amounts", () => {
      const transferMessage: TransferMessage = {
        token: "near:token.near",
        amount: 9007199254740991n, // Number.MAX_SAFE_INTEGER
        recipient: "near:recipient.near",
        fee: 1000000n,
        sender: "near:sender.near",
        msg: "large amount transfer",
      }

      const accountId = calculateStorageAccountId(transferMessage)
      
      expect(accountId).toMatch(/^[a-f0-9]{64}$/)
      expect(accountId).toHaveLength(64)
    })

    it("should handle zero amounts and fees", () => {
      const transferMessage: TransferMessage = {
        token: "near:token.near",
        amount: 0n,
        recipient: "near:recipient.near",
        fee: 0n,
        sender: "near:sender.near",
        msg: "zero transfer",
      }

      const accountId = calculateStorageAccountId(transferMessage)
      
      expect(accountId).toMatch(/^[a-f0-9]{64}$/)
      expect(accountId).toHaveLength(64)
    })

    it("should be sensitive to field order", () => {
      // The borsh serialization should maintain field order
      const transferMessage: TransferMessage = {
        token: "near:token.near",
        amount: 1000000n,
        recipient: "near:recipient.near",
        fee: 100n,
        sender: "near:sender.near",
        msg: "test message",
      }

      const accountId = calculateStorageAccountId(transferMessage)
      
      // Even if we create the object with different field order in JS,
      // the schema should serialize them in the correct order
      const transferMessage2: TransferMessage = {
        msg: "test message",
        sender: "near:sender.near",
        fee: 100n,
        recipient: "near:recipient.near",
        amount: 1000000n,
        token: "near:token.near",
      }

      const accountId2 = calculateStorageAccountId(transferMessage2)
      
      expect(accountId).toBe(accountId2)
    })

    it("should handle unicode characters in message", () => {
      const transferMessage: TransferMessage = {
        token: "near:token.near",
        amount: 1000000n,
        recipient: "near:recipient.near",
        fee: 100n,
        sender: "near:sender.near",
        msg: "unicode test: 你好 🌍 αβγ",
      }

      const accountId = calculateStorageAccountId(transferMessage)
      
      expect(accountId).toMatch(/^[a-f0-9]{64}$/)
      expect(accountId).toHaveLength(64)
    })

    it("should handle very long addresses and messages", () => {
      const longAddress = ("near:" + "a".repeat(100) + ".near") as OmniAddress
      const longMessage = "x".repeat(1000)
      
      const transferMessage: TransferMessage = {
        token: longAddress,
        amount: 1000000n,
        recipient: longAddress,
        fee: 100n,
        sender: longAddress,
        msg: longMessage,
      }

      const accountId = calculateStorageAccountId(transferMessage)
      
      expect(accountId).toMatch(/^[a-f0-9]{64}$/)
      expect(accountId).toHaveLength(64)
    })
  })

  describe("TransferMessageStorageAccountSchema", () => {
    it("should serialize and deserialize correctly", () => {
      const transferMessage: TransferMessage = {
        token: "near:token.near",
        amount: 1000000n,
        recipient: "near:recipient.near",
        fee: 100n,
        sender: "near:sender.near",
        msg: "test message",
      }

      const serialized = TransferMessageStorageAccountSchema.serialize(transferMessage)
      const deserialized = TransferMessageStorageAccountSchema.deserialize(serialized)
      
      expect(deserialized).toEqual(transferMessage)
    })

    it("should maintain bigint precision during serialization", () => {
      const transferMessage: TransferMessage = {
        token: "near:token.near",
        amount: 9007199254740991n, // Number.MAX_SAFE_INTEGER
        recipient: "near:recipient.near",
        fee: 1000000000000n,
        sender: "near:sender.near",
        msg: "precision test",
      }

      const serialized = TransferMessageStorageAccountSchema.serialize(transferMessage)
      const deserialized = TransferMessageStorageAccountSchema.deserialize(serialized)
      
      expect(deserialized.amount).toBe(9007199254740991n)
      expect(deserialized.fee).toBe(1000000000000n)
    })
  })

  describe("calculateStorageAccountIdFromOmniTransfer", () => {
    it("should work with OmniTransferMessage format", () => {
      const omniTransfer: OmniTransferMessage = {
        tokenAddress: "near:wrap.near",
        amount: 1000000n,
        fee: 100n,
        nativeFee: 0n,
        recipient: "near:recipient.near",
        message: "test message",
      }
      const sender: OmniAddress = "near:sender.near"

      const accountId = calculateStorageAccountIdFromOmniTransfer(omniTransfer, sender)
      
      expect(accountId).toMatch(/^[a-f0-9]{64}$/)
      expect(accountId).toHaveLength(64)
    })

    it("should produce same result as direct calculation", () => {
      const omniTransfer: OmniTransferMessage = {
        tokenAddress: "near:wrap.near",
        amount: 1000000n,
        fee: 100n,
        nativeFee: 50n, // This field is not used in storage calculation
        recipient: "near:recipient.near",
        message: "test message",
      }
      const sender: OmniAddress = "near:sender.near"

      const directTransfer: TransferMessage = {
        token: omniTransfer.tokenAddress,
        amount: omniTransfer.amount,
        recipient: omniTransfer.recipient,
        fee: omniTransfer.fee,
        sender: sender,
        msg: omniTransfer.message || "",
      }

      const accountId1 = calculateStorageAccountIdFromOmniTransfer(omniTransfer, sender)
      const accountId2 = calculateStorageAccountId(directTransfer)
      
      expect(accountId1).toBe(accountId2)
    })

    it("should handle undefined message", () => {
      const omniTransfer: OmniTransferMessage = {
        tokenAddress: "near:wrap.near",
        amount: 1000000n,
        fee: 100n,
        nativeFee: 0n,
        recipient: "near:recipient.near",
        // message is undefined
      }
      const sender: OmniAddress = "near:sender.near"

      const accountId = calculateStorageAccountIdFromOmniTransfer(omniTransfer, sender)
      
      expect(accountId).toMatch(/^[a-f0-9]{64}$/)
      expect(accountId).toHaveLength(64)

      // Should be same as using empty string message
      const directTransfer: TransferMessage = {
        token: omniTransfer.tokenAddress,
        amount: omniTransfer.amount,
        recipient: omniTransfer.recipient,
        fee: omniTransfer.fee,
        sender: sender,
        msg: "",
      }
      
      const accountId2 = calculateStorageAccountId(directTransfer)
      expect(accountId).toBe(accountId2)
    })
  })

  describe("Edge cases and validation", () => {
    it("should handle the exact example from Rust documentation", () => {
      // This should match the expected behavior from the Rust implementation
      const transferMessage: TransferMessage = {
        token: "near:wrap.near",
        amount: 1000000000000000000000000n, // 1 NEAR in yoctoNEAR
        recipient: "sol:recipient_address_here",
        fee: 10000000000000000000000n, // 0.01 NEAR in yoctoNEAR
        sender: "near:sender.near",
        msg: "Bridge transfer",
      }

      const accountId = calculateStorageAccountId(transferMessage)
      
      // The result should be a valid 64-character hex string
      expect(accountId).toMatch(/^[a-f0-9]{64}$/)
      expect(accountId).toHaveLength(64)
      
      // Should be deterministic
      const accountId2 = calculateStorageAccountId(transferMessage)
      expect(accountId).toBe(accountId2)
    })
  })
})