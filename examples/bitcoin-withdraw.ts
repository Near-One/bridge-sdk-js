#!/usr/bin/env node

/**
 * Bitcoin Withdrawal Example (New Package Structure)
 *
 * Complete flow to withdraw Bitcoin from NEAR using the new @omni-bridge packages:
 * 1. Check nBTC balance and connector config
 * 2. Build withdrawal plan (select UTXOs, calculate fees)
 * 3. Initiate withdrawal on NEAR (ft_transfer_call)
 * 4. Wait for MPC signing
 * 5. Get signed transaction from NEAR logs
 * 6. Broadcast to Bitcoin network
 *
 * Setup:
 * 1. Ensure NEAR credentials are in ~/.near-credentials or set NEAR_PRIVATE_KEY
 * 2. Have nBTC balance (deposit BTC first using bitcoin-deposit.ts)
 *
 * Usage:
 *   # Withdraw minimum amount
 *   bun run examples/bitcoin-withdraw.ts
 *
 *   # Withdraw specific amount (satoshis)
 *   AMOUNT=10000 bun run examples/bitcoin-withdraw.ts
 *
 *   # Specify target Bitcoin address
 *   BTC_ADDRESS=tb1q... bun run examples/bitcoin-withdraw.ts
 */

import { createBtcBuilder } from "@omni-bridge/btc"
import { BridgeAPI, type Network, type UTXO } from "@omni-bridge/core"
import { createNearBuilder, toNearKitTransaction } from "@omni-bridge/near"
import type { Near } from "near-kit"

// Configuration - can be overridden via environment variables
const NEAR_ACCOUNT = process.env.NEAR_ACCOUNT ?? "omni-sdk-test.testnet"
const NETWORK: Network = (process.env.NETWORK as Network) ?? "testnet"
const BTC_ADDRESS = process.env.BTC_ADDRESS ?? "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"
const AMOUNT = process.env.AMOUNT ? BigInt(process.env.AMOUNT) : undefined // undefined = minimum

// MPC signing polling configuration
const SIGNING_POLL_INTERVAL_MS = 5000
const SIGNING_MAX_ATTEMPTS = 60 // 5 minutes max

async function createNearInstance(): Promise<Near> {
  const { Near } = await import("near-kit")
  const privateKey = process.env.NEAR_PRIVATE_KEY

  if (privateKey) {
    return new Near({
      network: NETWORK,
      privateKey: privateKey as `ed25519:${string}`,
      defaultSignerId: NEAR_ACCOUNT,
    })
  }

  // Use FileKeyStore for local development
  const { FileKeyStore } = await import("near-kit/keys/file")
  const os = await import("node:os")
  const path = await import("node:path")

  return new Near({
    network: NETWORK,
    keyStore: new FileKeyStore(path.join(os.homedir(), ".near-credentials"), NETWORK),
    defaultSignerId: NEAR_ACCOUNT,
  })
}

/**
 * Wait for MPC signing by polling the bridge API
 */
