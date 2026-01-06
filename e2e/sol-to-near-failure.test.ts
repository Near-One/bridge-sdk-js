import { beforeAll, describe, expect, test } from "bun:test"
import { getWormholeVaa } from "@omni-bridge/core"
import { NearBridgeClient } from "../src/clients/near-kit.js"
import { SolanaBridgeClient } from "../src/clients/solana.js"
import { setNetwork } from "../src/config.js"
import { ChainKind, type OmniTransferMessage, ProofKind } from "../src/types/index.js"
import { omniAddress } from "../src/utils/index.js"
import { TIMEOUTS } from "./shared/fixtures.js"
import { setupTestAccounts, TEST_CONFIG, type TestAccountsSetup } from "./shared/setup.js"

describe("SOL to NEAR E2E Transfer Tests - Failure Cases (Manual Flow)", () => {
  let testAccounts: TestAccountsSetup
  let solanaClient: SolanaBridgeClient
  let nearClient: NearBridgeClient

  beforeAll(async () => {
    // Set network to testnet for all tests
    setNetwork("testnet")

    // Setup test accounts and clients
    testAccounts = await setupTestAccounts()
    solanaClient = new SolanaBridgeClient(testAccounts.solanaProvider)
    nearClient = new NearBridgeClient(testAccounts.nearKitInstance, undefined, {
      defaultSignerId: TEST_CONFIG.networks.near.accountId,
    })

    console.log("🚀 Test setup complete:")
    console.log(`  SOL Address: ${testAccounts.solanaProvider.publicKey.toString()}`)
    console.log(`  NEAR Account: ${TEST_CONFIG.networks.near.accountId}`)
  })

  test(
    "should handle finalization failure with panic message",
    async () => {
      console.log("\n🌉 Testing SOL → NEAR transfer with expected failure...")

      // Create transfer message with panic-inducing message
      const transferMessage: OmniTransferMessage = {
        tokenAddress: omniAddress(ChainKind.Sol, "3wQct2e43J1Z99h2RWrhPAhf6E32ZpuzEt6tgwfEAKAy"), // wNEAR on SOL
        amount: BigInt("10"), // Small test amount
        recipient: omniAddress(ChainKind.Near, "heavenly-interest.testnet"), // Mock tocken receiver
        message: JSON.stringify({
          return_value: "0",
          panic: true,
          extra_msg: "Triggering panic for testing",
        }),
        fee: BigInt(0), // No relayer fee
        nativeFee: BigInt(0), // No relayer fee
      }

      console.log("📤 Step 1: Initiating SOL → NEAR transfer...")
      console.log(`  Token: wNEAR (${transferMessage.tokenAddress})`)
      console.log(`  Amount: ${transferMessage.amount}`)
      console.log(`  From: ${testAccounts.solanaProvider.publicKey.toString()}`)
      console.log(`  To: ${transferMessage.recipient}`)
      console.log(`  Message: ${transferMessage.message}`)
      console.log("  Fee: 0 (manual flow)")

      // Step 1: Initiate transfer on Solana
      const transactionHash = await solanaClient.initTransfer(transferMessage)

      console.log("✓ Transfer initiated on Solana!")
      console.log(`  Transaction Hash: ${transactionHash}`)

      // Validate initiation
      expect(typeof transactionHash).toBe("string")
      expect(transactionHash.length).toBeGreaterThan(0)

      // Step 2: Get Wormhole VAA
      console.log("\n🔒 Step 2: Getting Wormhole VAA...")
      const vaa = await getWormholeVaa(transactionHash, "Testnet")

      console.log("✓ Wormhole VAA retrieved!")
      console.log("  VAA length:", vaa.length)

      // Validate VAA retrieval
      expect(vaa).toBeDefined()
      expect(typeof vaa).toBe("string")
      expect(vaa.length).toBeGreaterThan(0)

      // Step 4: Attempt to finalize transfer on NEAR (should fail)
      console.log("\n🏁 Step 4: Attempting to finalize transfer on NEAR (expecting failure)...")

      const nearTokenId = "wrap.testnet" // The equivalent NEAR token

      const finalizeResult = await nearClient.finalizeTransfer(
        nearTokenId,
        "heavenly-interest.testnet",
        BigInt(0),
        ChainKind.Sol,
        undefined, // signerId (uses defaultSignerId)
        vaa, // Wormhole VAA
        undefined, // No EVM proof needed for SOL
        ProofKind.InitTransfer,
      )

      // Get all receipts from the tx hash
      const refundLog = finalizeResult.receipts_outcome
        .flatMap((receipt) => receipt.outcome.logs)
        .find((log) =>
          log.includes(
            "Refund 10000000000000000 from heavenly-interest.testnet to omni.n-bridge.testnet",
          ),
        )
      expect(refundLog).toBeDefined()

      console.log("\n🎉 Failure test completed successfully!")
      console.log("  1. ✓ Initiated on SOL")
      console.log("  2. ✓ Got Wormhole VAA")
      console.log("  3. ✓ Finalization failed as expected")
      console.log("✅ Panic message test completed!")
    },
    TIMEOUTS.FULL_E2E_FLOW,
  )
})
