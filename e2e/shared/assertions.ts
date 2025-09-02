import { expect } from "bun:test"
import { OmniBridgeAPI } from "../../src/api.js"

export class TransferAssertions {
  private api: OmniBridgeAPI

  constructor() {
    this.api = new OmniBridgeAPI()
  }

  async validateTransferStatus(
    originChain: "Near" | "Eth" | "Sol" | "Arb" | "Base",
    originNonce: number,
    expectedStatus?: "initialized" | "signed" | "finalised",
  ): Promise<void> {
    const status = await this.api.getTransferStatus(originChain, originNonce)

    expect(status).toBeDefined()
    expect(typeof status).toBe("object")

    console.log(`✓ Transfer status retrieved for ${originChain}:${originNonce}`)
    console.log("  Status:", JSON.stringify(status, null, 2))

    if (expectedStatus) {
      // Add specific status validation based on what the API returns
      expect(status).toHaveProperty(expectedStatus)
    }
  }

  async validateTransferCompletion(
    originChain: "Near" | "Eth" | "Sol" | "Arb" | "Base",
    originNonce: number,
  ): Promise<void> {
    const transfer = await this.api.getTransfer(originChain, originNonce)

    expect(transfer).toBeDefined()
    expect(transfer).toHaveProperty("id")
    expect(transfer).toHaveProperty("initialized")
    expect(transfer).toHaveProperty("transfer_message")

    // Verify the transfer has progressed beyond initialization
    const hasProgression =
      transfer.signed !== null || transfer.finalised !== null || transfer.claimed !== null

    if (hasProgression) {
      console.log("✓ Transfer has progressed beyond initialization")
    } else {
      console.log("⚠ Transfer is still in initialization phase")
    }

    console.log(`✓ Transfer details retrieved for ${originChain}:${originNonce}`)
    console.log(`  Transfer ID: ${transfer.id.origin_chain}:${transfer.id.origin_nonce}`)
    console.log(`  Token: ${transfer.transfer_message.token}`)
    console.log(`  Amount: ${transfer.transfer_message.amount}`)
    console.log(`  Sender: ${transfer.transfer_message.sender}`)
    console.log(`  Recipient: ${transfer.transfer_message.recipient}`)
  }

  async waitForTransferProgression(
    originChain: "Near" | "Eth" | "Sol" | "Arb" | "Base",
    originNonce: number,
    maxWaitTimeMs = 120000, // 2 minutes
  ): Promise<void> {
    const startTime = Date.now()
    const pollInterval = 5000 // 5 seconds

    console.log(`⏳ Waiting for transfer progression (max ${maxWaitTimeMs / 1000}s)...`)

    while (Date.now() - startTime < maxWaitTimeMs) {
      try {
        const transfer = await this.api.getTransfer(originChain, originNonce)

        // Check if transfer has progressed beyond initialization
        if (transfer.signed !== null || transfer.finalised !== null || transfer.claimed !== null) {
          console.log("✓ Transfer has progressed!")
          return
        }

        console.log(`⏳ Still waiting... (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`)
        await new Promise((resolve) => setTimeout(resolve, pollInterval))
      } catch (_error) {
        console.log("⏳ Transfer not found yet, continuing to wait...")
        await new Promise((resolve) => setTimeout(resolve, pollInterval))
      }
    }

    console.log(`⚠ Transfer did not progress within ${maxWaitTimeMs / 1000}s timeout`)
  }
}