async function waitForSigning(api: BridgeAPI, nearTxHash: string): Promise<string> {
  for (let attempt = 1; attempt <= SIGNING_MAX_ATTEMPTS; attempt++) {
    try {
      const transfers = await api.getTransfer({ transactionHash: nearTxHash })
      const transfer = transfers[0]

      if (transfer?.signed?.NearReceipt?.transaction_hash) {
        return transfer.signed.NearReceipt.transaction_hash
      }

      console.log(`  Waiting for MPC signing... (attempt ${attempt}/${SIGNING_MAX_ATTEMPTS})`)
    } catch {
      // Ignore errors during polling, just retry
    }

    await new Promise((resolve) => setTimeout(resolve, SIGNING_POLL_INTERVAL_MS))
  }

  throw new Error(`Signing not found after ${SIGNING_MAX_ATTEMPTS} attempts`)
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

async function main() {
  console.log("Bitcoin Withdrawal Example (New SDK)")
  console.log(`Account: ${NEAR_ACCOUNT}`)
  console.log(`Network: ${NETWORK}`)
  console.log(`Target BTC Address: ${BTC_ADDRESS}`)

  const nearBuilder = createNearBuilder({ network: NETWORK })
  const btcBuilder = createBtcBuilder({ network: NETWORK, chain: "btc" })
  const api = new BridgeAPI(NETWORK)

  // Step 1: Check balance and config
  console.log("\n=== Step 1: Check balance and config ===")

  const balance = await nearBuilder.getUtxoTokenBalance("btc", NEAR_ACCOUNT)
  console.log(`nBTC Balance: ${balance} satoshis`)

  const config = await nearBuilder.getUtxoConnectorConfig("btc")
  console.log(`Min Withdraw: ${config.min_withdraw_amount} satoshis`)
  console.log(`Change Address: ${config.change_address}`)
  console.log(`Bridge Fee Rate: ${config.withdraw_bridge_fee.fee_rate} basis points`)

  const minWithdraw = BigInt(config.min_withdraw_amount)
  const withdrawAmount = AMOUNT ?? minWithdraw

  if (withdrawAmount < minWithdraw) {
    console.error(`\n✗ Amount ${withdrawAmount} is below minimum ${minWithdraw}`)
    return
  }

  if (balance < withdrawAmount) {
    console.error(`\n✗ Insufficient balance: have ${balance}, need at least ${withdrawAmount}`)
    console.log("\nTo get nBTC, run bitcoin-deposit.ts first")
    return
  }

  // Step 2: Build withdrawal plan
  console.log("\n=== Step 2: Build withdrawal plan ===")

  const utxos: UTXO[] = await nearBuilder.getUtxoAvailableOutputs("btc")
  console.log(`Available UTXOs: ${utxos.length}`)

  if (utxos.length === 0) {
    console.error("\n✗ No UTXOs available in bridge - try again later")
    return
  }

  let plan: ReturnType<typeof btcBuilder.buildWithdrawalPlan>
  try {
    plan = btcBuilder.buildWithdrawalPlan(
      utxos,
      withdrawAmount,
      BTC_ADDRESS,
      config.change_address,
      2, // fee rate sat/vB
    )
  } catch (error) {
    console.error(`\n✗ Failed to build withdrawal plan: ${(error as Error).message}`)
    return
  }

  const bridgeFee = await nearBuilder.calculateUtxoWithdrawalFee("btc", withdrawAmount)
  const totalAmount = withdrawAmount + plan.fee + bridgeFee

  console.log(`Withdraw Amount: ${withdrawAmount} satoshis`)
  console.log(`Network Fee: ${plan.fee} satoshis`)
  console.log(`Bridge Fee: ${bridgeFee} satoshis`)
  console.log(`Total Required: ${totalAmount} satoshis`)
  console.log(`Plan Inputs: ${plan.inputs.length}`)
  console.log(`Plan Outputs: ${plan.outputs.length}`)

  if (balance < totalAmount) {
    console.error(`\n✗ Insufficient balance for total: have ${balance}, need ${totalAmount}`)
    return
  }

  // Step 3: Initiate withdrawal on NEAR
  console.log("\n=== Step 3: Initiate withdrawal on NEAR ===")

  const near = await createNearInstance()

  const withdrawTx = nearBuilder.buildUtxoWithdrawalInit({
    chain: "btc",
    targetAddress: BTC_ADDRESS,
    inputs: plan.inputs,
    outputs: plan.outputs,
    totalAmount,
    signerId: NEAR_ACCOUNT,
  })

  console.log("Sending ft_transfer_call transaction...")

  let nearTxHash: string
  let pendingId: string | undefined

  try {
    const result = await toNearKitTransaction(near, withdrawTx).send({ waitUntil: "FINAL" })
    nearTxHash = result.transaction.hash
    console.log(`✓ NEAR TX: ${nearTxHash}`)
    console.log(`  Explorer: https://testnet.nearblocks.io/txns/${nearTxHash}`)

    // Parse pending ID from logs
    const pendingLog = result.receipts_outcome
      .flatMap((receipt) => receipt.outcome.logs)
      .find((log) => log.includes("generate_btc_pending_info"))

    if (pendingLog) {
      const pendingParts = pendingLog.split("EVENT_JSON:")
      if (pendingParts[1]) {
        const pendingData = JSON.parse(pendingParts[1])
        pendingId = pendingData.data?.[0]?.btc_pending_id
        console.log(`✓ Pending ID: ${pendingId}`)
      }
    }
  } catch (error) {
    console.error(`\n✗ Failed to initiate withdrawal: ${(error as Error).message}`)
    return
  }

  // Step 4: Wait for MPC signing
  console.log("\n=== Step 4: Wait for MPC signing ===")
  console.log("(This may take a few minutes...)")

  let signedTxHash: string
  try {
    signedTxHash = await waitForSigning(api, nearTxHash)
    console.log(`✓ Signed TX: ${signedTxHash}`)
  } catch (error) {
    console.error(`\n✗ Signing timeout: ${(error as Error).message}`)
    console.log("\nThe withdrawal was initiated but signing is still pending.")
    console.log("Relayers will complete the signing and broadcast later.")
    console.log(`Track progress at: https://testnet.nearblocks.io/txns/${nearTxHash}`)
    return
  }

  // Step 5: Get signed transaction bytes
  console.log("\n=== Step 5: Get signed transaction ===")

  let signedTxHex: string
  try {
    signedTxHex = await getSignedTxBytes(near, signedTxHash, NEAR_ACCOUNT)
    console.log(`✓ Got signed transaction (${signedTxHex.length / 2} bytes)`)
  } catch (error) {
    console.error(`\n✗ Failed to get signed tx: ${(error as Error).message}`)
    return
  }

  // Step 6: Broadcast to Bitcoin network
  console.log("\n=== Step 6: Broadcast to Bitcoin ===")

  try {
    const btcTxHash = await btcBuilder.broadcastTransaction(signedTxHex)
    console.log(`✓ Bitcoin TX: ${btcTxHash}`)
    console.log(`  View: https://mempool.space/testnet/tx/${btcTxHash}`)
  } catch (error) {
    const errorMsg = (error as Error).message
    if (errorMsg.includes("already in block chain") || errorMsg.includes("already known")) {
      console.log("✓ Transaction already broadcast by relayers!")
      console.log(`  Pending ID was: ${pendingId}`)
    } else {
      console.error(`\n✗ Broadcast failed: ${errorMsg}`)
      console.log("The transaction may have been broadcast by relayers already.")
    }
  }

  console.log("\n=== Withdrawal Complete ===")
  console.log("✓ Step 1: Checked balance")
  console.log("✓ Step 2: Built withdrawal plan")
  console.log("✓ Step 3: Initiated on NEAR")
  console.log("✓ Step 4: MPC signed")
  console.log("✓ Step 5: Got signed tx")
  console.log("✓ Step 6: Broadcast attempted")

  // Check new balance
  const newBalance = await nearBuilder.getUtxoTokenBalance("btc", NEAR_ACCOUNT)
  console.log(`\nPrevious balance: ${balance} satoshis`)
  console.log(`New balance: ${newBalance} satoshis`)
  console.log(`Withdrawn: ${balance - newBalance} satoshis`)
}

main().catch(console.error)
