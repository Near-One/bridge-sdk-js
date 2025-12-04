import { beforeAll, describe, expect, test } from "bun:test"
import { NearBridgeClient } from "../src/clients/near-kit.js"
import { SolanaBridgeClient } from "../src/clients/solana.js"
import { setNetwork } from "../src/config.js"
import { ChainKind, type OmniTransferMessage } from "../src/types/index.js"
import { omniAddress } from "../src/utils/index.js"
import { NEAR_TO_SOL_ROUTES, TIMEOUTS } from "./shared/fixtures.js"
import {
  TEST_CONFIG,
  type TestAccountsSetup,
  setupTestAccounts,
} from "./shared/setup.js"

describe("NEAR to SOL E2E Transfer Tests (Manual Flow)", () => {
  let testAccounts: TestAccountsSetup
  let nearClient: NearBridgeClient
  let solanaClient: SolanaBridgeClient

  beforeAll(async () => {
    // Set network to testnet for all tests
    setNetwork("testnet")

    // Setup test accounts and clients
    testAccounts = await setupTestAccounts()
    nearClient = new NearBridgeClient(testAccounts.nearKitInstance, undefined, {
      defaultSignerId: TEST_CONFIG.networks.near.accountId,
    })
    solanaClient = new SolanaBridgeClient(testAccounts.solanaProvider)

    console.log("🚀 Test setup complete:")
    console.log(`  NEAR Account: ${TEST_CONFIG.networks.near.accountId}`)
    console.log(
      `  SOL Address: ${testAccounts.solanaProvider.publicKey.toString()}`
    )
  })

  test.each(NEAR_TO_SOL_ROUTES)(
    "should complete manual NEAR to SOL transfer: $name",
    async (route) => {
      console.log(`\n🌉 Testing ${route.name} (Manual Flow)...`)

      // Create transfer message with zero fees (manual flow)
      // Use the actual Solana wallet address as recipient
      const solanaRecipient = testAccounts.solanaProvider.publicKey.toString()
      const transferMessage: OmniTransferMessage = {
        tokenAddress: route.token.address,
        amount: BigInt(route.token.testAmount),
        recipient: omniAddress(ChainKind.Sol, solanaRecipient),
        message: "E2E manual test transfer",
        fee: BigInt(0), // No relayer fee
        nativeFee: BigInt(0), // No relayer fee
      }

      console.log("📤 Step 1: Initiating NEAR → SOL transfer...")
      console.log(`  Token: ${route.token.symbol} (${route.token.address})`)
      console.log(`  Amount: ${route.token.testAmount}`)
      console.log(`  From: ${route.sender}`)
      console.log(`  To: ${transferMessage.recipient}`)
      console.log("  Fee: 0 (manual flow)")

      // Step 1: Initiate transfer on NEAR
      const initResult = await nearClient.initTransfer(transferMessage)

      console.log("✓ Transfer initiated on NEAR!")
      console.log(`  Origin Nonce: ${initResult.transfer_message.origin_nonce}`)
      console.log(
        "  Transfer Message:",
        JSON.stringify(initResult.transfer_message, null, 2)
      )

      // Validate initiation
      expect(initResult).toHaveProperty("transfer_message")
      expect(initResult.transfer_message).toHaveProperty("origin_nonce")
      expect(initResult.transfer_message.origin_nonce).toBeGreaterThan(0)

      // Step 2: Sign the transfer on NEAR
      console.log("\n🖋️ Step 2: Signing transfer on NEAR...")
      const signResult = await nearClient.signTransfer(initResult, route.sender)

      console.log("✓ Transfer signed on NEAR!")
      console.log("  Signature:", signResult.signature)
      console.log("  Message Payload:", signResult.message_payload)

      // Validate signing
      expect(signResult).toHaveProperty("signature")
      expect(signResult).toHaveProperty("message_payload")

      // Step 3: Finalize transfer on Solana
      console.log("\n🏁 Step 3: Finalizing transfer on Solana...")

      // Use the signature and message payload from the sign result
      const finalizeResult = await solanaClient.finalizeTransfer(
        signResult.message_payload,
        signResult.signature
      )

      console.log("✓ Transfer finalized on Solana!")
      console.log("  Finalization TX:", finalizeResult)

      // Validate finalization
      expect(finalizeResult).toBeDefined()
      expect(typeof finalizeResult).toBe("string") // Should be transaction hash
      expect(finalizeResult.length).toBeGreaterThan(0)

      console.log("\n🎉 Manual transfer flow completed successfully!")
      console.log("  1. ✓ Initiated on NEAR")
      console.log("  2. ✓ Signed on NEAR")
      console.log("  3. ✓ Finalized on SOL")
      console.log(`✅ ${route.name} test completed!`)
    },
    TIMEOUTS.FULL_E2E_FLOW
  )
})
