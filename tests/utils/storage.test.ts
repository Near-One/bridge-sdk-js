import { describe, expect, it } from "vitest"
import { getStorageAccountId, getStorageAccountIdFromTransfer, type StorageTransferMessage } from "../../src/utils/storage.js"
import type { OmniAddress } from "../../src/types/common.js"
import type { OmniTransferMessage } from "../../src/types/omni.js"

describe("Storage Account ID Calculation", () => {
  describe("getStorageAccountId", () => {
    it("should calculate storage account ID for basic transfer message", () => {
      const transferMessage: StorageTransferMessage = {
        tokenAddress: "near:token.near",
        amount: 1000000n,
        fee: 100n,
        nativeFee: 0n,
        recipient: "near:recipient.near",
        sender: "near:sender.near",
        message: "test message",
      }

      const accountId = getStorageAccountId(transferMessage)
      
      // Should return a valid hex string (64 characters for SHA256)
      expect(accountId).toMatch(/^[a-f0-9]{64}$/)
      expect(accountId).toHaveLength(64)
    })

    it("should produce consistent results for identical inputs", () => {
      const transferMessage: StorageTransferMessage = {
        tokenAddress: "near:token.near",
        amount: 1000000n,
        fee: 100n,
        nativeFee: 0n,
        recipient: "near:recipient.near",
        sender: "near:sender.near",
        message: "test message",
      }

      const accountId1 = getStorageAccountId(transferMessage)
      const accountId2 = getStorageAccountId(transferMessage)
      
      expect(accountId1).toBe(accountId2)
    })

    it("should produce different results for different inputs", () => {
      const transferMessage1: StorageTransferMessage = {
        tokenAddress: "near:token.near",
        amount: 1000000n,
        fee: 100n,
        nativeFee: 0n,
        recipient: "near:recipient.near",
        sender: "near:sender.near",
        message: "test message",
      }

      const transferMessage2: StorageTransferMessage = {
        ...transferMessage1,
        amount: 2000000n, // Different amount
      }

      const accountId1 = getStorageAccountId(transferMessage1)
      const accountId2 = getStorageAccountId(transferMessage2)
      
      expect(accountId1).not.toBe(accountId2)
    })

    it("should handle different chain prefixes", () => {
      const transferMessage: StorageTransferMessage = {
        tokenAddress: "eth:0x1234567890abcdef1234567890abcdef12345678",
        amount: 1000000n,
        fee: 100n,
        nativeFee: 0n,
        recipient: "sol:SomeBase58AddressHere123456789",
        sender: "arb:0xabcdef1234567890abcdef1234567890abcdef12",
        message: "cross-chain transfer",
      }

      const accountId = getStorageAccountId(transferMessage)
      
      expect(accountId).toMatch(/^[a-f0-9]{64}$/)
      expect(accountId).toHaveLength(64)
    })

    it("should handle empty message", () => {
      const transferMessage: StorageTransferMessage = {
        tokenAddress: "near:token.near",
        amount: 1000000n,
        fee: 100n,
        nativeFee: 0n,
        recipient: "near:recipient.near",
        sender: "near:sender.near",
        message: "",
      }

      const accountId = getStorageAccountId(transferMessage)
      
      expect(accountId).toMatch(/^[a-f0-9]{64}$/)
      expect(accountId).toHaveLength(64)
    })

    it("should handle large amounts", () => {
      const transferMessage: StorageTransferMessage = {
        tokenAddress: "near:token.near",
        amount: 9007199254740991n, // Number.MAX_SAFE_INTEGER
        fee: 1000000n,
        nativeFee: 0n,
        recipient: "near:recipient.near",
        sender: "near:sender.near",
        message: "large amount transfer",
      }

      const accountId = getStorageAccountId(transferMessage)
      
      expect(accountId).toMatch(/^[a-f0-9]{64}$/)
      expect(accountId).toHaveLength(64)
    })

    it("should handle zero amounts and fees", () => {
      const transferMessage: StorageTransferMessage = {
        tokenAddress: "near:token.near",
        amount: 0n,
        fee: 0n,
        nativeFee: 0n,
        recipient: "near:recipient.near",
        sender: "near:sender.near",
        message: "zero transfer",
      }

      const accountId = getStorageAccountId(transferMessage)
      
      expect(accountId).toMatch(/^[a-f0-9]{64}$/)
      expect(accountId).toHaveLength(64)
    })

    it("should be sensitive to field order", () => {
      // The borsh serialization should maintain field order
      const transferMessage: StorageTransferMessage = {
        tokenAddress: "near:token.near",
        amount: 1000000n,
        fee: 100n,
        nativeFee: 0n,
        recipient: "near:recipient.near",
        sender: "near:sender.near",
        message: "test message",
      }

      const accountId = getStorageAccountId(transferMessage)
      
      // Even if we create the object with different field order in JS,
      // the schema should serialize them in the correct order
      const transferMessage2: StorageTransferMessage = {
        message: "test message",
        sender: "near:sender.near",
        fee: 100n,
        nativeFee: 0n,
        recipient: "near:recipient.near",
        amount: 1000000n,
        tokenAddress: "near:token.near",
      }

      const accountId2 = getStorageAccountId(transferMessage2)
      
      expect(accountId).toBe(accountId2)
    })

    it("should handle unicode characters in message", () => {
      const transferMessage: StorageTransferMessage = {
        tokenAddress: "near:token.near",
        amount: 1000000n,
        fee: 100n,
        nativeFee: 0n,
        recipient: "near:recipient.near",
        sender: "near:sender.near",
        message: "unicode test: 你好 🌍 αβγ",
      }

      const accountId = getStorageAccountId(transferMessage)
      
      expect(accountId).toMatch(/^[a-f0-9]{64}$/)
      expect(accountId).toHaveLength(64)
    })

    it("should handle very long addresses and messages", () => {
      const longAddress = ("near:" + "a".repeat(100) + ".near") as OmniAddress
      const longMessage = "x".repeat(1000)
      
      const transferMessage: StorageTransferMessage = {
        tokenAddress: longAddress,
        amount: 1000000n,
        fee: 100n,
        nativeFee: 0n,
        recipient: longAddress,
        sender: longAddress,
        message: longMessage,
      }

      const accountId = getStorageAccountId(transferMessage)
      
      expect(accountId).toMatch(/^[a-f0-9]{64}$/)
      expect(accountId).toHaveLength(64)
    })
  })

  describe("getStorageAccountIdFromTransfer", () => {
    it("should calculate storage account ID from OmniTransferMessage", () => {
      const omniTransfer: OmniTransferMessage = {
        tokenAddress: "near:token.near",
        amount: 1000000n,
        fee: 100n,
        nativeFee: 0n,
        recipient: "near:recipient.near",
        message: "test message",
      }
      const sender: OmniAddress = "near:sender.near"

      const accountId = getStorageAccountIdFromTransfer(omniTransfer, sender)
      
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

      const directTransfer: StorageTransferMessage = {
        tokenAddress: omniTransfer.tokenAddress,
        amount: omniTransfer.amount,
        fee: omniTransfer.fee,
        nativeFee: omniTransfer.nativeFee,
        recipient: omniTransfer.recipient,
        sender: sender,
        message: omniTransfer.message || "",
      }

      const accountId1 = getStorageAccountIdFromTransfer(omniTransfer, sender)
      const accountId2 = getStorageAccountId(directTransfer)
      
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

      const accountId = getStorageAccountIdFromTransfer(omniTransfer, sender)
      
      expect(accountId).toMatch(/^[a-f0-9]{64}$/)
      expect(accountId).toHaveLength(64)

      // Should be same as using empty string message
      const directTransfer: StorageTransferMessage = {
        tokenAddress: omniTransfer.tokenAddress,
        amount: omniTransfer.amount,
        fee: omniTransfer.fee,
        nativeFee: omniTransfer.nativeFee,
        recipient: omniTransfer.recipient,
        sender: sender,
        message: "",
      }
      
      const accountId2 = getStorageAccountId(directTransfer)
      expect(accountId).toBe(accountId2)
    })
  })

  describe("Edge cases and validation", () => {
    it("should handle the exact example from Rust documentation", () => {
      // This should match the expected behavior from the Rust implementation
      const transferMessage: StorageTransferMessage = {
        tokenAddress: "near:wrap.near",
        amount: 1000000000000000000000000n, // 1 NEAR in yoctoNEAR
        fee: 10000000000000000000000n, // 0.01 NEAR in yoctoNEAR
        nativeFee: 0n,
        recipient: "sol:recipient_address_here",
        sender: "near:sender.near",
        message: "Bridge transfer",
      }

      const accountId = getStorageAccountId(transferMessage)
      
      // The result should be a valid 64-character hex string
      expect(accountId).toMatch(/^[a-f0-9]{64}$/)
      expect(accountId).toHaveLength(64)
      
      // Should be deterministic
      const accountId2 = getStorageAccountId(transferMessage)
      expect(accountId).toBe(accountId2)
    })
  })
})