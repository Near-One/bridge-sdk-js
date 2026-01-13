import { beforeAll, describe, expect, test } from "bun:test"
import { ChainKind, createBridge } from "@omni-bridge/core"
import {
  createNearBuilder,
  type InitTransferEvent,
  MPCSignature,
  type SignTransferEvent,
  toNearKitTransaction,
} from "@omni-bridge/near"
import { createSolanaBuilder, type SolanaTransferMessagePayload } from "@omni-bridge/solana"
import { Connection, Keypair, sendAndConfirmTransaction, Transaction } from "@solana/web3.js"
import type { Near } from "near-kit"
import { NEAR_TO_SOL_ROUTES, TIMEOUTS } from "./shared/fixtures.js"
import { createNearKitInstance, TEST_CONFIG } from "./shared/setup.js"

describe("NEAR to SOL E2E Transfer Tests (Manual Flow)", () => {
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
    console.log(`  NEAR Account: ${TEST_CONFIG.networks.near.accountId}`)
    console.log(`  SOL Address: ${keypair.publicKey.toString()}`)
  })

  test.each(NEAR_TO_SOL_ROUTES)(
    "should complete manual NEAR to SOL transfer: $name",
    async (route) => {
      console.log(`\n🌉 Testing ${route.name} (Manual Flow)...`)

      // Create builders
      const bridge = createBridge({ network: "testnet" })
      const nearBuilder = createNearBuilder({ network: "testnet" })
      const solBuilder = createSolanaBuilder({ network: "testnet", connection })

      // Build transfer params
      const solanaRecipient = keypair.publicKey.toString()
      const signerId = TEST_CONFIG.networks.near.accountId

      console.log("📤 Step 1: Initiating NEAR → SOL transfer...")
      console.log(`  Token: ${route.token.symbol} (${route.token.address})`)
      console.log(`  Amount: ${route.token.testAmount}`)
      console.log(`  From: ${route.sender}`)
      console.log(`  To: sol:${solanaRecipient}`)
      console.log("  Fee: 0 (manual flow)")

      // Validate transfer
      const validated = await bridge.validateTransfer({
        token: route.token.address,
        amount: BigInt(route.token.testAmount),
        fee: 0n,
        nativeFee: 0n,
        sender: `near:${signerId}`,
        recipient: `sol:${solanaRecipient}`,
        message: "E2E manual test transfer",
      })

      // Build and send init transfer
      const initTx = nearBuilder.buildTransfer(validated, signerId)
      const initResult = await toNearKitTransaction(near, initTx).send()

      // Parse InitTransferEvent from logs
      const initEventLog = initResult.receipts_outcome
        .flatMap((receipt) => receipt.outcome.logs)
        .find((log) => log.includes("InitTransferEvent"))

      if (!initEventLog) {
        throw new Error("InitTransferEvent not found in transaction logs")
      }

      const initEvent: InitTransferEvent = JSON.parse(initEventLog).InitTransferEvent

      console.log("✓ Transfer initiated on NEAR!")
      console.log(`  Origin Nonce: ${initEvent.transfer_message.origin_nonce}`)

      // Validate initiation
      expect(initEvent).toHaveProperty("transfer_message")
      expect(initEvent.transfer_message).toHaveProperty("origin_nonce")
      expect(initEvent.transfer_message.origin_nonce).toBeGreaterThan(0)

      // Step 2: Sign the transfer on NEAR
      console.log("\n🖋️ Step 2: Signing transfer on NEAR...")

      const signTx = nearBuilder.buildSignTransfer(
        {
          origin_chain: ChainKind.Near,
          origin_nonce: BigInt(initEvent.transfer_message.origin_nonce),
        },
        route.sender, // fee recipient
        {
          fee: initEvent.transfer_message.fee.fee,
          native_fee: initEvent.transfer_message.fee.native_fee,
        },
        signerId,
      )

      const signResult = await toNearKitTransaction(near, signTx).send({ waitUntil: "FINAL" })

      // Parse SignTransferEvent from logs
      const signEventLog = signResult.receipts_outcome
        .flatMap((receipt) => receipt.outcome.logs)
        .find((log) => log.includes("SignTransferEvent"))

      if (!signEventLog) {
        throw new Error("SignTransferEvent not found in transaction logs")
      }

      const signEvent: SignTransferEvent = JSON.parse(signEventLog).SignTransferEvent

      console.log("✓ Transfer signed on NEAR!")
      console.log("  Signature:", signEvent.signature)

      // Validate signing
      expect(signEvent).toHaveProperty("signature")
      expect(signEvent).toHaveProperty("message_payload")

      // Step 3: Finalize transfer on Solana
      console.log("\n🏁 Step 3: Finalizing transfer on Solana...")

      // Convert MPC signature to Solana format
      const mpcSignature = MPCSignature.fromRaw(signEvent.signature)

      // Build the transfer message payload for Solana
      const messagePayload: SolanaTransferMessagePayload = {
        destination_nonce: BigInt(signEvent.message_payload.destination_nonce),
        transfer_id: {
          origin_chain: signEvent.message_payload.transfer_id.origin_chain,
          origin_nonce: signEvent.message_payload.transfer_id.origin_nonce,
        },
        token_address: signEvent.message_payload.token_address,
        amount: signEvent.message_payload.amount,
        recipient: signEvent.message_payload.recipient,
        fee_recipient: signEvent.message_payload.fee_recipient,
      }

      const finalizeInstructions = await solBuilder.buildFinalization(
        messagePayload,
        mpcSignature,
        keypair.publicKey,
      )

      // Build and send Solana transaction
      const { blockhash } = await connection.getLatestBlockhash()
      const solTx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: keypair.publicKey,
      })
      solTx.add(...finalizeInstructions)

      const finalizeResult = await sendAndConfirmTransaction(connection, solTx, [keypair])

      console.log("✓ Transfer finalized on Solana!")
      console.log("  Finalization TX:", finalizeResult)

      // Validate finalization
      expect(finalizeResult).toBeDefined()
      expect(typeof finalizeResult).toBe("string")
      expect(finalizeResult.length).toBeGreaterThan(0)

      console.log("\n🎉 Manual transfer flow completed successfully!")
      console.log("  1. ✓ Initiated on NEAR")
      console.log("  2. ✓ Signed on NEAR")
      console.log("  3. ✓ Finalized on SOL")
      console.log(`✅ ${route.name} test completed!`)
    },
    TIMEOUTS.FULL_E2E_FLOW,
  )
})
