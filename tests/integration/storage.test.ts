import { describe, expect, it } from "vitest"
import { calculateStorageAccountId, calculateStorageAccountIdFromOmniTransfer, type TransferMessage } from "../../src/index.js"
import type { OmniTransferMessage } from "../../src/index.js"

describe("Storage Account ID - Integration Test", () => {
  it("should be accessible from main package exports", () => {
    // Verify that both functions are exported from the main package
    expect(typeof calculateStorageAccountId).toBe("function")
    expect(typeof calculateStorageAccountIdFromOmniTransfer).toBe("function")
  })

  it("should work with the main export API", () => {
    const transferMessage: TransferMessage = {
      token: "near:wrap.near",
      amount: 1000000000000000000000000n, // 1 NEAR
      recipient: "eth:0x1234567890abcdef1234567890abcdef12345678",
      fee: 10000000000000000000000n, // 0.01 NEAR
      sender: "near:alice.near",
      msg: "Cross-chain bridge transfer",
    }

    const storageAccountId = calculateStorageAccountId(transferMessage)
    
    // Should return a valid SHA256 hex string
    expect(storageAccountId).toMatch(/^[a-f0-9]{64}$/)
    expect(storageAccountId).toHaveLength(64)
    
    // Should be deterministic
    const storageAccountId2 = calculateStorageAccountId(transferMessage)
    expect(storageAccountId).toBe(storageAccountId2)
  })

  it("should handle real-world bridge scenarios", () => {
    // Scenario 1: NEAR to Ethereum bridge
    const nearToEth: TransferMessage = {
      token: "near:wrap.near",
      amount: 5000000000000000000000000n, // 5 NEAR
      recipient: "eth:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      fee: 50000000000000000000000n, // 0.05 NEAR
      sender: "near:user.near",
      msg: "Bridge to Ethereum",
    }

    // Scenario 2: Ethereum to Solana bridge
    const ethToSol: TransferMessage = {
      token: "eth:0xA0b86a33E6441b5a93c5e90D3a7dDbF527E05e5E",
      amount: 1000000000000000000n, // 1 ETH
      recipient: "sol:9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      fee: 10000000000000000n, // 0.01 ETH
      sender: "eth:0x742d35Cc6634C0532925a3b8D039C79E49906CDB",
      msg: "Multi-hop bridge transfer",
    }

    const accountId1 = calculateStorageAccountId(nearToEth)
    const accountId2 = calculateStorageAccountId(ethToSol)

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

    const accountId = calculateStorageAccountIdFromOmniTransfer(omniTransfer, sender)
    
    expect(accountId).toMatch(/^[a-f0-9]{64}$/)
    expect(accountId).toHaveLength(64)

    // Should produce same result as manual conversion
    const manualTransfer: TransferMessage = {
      token: omniTransfer.tokenAddress,
      amount: omniTransfer.amount,
      recipient: omniTransfer.recipient,
      fee: omniTransfer.fee,
      sender: sender,
      msg: omniTransfer.message || "",
    }

    const manualAccountId = calculateStorageAccountId(manualTransfer)
    expect(accountId).toBe(manualAccountId)
  })
})