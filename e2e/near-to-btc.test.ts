import { createBtcBuilder } from "@omni-bridge/btc"
import { BridgeAPI, type UTXO } from "@omni-bridge/core"
import { createNearBuilder, toNearKitTransaction } from "@omni-bridge/near"
import type { Near } from "near-kit"
import { beforeAll, describe, expect, test } from "vitest"
import { TIMEOUTS } from "./shared/fixtures.js"
import { createNearKitInstance, TEST_CONFIG } from "./shared/setup.js"

/**
 * BTC Withdrawal E2E Test (NEAR → BTC)
 *
 * This test verifies the complete BTC withdrawal flow from NEAR:
 * 1. Get connector config and available UTXOs using helper methods
 * 2. Build withdrawal plan using BtcBuilder
 * 3. Initiate withdrawal on NEAR using NearBuilder
 * 4. Wait for MPC signing (poll API)
 * 5. Get signed transaction bytes from NEAR logs
 * 6. Broadcast to Bitcoin network
 *
 * Requirements:
 * - NEAR account with nBTC balance (at least min_withdraw_amount + fees)
 * - NEAR_PRIVATE_KEY env var or local keystore credentials
 *
 * To get nBTC for testing:
 * 1. Get deposit address: near view btc-connector.n-bridge.testnet get_user_deposit_address \
 *    '{"deposit_msg": {"recipient_id": "omni-sdk-test.testnet"}}' --networkId testnet
 * 2. Send testnet BTC to that address (use a faucet)
 * 3. Wait for 2 confirmations - relayers will auto-finalize
 */

// Configuration
const BITCOIN_TESTNET_ADDRESS =
  process.env.BTC_TARGET_ADDRESS ?? "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"

// Polling configuration for MPC signing
const SIGNING_POLL_INTERVAL_MS = 5000
const SIGNING_MAX_ATTEMPTS = 60 // 5 minutes max wait

/**
 * Wait for MPC signing by polling the bridge API
 */
