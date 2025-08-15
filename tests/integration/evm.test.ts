import { ethers } from "ethers"
import { beforeEach, describe, expect, it } from "vitest"
import { EvmBridgeClient } from "../../src/clients/evm.js"
import { setNetwork } from "../../src/config.js"
import { ChainKind } from "../../src/types/index.js"

describe("EVM Client Integration Tests", () => {
  let evmClient: EvmBridgeClient

  beforeEach(() => {
    // Set to testnet for Sepolia integration tests
    setNetwork("testnet")

    // Create a provider for Sepolia testnet
    const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com")

    // Create a mock wallet with the provider
    const mockWallet = {
      provider,
      address: "0x0000000000000000000000000000000000000000", // Mock address
      // biome-ignore lint/suspicious/noExplicitAny: Test mock
    } as any

    evmClient = new EvmBridgeClient(mockWallet, ChainKind.Eth)
  })

  describe("getInitTransferEvent", () => {
    it("should parse InitTransfer event from Sepolia transaction", async () => {
      // Test with the specific Sepolia transaction provided
      const txHash = "0xd3a3b2f5d8bcd25e90304205863d03c2eb8441febcf0a59cde00fde0ff9076f1"

      const event = await evmClient.getInitTransferEvent(txHash)

      // Validate the event structure
      expect(event).toHaveProperty("sender")
      expect(event).toHaveProperty("tokenAddress")
      expect(event).toHaveProperty("originNonce")
      expect(event).toHaveProperty("amount")
      expect(event).toHaveProperty("fee")
      expect(event).toHaveProperty("nativeTokenFee")
      expect(event).toHaveProperty("recipient")
      expect(event).toHaveProperty("message")

      // Validate types
      expect(typeof event.sender).toBe("string")
      expect(typeof event.tokenAddress).toBe("string")
      expect(typeof event.originNonce).toBe("bigint")
      expect(typeof event.amount).toBe("bigint")
      expect(typeof event.fee).toBe("bigint")
      expect(typeof event.nativeTokenFee).toBe("bigint")
      expect(typeof event.recipient).toBe("string")
      expect(typeof event.message).toBe("string")

      // Validate that addresses are valid Ethereum addresses
      expect(ethers.isAddress(event.sender)).toBe(true)
      expect(ethers.isAddress(event.tokenAddress)).toBe(true)

      // Validate that BigInt values are non-negative
      expect(event.originNonce).toBeGreaterThanOrEqual(0n)
      expect(event.amount).toBeGreaterThanOrEqual(0n)
      expect(event.fee).toBeGreaterThanOrEqual(0n)
      expect(event.nativeTokenFee).toBeGreaterThanOrEqual(0n)
    }, 30000) // 30 second timeout for network calls

    it("should throw error for transaction without InitTransfer event", async () => {
      // Use a random Sepolia transaction that doesn't contain InitTransfer event
      const txHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"

      await expect(evmClient.getInitTransferEvent(txHash)).rejects.toThrow()
    }, 30000)

    it("should throw error for non-existent transaction", async () => {
      // Use a completely non-existent transaction hash
      const txHash = "0x0000000000000000000000000000000000000000000000000000000000000000"

      await expect(evmClient.getInitTransferEvent(txHash)).rejects.toThrow(
        "Transaction receipt not found for hash",
      )
    }, 30000)
  })
})
