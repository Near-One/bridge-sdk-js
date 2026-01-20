import { beforeAll, describe, expect, test } from "bun:test"
import { ChainKind, createBridge, getWormholeVaa } from "@omni-bridge/core"
import { createNearBuilder, toNearKitTransaction } from "@omni-bridge/near"
import { createSolanaBuilder } from "@omni-bridge/solana"
import { Connection, Keypair, sendAndConfirmTransaction, Transaction } from "@solana/web3.js"
import type { Near } from "near-kit"
import { SOL_TO_NEAR_ROUTES, TIMEOUTS } from "./shared/fixtures.js"
import { createNearKitInstance, TEST_CONFIG } from "./shared/setup.js"

describe("SOL to NEAR E2E Transfer Tests (Manual Flow)", () => {
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

  test.each(SOL_TO_NEAR_ROUTES)(
    "should complete manual SOL to NEAR transfer: $name",
    async (route) => {
      console.log(`\n🌉 Testing ${route.name} (Manual Flow)...`)

      // Create builders
      const bridge = createBridge({ network: "testnet" })
      const nearBuilder = createNearBuilder({ network: "testnet" })
      const solBuilder = createSolanaBuilder({ network: "testnet", connection })

      const signerId = TEST_CONFIG.networks.near.accountId

      console.log("📤 Step 1: Initiating SOL → NEAR transfer...")
      console.log(`  Token: ${route.token.symbol} (${route.token.address})`)
      console.log(`  Amount: ${route.token.testAmount}`)
      console.log(`  From: ${route.sender}`)
      console.log(`  To: near:${route.recipient}`)
      console.log("  Fee: 0 (manual flow)")

      // Validate transfer
      const validated = await bridge.validateTransfer({
        token: route.token.address,
        amount: BigInt(route.token.testAmount),
        fee: 0n,
        nativeFee: 0n,
        sender: `sol:${keypair.publicKey.toString()}`,
        recipient: `near:${route.recipient}`,
      })

      // Build Solana init transfer instructions
      const initInstructions = await solBuilder.buildTransfer(validated, keypair.publicKey)

      // Build and send Solana transaction
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

      // Step 3: Finalize transfer on NEAR
      console.log("\n🏁 Step 3: Finalizing transfer on NEAR...")

      // Get the bridged token address on NEAR for storage deposit
      const nearTokenAddress = await bridge.getBridgedToken(route.token.address, ChainKind.Near)
      if (!nearTokenAddress) {
        throw new Error(`No bridged token found on NEAR for ${route.token.address}`)
      }

      // Extract the NEAR token account ID (remove "near:" prefix)
      const tokenAccountId = nearTokenAddress.split(":")[1]
      if (!tokenAccountId) {
        throw new Error("Invalid NEAR token address format")
      }

      // Build NEAR finalization transaction with storage deposit
      const finalizeTx = nearBuilder.buildFinalization({
        sourceChain: ChainKind.Sol,
        signerId,
        vaa: vaa,
        storageDepositActions: [
          {
            token_id: tokenAccountId,
            account_id: signerId,
            storage_deposit_amount: null, // Let the contract determine the required amount
          },
        ],
      })

      const finalizeResult = await toNearKitTransaction(near, finalizeTx).send()

      console.log("✓ Transfer finalized on NEAR!")
      console.log(`  Finalization TX: ${finalizeResult.transaction.hash}`)

      // Validate finalization
      expect(finalizeResult.transaction.hash).toBeDefined()
      expect(typeof finalizeResult.transaction.hash).toBe("string")
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