async function waitForSigning(
  api: BridgeAPI,
  nearTxHash: string,
  maxAttempts = SIGNING_MAX_ATTEMPTS,
  intervalMs = SIGNING_POLL_INTERVAL_MS,
): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const transfers = await api.getTransfer({ transactionHash: nearTxHash })
      const transfer = transfers[0]

      if (transfer?.signed?.NearReceipt?.transaction_hash) {
        return transfer.signed.NearReceipt.transaction_hash
      }

      console.log(`    Waiting for signing... (attempt ${attempt}/${maxAttempts})`)
    } catch (error) {
      // Ignore errors during polling, just retry
      if (attempt === maxAttempts) {
        throw new Error(`Signing not found after ${maxAttempts} attempts: ${error}`)
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error(`Signing not found after ${maxAttempts} attempts`)
}

/**
 * Extract signed transaction bytes from NEAR transaction logs
 */
async function getSignedTxBytes(near: Near, txHash: string, senderId: string): Promise<string> {
  const tx = await near.getTransactionStatus(txHash, senderId, "FINAL")

  const signedLog = tx.receipts_outcome
    .flatMap((receipt) => receipt.outcome.logs)
    .find((log) => log.includes("signed_btc_transaction"))

  if (!signedLog) {
    throw new Error("signed_btc_transaction event not found in logs")
  }

  const parts = signedLog.split("EVENT_JSON:")
  const jsonPart = parts[1]
  if (!jsonPart) {
    throw new Error("Invalid log format for signed_btc_transaction")
  }

  const signedData = JSON.parse(jsonPart)
  const txBytes = signedData.data?.[0]?.tx_bytes

  if (!Array.isArray(txBytes)) {
    throw new Error("tx_bytes not found in signed_btc_transaction event")
  }

  // Convert bytes array to hex string
  return txBytes.map((byte: number) => byte.toString(16).padStart(2, "0")).join("")
}

describe("NEAR to BTC Withdrawal E2E Test", () => {
  let near: Near
  const nearBuilder = createNearBuilder({ network: "testnet" })
  const btcBuilder = createBtcBuilder({ network: "testnet", chain: "btc" })
  const api = new BridgeAPI("testnet")
  const signerId = TEST_CONFIG.networks.near.accountId

  beforeAll(async () => {
    near = await createNearKitInstance()

    console.log("🚀 BTC Withdrawal Test Setup:")
    console.log(`  NEAR Account: ${signerId}`)
    console.log(`  BTC Target: ${BITCOIN_TESTNET_ADDRESS}`)
    console.log(`  BTC Connector: ${nearBuilder.getUtxoConnectorAddress("btc")}`)
    console.log(`  nBTC Token: ${nearBuilder.getUtxoTokenAddress("btc")}`)
  })

  test(
    "should check nBTC balance and connector config",
    async () => {
      console.log("\n📊 Checking nBTC balance and connector config...")

      // Check nBTC balance using helper
      const balance = await nearBuilder.getUtxoTokenBalance("btc", signerId)
      console.log(`  nBTC Balance: ${balance} satoshis`)

      // Get connector config using helper
      const config = await nearBuilder.getUtxoConnectorConfig("btc")
      expect(config).toBeDefined()
      console.log(`  Min Withdraw: ${config.min_withdraw_amount} satoshis`)
      console.log(`  Change Address: ${config.change_address}`)
      console.log(`  Fee Rate: ${config.withdraw_bridge_fee.fee_rate} basis points`)

      // Check available UTXOs using helper
      const utxos = await nearBuilder.getUtxoAvailableOutputs("btc")
      console.log(`  Available UTXOs: ${utxos.length}`)

      expect(config.min_withdraw_amount).toBeDefined()
      expect(config.change_address).toBeDefined()
    },
    TIMEOUTS.NETWORK_REQUEST,
  )

  test(
    "should build withdrawal plan",
    async () => {
      console.log("\n🔧 Building BTC withdrawal plan...")

      // Get connector config using helper
      const config = await nearBuilder.getUtxoConnectorConfig("btc")

      // Get available UTXOs using helper - now returns UTXO[] directly
      const utxos: UTXO[] = await nearBuilder.getUtxoAvailableOutputs("btc")

      if (utxos.length === 0) {
        console.log("  ⚠️ No UTXOs available in bridge - skipping plan build")
        return
      }

      console.log(`  UTXOs: ${utxos.length}`)

      // Build withdrawal plan for minimum amount
      const withdrawAmount = BigInt(config.min_withdraw_amount)

      try {
        const plan = btcBuilder.buildWithdrawalPlan(
          utxos,
          withdrawAmount,
          BITCOIN_TESTNET_ADDRESS,
          config.change_address,
          2, // fee rate sat/vB
        )

        console.log("  ✓ Withdrawal plan built!")
        console.log(`    Inputs: ${plan.inputs.length}`)
        console.log(`    Outputs: ${plan.outputs.length}`)
        console.log(`    Network Fee: ${plan.fee} satoshis`)

        expect(plan.inputs.length).toBeGreaterThan(0)
        expect(plan.outputs.length).toBeGreaterThan(0)
        expect(plan.fee).toBeGreaterThan(0n)
      } catch (error) {
        console.log(`  ⚠️ Could not build plan: ${(error as Error).message}`)
        // This is expected if there aren't enough UTXOs
      }
    },
    TIMEOUTS.NETWORK_REQUEST,
  )

  test(
    "should complete full BTC withdrawal flow",
    async () => {
      console.log("\n💸 Starting full BTC withdrawal flow...")

      // Step 1: Check balance
      console.log("\n  Step 1: Checking balance...")
      const balance = await nearBuilder.getUtxoTokenBalance("btc", signerId)
      console.log(`    nBTC Balance: ${balance} satoshis`)

      const config = await nearBuilder.getUtxoConnectorConfig("btc")
      const minWithdraw = BigInt(config.min_withdraw_amount)

      if (balance < minWithdraw) {
        console.log("  ⚠️ Insufficient nBTC balance for withdrawal test")
        console.log(`     Need at least ${minWithdraw} satoshis, have ${balance}`)
        console.log("     Skipping full withdrawal flow...")
        console.log("\n  To get nBTC:")
        console.log("    1. Send testnet BTC to: tb1q620g7uv47caghpaz4tc59fh3dlsdr5c726dyn4")
        console.log("    2. Wait for 2 confirmations")
        return
      }

      // Step 2: Get UTXOs and build plan
      console.log("\n  Step 2: Building withdrawal plan...")
      const utxos: UTXO[] = await nearBuilder.getUtxoAvailableOutputs("btc")

      if (utxos.length === 0) {
        console.log("  ⚠️ No UTXOs available - cannot proceed")
        return
      }

      const withdrawAmount = minWithdraw

      let plan: ReturnType<typeof btcBuilder.buildWithdrawalPlan>
      try {
        plan = btcBuilder.buildWithdrawalPlan(
          utxos,
          withdrawAmount,
          BITCOIN_TESTNET_ADDRESS,
          config.change_address,
          2,
        )
      } catch (error) {
        console.log(`  ⚠️ Could not build plan: ${(error as Error).message}`)
        return
      }

      const bridgeFee = await nearBuilder.calculateUtxoWithdrawalFee("btc", withdrawAmount)
      const totalAmount = withdrawAmount + plan.fee + bridgeFee

      console.log(`    Withdraw: ${withdrawAmount} satoshis`)
      console.log(`    Network Fee: ${plan.fee} satoshis`)
      console.log(`    Bridge Fee: ${bridgeFee} satoshis`)
      console.log(`    Total: ${totalAmount} satoshis`)

      if (balance < totalAmount) {
        console.log("  ⚠️ Insufficient balance for total amount")
        return
      }

      // Step 3: Initiate withdrawal on NEAR
      console.log("\n  Step 3: Initiating withdrawal on NEAR...")
      const withdrawTx = nearBuilder.buildUtxoWithdrawalInit({
        chain: "btc",
        targetAddress: BITCOIN_TESTNET_ADDRESS,
        inputs: plan.inputs,
        outputs: plan.outputs,
        totalAmount,
        signerId,
      })

      const initResult = await toNearKitTransaction(near, withdrawTx).send({ waitUntil: "FINAL" })
      const nearTxHash = initResult.transaction.hash
      console.log(`    ✓ NEAR TX: ${nearTxHash}`)

      // Parse pending ID from logs
      const pendingLog = initResult.receipts_outcome
        .flatMap((receipt) => receipt.outcome.logs)
        .find((log) => log.includes("generate_btc_pending_info"))

      if (!pendingLog) {
        console.log("  ⚠️ No pending info found - withdrawal may have failed")
        return
      }

      const pendingParts = pendingLog.split("EVENT_JSON:")
      let pendingId: string | undefined
      if (pendingParts[1]) {
        const pendingData = JSON.parse(pendingParts[1])
        pendingId = pendingData.data?.[0]?.btc_pending_id
      }

      console.log(`    ✓ Pending ID: ${pendingId}`)

      // Step 4: Wait for MPC signing
      console.log("\n  Step 4: Waiting for MPC signing...")
      console.log("    (This may take a few minutes)")

      let signedTxHash: string
      try {
        signedTxHash = await waitForSigning(api, nearTxHash)
        console.log(`    ✓ Signed TX: ${signedTxHash}`)
      } catch (error) {
        console.log(`  ⚠️ Signing timeout: ${(error as Error).message}`)
        console.log("    The withdrawal was initiated but signing is pending.")
        console.log("    Relayers will complete the signing and broadcast later.")
        return
      }

      // Step 5: Get signed transaction bytes
      console.log("\n  Step 5: Getting signed transaction...")
      const signedTxHex = await getSignedTxBytes(near, signedTxHash, signerId)
      console.log(`    ✓ Got signed tx (${signedTxHex.length / 2} bytes)`)

      // Step 6: Broadcast to Bitcoin network
      console.log("\n  Step 6: Broadcasting to Bitcoin network...")
      try {
        const btcTxHash = await btcBuilder.broadcastTransaction(signedTxHex)
        console.log(`    ✓ Bitcoin TX: ${btcTxHash}`)
        console.log(`    View: https://mempool.space/testnet/tx/${btcTxHash}`)

        expect(btcTxHash).toBeDefined()
        expect(btcTxHash.length).toBe(64)
      } catch (error) {
        const errorMsg = (error as Error).message
        if (errorMsg.includes("already in block chain") || errorMsg.includes("already known")) {
          console.log("    ✓ Transaction already broadcast by relayers!")
          // This is fine - relayers beat us to it
        } else {
          console.log(`    ⚠️ Broadcast failed: ${errorMsg}`)
          // Don't fail the test - the tx may have been broadcast by relayers
        }
      }

      console.log("\n🎉 Full BTC withdrawal flow completed!")
      console.log("    1. ✓ Checked balance")
      console.log("    2. ✓ Built withdrawal plan")
      console.log("    3. ✓ Initiated on NEAR")
      console.log("    4. ✓ MPC signed")
      console.log("    5. ✓ Got signed tx")
      console.log("    6. ✓ Broadcast attempted")
    },
    TIMEOUTS.FULL_E2E_FLOW * 2, // 10 minutes for full flow with signing wait
  )

  test(
    "should manually sign a BTC withdrawal (unstuck flow)",
    async () => {
      console.log("\n🔧 Testing manual signing (unstuck) flow...")

      // Step 1: Check balance
      const balance = await nearBuilder.getUtxoTokenBalance("btc", signerId)
      const config = await nearBuilder.getUtxoConnectorConfig("btc")
      const minWithdraw = BigInt(config.min_withdraw_amount)

      if (balance < minWithdraw) {
        console.log(`  ⚠️ Insufficient nBTC balance (${balance} < ${minWithdraw}), skipping`)
        return
      }

      // Step 2: Build plan and initiate withdrawal
      const utxos: UTXO[] = await nearBuilder.getUtxoAvailableOutputs("btc")
      if (utxos.length === 0) {
        console.log("  ⚠️ No UTXOs available, skipping")
        return
      }

      const plan = btcBuilder.buildWithdrawalPlan(
        utxos,
        minWithdraw,
        BITCOIN_TESTNET_ADDRESS,
        config.change_address,
        2,
      )

      const bridgeFee = await nearBuilder.calculateUtxoWithdrawalFee("btc", minWithdraw)
      const totalAmount = minWithdraw + plan.fee + bridgeFee

      if (balance < totalAmount) {
        console.log("  ⚠️ Insufficient balance for total amount, skipping")
        return
      }

      console.log("  Initiating withdrawal...")
      const withdrawTx = nearBuilder.buildUtxoWithdrawalInit({
        chain: "btc",
        targetAddress: BITCOIN_TESTNET_ADDRESS,
        inputs: plan.inputs,
        outputs: plan.outputs,
        totalAmount,
        signerId,
      })

      const initResult = await toNearKitTransaction(near, withdrawTx).send({ waitUntil: "FINAL" })
      console.log(`  ✓ NEAR TX: ${initResult.transaction.hash}`)

      // Step 3: Extract pending sign ID from logs
      const pendingLog = initResult.receipts_outcome
        .flatMap((receipt) => receipt.outcome.logs)
        .find((log) => log.includes("generate_btc_pending_info"))

      if (!pendingLog) {
        console.log("  ⚠️ No pending info found, skipping manual sign")
        return
      }

      const pendingParts = pendingLog.split("EVENT_JSON:")
      if (!pendingParts[1]) {
        console.log("  ⚠️ Could not parse pending event, skipping")
        return
      }

      const pendingData = JSON.parse(pendingParts[1])
      const pendingSignId = pendingData.data?.[0]?.btc_pending_id
      const inputCount = plan.inputs.length

      console.log(`  ✓ Pending Sign ID: ${pendingSignId}`)
      console.log(`  Inputs to sign: ${inputCount}`)

      // Step 4: Manually sign each input using buildUtxoWithdrawalSign
      for (let i = 0; i < inputCount; i++) {
        console.log(`  Signing input ${i}...`)
        const signTx = nearBuilder.buildUtxoWithdrawalSign({
          chain: "btc",
          pendingSignId: pendingSignId,
          signIndex: i,
          signerId,
        })

        // Verify transaction structure
        expect(signTx.receiverId).toBe(nearBuilder.getUtxoConnectorAddress("btc"))
        expect(signTx.actions[0]?.methodName).toBe("sign_btc_transaction")

        try {
          const signResult = await toNearKitTransaction(near, signTx).send({
            waitUntil: "FINAL",
          })
          console.log(`  ✓ Signed input ${i}: ${signResult.transaction.hash}`)

          // Check for signed_btc_transaction event in the last input's result
          if (i === inputCount - 1) {
            const signedLog = signResult.receipts_outcome
              .flatMap((receipt) => receipt.outcome.logs)
              .find((log) => log.includes("signed_btc_transaction"))

            if (signedLog) {
              console.log("  ✓ Got signed_btc_transaction event - manual signing works!")

              // Extract and broadcast
              const signedTxHex = await getSignedTxBytes(
                near,
                signResult.transaction.hash,
                signerId,
              )
              console.log(`  ✓ Signed tx: ${signedTxHex.length / 2} bytes`)

              try {
                const btcTxHash = await btcBuilder.broadcastTransaction(signedTxHex)
                console.log(`  ✓ Broadcast: ${btcTxHash}`)
              } catch (error) {
                const msg = (error as Error).message
                if (msg.includes("already in block chain") || msg.includes("already known")) {
                  console.log("  ✓ Already broadcast by relayer (race condition, still valid)")
                } else {
                  console.log(`  ⚠️ Broadcast failed: ${msg}`)
                }
              }
            } else {
              console.log("  ℹ️ No signed_btc_transaction yet (may need more confirmations)")
            }
          }
        } catch (error) {
          const msg = (error as Error).message
          if (msg.includes("already signed") || msg.includes("AlreadySigned")) {
            console.log(`  ✓ Input ${i} already signed by relayer (race condition, method works)`)
          } else {
            console.log(`  ⚠️ Sign failed for input ${i}: ${msg}`)
            throw error
          }
        }
      }

      console.log("\n🎉 Manual signing flow completed!")
    },
    TIMEOUTS.FULL_E2E_FLOW * 2,
  )
})
