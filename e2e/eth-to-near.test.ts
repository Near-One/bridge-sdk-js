import { ethers } from "ethers"
import { beforeAll, describe, expect, test } from "vitest"
import { EvmBridgeClient } from "../src/clients/evm.js"
import { NearBridgeClient } from "../src/clients/near.js"
import { setNetwork } from "../src/config.js"
import { getEvmProof } from "../src/proofs/evm.js"
import { ChainKind, type OmniTransferMessage, ProofKind } from "../src/types/index.js"
import { omniAddress } from "../src/utils/index.js"
import { ETH_TO_NEAR_ROUTES, TIMEOUTS } from "./shared/fixtures.js"
import { type TestAccountsSetup, setupTestAccounts } from "./shared/setup.js"

describe("ETH to NEAR E2E Transfer Tests (Manual Flow)", () => {
  let testAccounts: TestAccountsSetup
  let ethClient: EvmBridgeClient
  let nearClient: NearBridgeClient

  beforeAll(async () => {
    // Set network to testnet for all tests
    setNetwork("testnet")

    // Setup test accounts and clients
    testAccounts = await setupTestAccounts()
    ethClient = new EvmBridgeClient(testAccounts.ethWallet, ChainKind.Eth)
    nearClient = new NearBridgeClient(testAccounts.nearAccount)

    console.log("🚀 Test setup complete:")
    console.log(`  ETH Address: ${testAccounts.ethWallet.address}`)
    console.log(`  NEAR Account: ${testAccounts.nearAccount.accountId}`)
  }, TIMEOUTS.NETWORK_REQUEST)

  test.each(ETH_TO_NEAR_ROUTES)(
    "should complete manual ETH to NEAR transfer: $name",
    async (route) => {
      console.log(`\n🌉 Testing ${route.name} (Manual Flow)...`)

      // Create transfer message with zero fees (manual flow)
      const transferMessage: OmniTransferMessage = {
        tokenAddress: route.token.address,
        amount: BigInt(route.token.testAmount),
        recipient: omniAddress(ChainKind.Near, route.recipient),
        message: "E2E manual test transfer",
        fee: BigInt(0), // No relayer fee
        nativeFee: BigInt(0), // No relayer fee
      }

      console.log("📤 Step 1: Initiating ETH → NEAR transfer...")
      console.log(`  Token: ${route.token.symbol} (${route.token.address})`)
      console.log(`  Amount: ${route.token.testAmount}`)
      console.log(`  From: ${route.sender}`)
      console.log(`  To: ${transferMessage.recipient}`)
      console.log("  Fee: 0 (manual flow)")

      // Step 1: Initiate transfer on Ethereum
      const transactionHash = await ethClient.initTransfer(transferMessage)

      console.log("✓ Transfer initiated on Ethereum!")
      console.log(`  Transaction Hash: ${transactionHash}`)

      // Validate initiation
      expect(typeof transactionHash).toBe("string")
      expect(transactionHash.length).toBeGreaterThan(0)

      // Step 2: Get the InitTransfer event from the transaction
      console.log("\n🔍 Step 2: Extracting transfer event from transaction...")
      const transferEvent = await ethClient.getInitTransferEvent(transactionHash)

      console.log("✓ Transfer event extracted!")
      console.log(`  Origin Nonce: ${transferEvent.originNonce}`)
      console.log(`  Token: ${transferEvent.tokenAddress}`)
      console.log(`  Amount: ${transferEvent.amount}`)
      console.log(`  Recipient: ${transferEvent.recipient}`)

      // Validate event extraction
      expect(transferEvent).toHaveProperty("originNonce")
      expect(transferEvent).toHaveProperty("tokenAddress")
      expect(transferEvent).toHaveProperty("amount")
      expect(transferEvent).toHaveProperty("recipient")

      // Step 3: Generate EVM proof
      console.log("\n🔒 Step 3: Generating EVM proof...")

      // Calculate the InitTransfer event topic hash
      // InitTransfer(address indexed sender, address indexed tokenAddress, uint64 indexed originNonce, uint128 amount, uint128 fee, uint128 nativeTokenFee, string recipient, string message)
      const initTransferSignature =
        "InitTransfer(address,address,uint64,uint128,uint128,uint128,string,string)"
      const INIT_TRANSFER_TOPIC = ethers.id(initTransferSignature)

      const proof = await getEvmProof(transactionHash, INIT_TRANSFER_TOPIC, ChainKind.Eth)

      console.log("✓ EVM proof generated!")
      console.log("  Proof length:", proof.proof.length)

      // Validate proof generation
      expect(proof).toHaveProperty("proof")
      expect(proof.proof.length).toBeGreaterThan(0)

      // Step 4: Wait for transaction to be finalized
      console.log("\n⏳ Step 4: Waiting for transaction finalization...")
      await new Promise((resolve) => setTimeout(resolve, 30000)) // Wait 30s for finalization

      // Step 5: Finalize transfer on NEAR
      console.log("\n🏁 Step 5: Finalizing transfer on NEAR...")

      // Extract the NEAR token address (remove "eth:" prefix and use equivalent NEAR token)
      const nearTokenId = "wrap.testnet" // The equivalent NEAR token
      const storageDepositAmount = "1000000000000000000000000" // 1 NEAR in yoctoNEAR for storage

      const finalizeResult = await nearClient.finalizeTransfer(
        nearTokenId,
        route.recipient.split(":")[1], // Remove "near:" prefix
        BigInt(storageDepositAmount),
        ChainKind.Eth,
        undefined, // No VAA needed for EVM
        proof, // EVM proof required
        ProofKind.InitTransfer,
      )

      console.log("✓ Transfer finalized on NEAR!")
      console.log(`  Finalization TX: ${finalizeResult}`)

      // Validate finalization
      expect(finalizeResult).toBeDefined()
      expect(typeof finalizeResult).toBe("string") // Should be transaction hash
      expect(finalizeResult.length).toBeGreaterThan(0)

      console.log("\n🎉 Manual transfer flow completed successfully!")
      console.log("  1. ✓ Initiated on ETH")
      console.log("  2. ✓ Extracted event data")
      console.log("  3. ✓ Generated EVM proof")
      console.log("  4. ✓ Finalized on NEAR")
      console.log(`✅ ${route.name} test completed!`)
    },
    TIMEOUTS.FULL_E2E_FLOW,
  )
})
