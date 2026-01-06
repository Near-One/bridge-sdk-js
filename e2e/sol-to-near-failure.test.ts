import { beforeAll, describe, expect, test } from "bun:test"
import { ChainKind, createBridge, getWormholeVaa, omniAddress } from "@omni-bridge/core"
import { createNearBuilder, toNearKitTransaction } from "@omni-bridge/near"
import { createSolanaBuilder } from "@omni-bridge/solana"
import { Connection, Keypair, sendAndConfirmTransaction, Transaction } from "@solana/web3.js"
import type { Near } from "near-kit"
import { TIMEOUTS } from "./shared/fixtures.js"
import { createNearKitInstance, TEST_CONFIG } from "./shared/setup.js"

describe("SOL to NEAR E2E Transfer Tests - Failure Cases (Manual Flow)", () => {
  let near: Near
  let connection: Connection
  let keypair: Keypair

  beforeAll(async () => {
    // Setup NEAR
    near = await createNearKitInstance()

    // Setup Solana
    const { solana } = TEST_CONFIG.networks
    if (!solana.privateKey) {
      throw new Error("SOL_PRIVATE_KEY environment variable required")
    }

    const privateKeyBytes = Uint8Array.from(Buffer.from(solana.privateKey, "base64"))
    keypair = Keypair.fromSecretKey(privateKeyBytes)
    connection = new Connection(solana.rpcUrl, solana.commitment)

    console.log("🚀 Test setup complete:")
    console.log(`  SOL Address: ${keypair.publicKey.toString()}`)
    console.log(`  NEAR Account: ${TEST_CONFIG.networks.near.accountId}`)
  })

  test(
    "should handle finalization failure with panic message",
    async () => {
      console.log("\n🌉 Testing SOL → NEAR transfer with expected failure...")

      // Create builders
      const bridge = createBridge({ network: "testnet" })
      const nearBuilder = createNearBuilder({ network: "testnet" })
      const solBuilder = createSolanaBuilder({ network: "testnet", connection })

      const signerId = TEST_CONFIG.networks.near.accountId

      // Token and transfer params - using wNEAR on Solana with panic message
      const tokenAddress = omniAddress(
        ChainKind.Sol,
        "3wQct2e43J1Z99h2RWrhPAhf6E32ZpuzEt6tgwfEAKAy",
      )
      const recipient = omniAddress(ChainKind.Near, "heavenly-interest.testnet")

      console.log("📤 Step 1: Initiating SOL → NEAR transfer...")
      console.log(`  Token: wNEAR (${tokenAddress})`)
      console.log(`  Amount: 10`)
      console.log(`  From: ${keypair.publicKey.toString()}`)
      console.log(`  To: ${recipient}`)
      console.log("  Message: Triggering panic for testing")
      console.log("  Fee: 0 (manual flow)")

      // Validate transfer with panic-inducing message
      const validated = await bridge.validateTransfer({
        token: tokenAddress,
        amount: 10n,
        fee: 0n,
        nativeFee: 0n,
        sender: `sol:${keypair.publicKey.toString()}`,
        recipient: recipient,
        message: JSON.stringify({
          return_value: "0",
          panic: true,
          extra_msg: "Triggering panic for testing",
        }),
      })

      // Step 1: Build and send Solana init transfer
      const initInstructions = await solBuilder.buildTransfer(validated, keypair.publicKey)

      const { blockhash } = await connection.getLatestBlockhash()
      const solTx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: keypair.publicKey,
      })
      solTx.add(...initInstructions)

      const transactionHash = await sendAndConfirmTransaction(connection, solTx, [keypair])

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

      // Step 3: Attempt to finalize transfer on NEAR (should fail/refund)
      console.log("\n🏁 Step 3: Attempting to finalize transfer on NEAR (expecting failure)...")

      const nearTokenId = "wrap.testnet" // The equivalent NEAR token

      // Build NEAR finalization transaction
      const finalizeTx = nearBuilder.buildFinalization({
        sourceChain: ChainKind.Sol,
        signerId,
        vaa: vaa,
        storageDepositActions: [
          {
            token_id: nearTokenId,
            account_id: "heavenly-interest.testnet",
            storage_deposit_amount: null,
          },
        ],
      })

      const finalizeResult = await toNearKitTransaction(near, finalizeTx).send()

      // Get all receipts from the tx hash and check for refund log
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
