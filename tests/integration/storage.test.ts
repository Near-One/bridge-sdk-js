import { describe, expect, it } from "vitest"
import { getStorageAccountId, getStorageAccountIdFromTransfer, type StorageTransferMessage } from "../../src/index.js"
import type { OmniTransferMessage } from "../../src/index.js"

describe("Storage Account ID - Integration Test", () => {
  it("should be accessible from main package exports", () => {
    // Verify that both functions are exported from the main package
    expect(typeof getStorageAccountId).toBe("function")
    expect(typeof getStorageAccountIdFromTransfer).toBe("function")
  })

  it("should work with the main export API", () => {
    const transferMessage: StorageTransferMessage = {
      tokenAddress: "near:wrap.near",
      amount: 1000000000000000000000000n, // 1 NEAR
      fee: 10000000000000000000000n, // 0.01 NEAR
      nativeFee: 0n,
      recipient: "eth:0x1234567890abcdef1234567890abcdef12345678",
      sender: "near:alice.near",
      message: "Cross-chain bridge transfer",
    }

    const storageAccountId = getStorageAccountId(transferMessage)
    
    // Should return a valid SHA256 hex string
    expect(storageAccountId).toMatch(/^[a-f0-9]{64}$/)
    expect(storageAccountId).toHaveLength(64)
    
    // Should be deterministic
    const storageAccountId2 = getStorageAccountId(transferMessage)
    expect(storageAccountId).toBe(storageAccountId2)
  })

  it("should handle real-world bridge scenarios", () => {
    // Scenario 1: NEAR to Ethereum bridge
    const nearToEth: StorageTransferMessage = {
      tokenAddress: "near:wrap.near",
      amount: 5000000000000000000000000n, // 5 NEAR
      fee: 50000000000000000000000n, // 0.05 NEAR
      nativeFee: 0n,
      recipient: "eth:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      sender: "near:user.near",
      message: "Bridge to Ethereum",
    }

    // Scenario 2: Ethereum to Solana bridge
    const ethToSol: StorageTransferMessage = {
      tokenAddress: "eth:0xA0b86a33E6441b5a93c5e90D3a7dDbF527E05e5E",
      amount: 1000000000000000000n, // 1 ETH
      fee: 10000000000000000n, // 0.01 ETH
      nativeFee: 0n,
      recipient: "sol:9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      sender: "eth:0x742d35Cc6634C0532925a3b8D039C79E49906CDB",
      message: "Multi-hop bridge transfer",
    }

    const accountId1 = getStorageAccountId(nearToEth)
    const accountId2 = getStorageAccountId(ethToSol)

    // Should produce different IDs for different transfers
    expect(accountId1).not.toBe(accountId2)
    
    // Both should be valid
    expect(accountId1).toMatch(/^[a-f0-9]{64}$/)
    expect(accountId2).toMatch(/^[a-f0-9]{64}$/)
  })

  it("should work with OmniTransferMessage convenience function", () => {
    const omniTransfer: OmniTransferMessage = {
      tokenAddress: "near:wrap.near",
      amount: 1000000000000000000000000n, // 1 NEAR
      fee: 10000000000000000000000n, // 0.01 NEAR
      nativeFee: 5000000000000000000000n, // 0.005 NEAR (not used in calculation)
      recipient: "eth:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      message: "Convenience function test",
    }
    const sender = "near:user.near" as const

    const accountId = getStorageAccountIdFromTransfer(omniTransfer, sender)
    
    expect(accountId).toMatch(/^[a-f0-9]{64}$/)
    expect(accountId).toHaveLength(64)

    // Should produce same result as manual conversion
    const manualTransfer: StorageTransferMessage = {
      tokenAddress: omniTransfer.tokenAddress,
      amount: omniTransfer.amount,
      fee: omniTransfer.fee,
      nativeFee: omniTransfer.nativeFee,
      recipient: omniTransfer.recipient,
      sender: sender,
      message: omniTransfer.message || "",
    }

    const manualAccountId = getStorageAccountId(manualTransfer)
    expect(accountId).toBe(manualAccountId)
  })
})