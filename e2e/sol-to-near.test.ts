import { beforeAll, describe, expect, test } from "bun:test"
import { NearBridgeClient } from "../src/clients/near-kit.js"
import { SolanaBridgeClient } from "../src/clients/solana.js"
import { setNetwork } from "../src/config.js"
import { getVaa } from "../src/proofs/wormhole.js"
import { ChainKind, type OmniTransferMessage, ProofKind } from "../src/types/index.js"
import { omniAddress } from "../src/utils/index.js"
import { SOL_TO_NEAR_ROUTES, TIMEOUTS } from "./shared/fixtures.js"
import { TEST_CONFIG, type TestAccountsSetup, setupTestAccounts } from "./shared/setup.js"

describe("SOL to NEAR E2E Transfer Tests (Manual Flow)", () => {
  let testAccounts: TestAccountsSetup
  let solanaClient: SolanaBridgeClient
  let nearClient: NearBridgeClient

  beforeAll(async () => {
    // Set network to testnet for all tests
    setNetwork("testnet")

    // Setup test accounts and clients
    testAccounts = await setupTestAccounts()
    solanaClient = new SolanaBridgeClient(testAccounts.solanaProvider)
    nearClient = new NearBridgeClient(testAccounts.nearAccount, undefined, {
      defaultSignerId: TEST_CONFIG.networks.near.accountId,
    })

    console.log("🚀 Test setup complete:")
    console.log(`  SOL Address: ${testAccounts.solanaProvider.publicKey.toString()}`)
    console.log(`  NEAR Account: ${TEST_CONFIG.networks.near.accountId}`)
  })

  test.each(SOL_TO_NEAR_ROUTES)(
    "should complete manual SOL to NEAR transfer: $name",
    async (route) => {
      console.log(`\n🌉 Testing ${route.name} (Manual Flow)...`)

      // Create transfer message with zero fees (manual flow)
      const transferMessage: OmniTransferMessage = {
        tokenAddress: route.token.address,
        amount: BigInt(route.token.testAmount),
        recipient: omniAddress(ChainKind.Near, route.recipient),
        fee: BigInt(0), // No relayer fee
        nativeFee: BigInt(0), // No relayer fee
      }

      console.log("📤 Step 1: Initiating SOL → NEAR transfer...")
      console.log(`  Token: ${route.token.symbol} (${route.token.address})`)
      console.log(`  Amount: ${route.token.testAmount}`)
      console.log(`  From: ${route.sender}`)
      console.log(`  To: ${transferMessage.recipient}`)
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
      const vaa = await getVaa(transactionHash, "Testnet")

      console.log("✓ Wormhole VAA retrieved!")
      console.log("  VAA length:", vaa.length)

      // Validate VAA retrieval
      expect(vaa).toBeDefined()
      expect(typeof vaa).toBe("string")
      expect(vaa.length).toBeGreaterThan(0)

      // Step 3: Finalize transfer on NEAR
      console.log("\n🏁 Step 3: Finalizing transfer on NEAR...")

      // Extract the NEAR token ID (equivalent of the Solana wNEAR token)
      const nearTokenId = "wrap.testnet" // The equivalent NEAR token

      const finalizeResult = await nearClient.finalizeTransfer(
        nearTokenId,
        route.recipient,
        BigInt(0),
        ChainKind.Sol,
        undefined, // signerId (uses defaultSignerId)
        vaa, // Wormhole VAA
        undefined, // No EVM proof needed for SOL
        ProofKind.InitTransfer,
      )

      console.log("✓ Transfer finalized on NEAR!")
      console.log(`  Finalization TX: ${finalizeResult.transaction.hash}`)

      // Validate finalization
      expect(finalizeResult.transaction.hash).toBeDefined()
      expect(typeof finalizeResult.transaction.hash).toBe("string") // Should be transaction hash
      expect(finalizeResult.transaction.hash.length).toBeGreaterThan(0)

      console.log("\n🎉 Manual transfer flow completed successfully!")
      console.log("  1. ✓ Initiated on SOL")
      console.log("  2. ✓ Got Wormhole VAA")
      console.log("  3. ✓ Finalized on NEAR")
      console.log(`✅ ${route.name} test completed!`)
    },
    TIMEOUTS.FULL_E2E_FLOW,
  )
})
