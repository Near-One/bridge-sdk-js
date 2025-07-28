#!/usr/bin/env node

/**
 * Zcash Deposit Example
 *
 * Two-step process to deposit Zcash and receive nZEC on NEAR:
 * 1. Generate deposit address → Send Zcash to it
 * 2. Finalize deposit after Zcash confirmation
 *
 * Setup:
 * 1. Replace NEAR_ACCOUNT with your testnet account
 * 2. Replace TX_HASH and VOUT with your Zcash transaction details
 * 3. Ensure NEAR credentials are in ~/.near-credentials
 *
 * Usage: bun run examples/bitcoin-deposit.ts
 */

import os from "node:os"
import path from "node:path"
import { Account } from "@near-js/accounts"
import { getSignerFromKeystore } from "@near-js/client"
import { UnencryptedFileSystemKeyStore } from "@near-js/keystores-node"
import { JsonRpcProvider } from "@near-js/providers"
import { NearBridgeClient } from "../src/clients/near.js"
import { setNetwork } from "../src/config.js"

// Configuration - Replace with your values
const NEAR_ACCOUNT = "bridge-sdk-test.testnet"
const NETWORK = "testnet" as "testnet" | "mainnet"

// Step 2 configuration - Add these after sending Zcash
const TX_HASH = "31001efb16541644cc20cab19420087d7a70afcfc401a74f57c192e04922c94d" // Your Zcash transaction hash
const VOUT = 0 // Output index (usually 0 or 1)

setNetwork(NETWORK)

async function main() {
  console.log("🚀 Zcash Deposit Example")

  // Initialize NEAR client
  const keyStore = new UnencryptedFileSystemKeyStore(path.join(os.homedir(), ".near-credentials"))
  const signer = await getSignerFromKeystore(NEAR_ACCOUNT, NETWORK, keyStore)
  const provider = new JsonRpcProvider({
    url: "https://rpc.testnet.near.org",
  })
  const account = new Account(NEAR_ACCOUNT, provider, signer)

  const bridgeClient = new NearBridgeClient(account, "omni.n-bridge.testnet")

  // Get minimum deposit amount
  const config = await bridgeClient.getZcashBridgeConfig()
  console.log(`Minimum deposit: ${config.min_deposit_amount} satoshis`)

  // Step 1: Generate Zcash deposit address
  console.log("\n📍 Step 1: Generate deposit address")
  const depositResult = await bridgeClient.getZcashDepositAddress(NEAR_ACCOUNT)

  console.log(`✅ Send Zcash to: ${depositResult.depositAddress}`)

  // Check if user has provided transaction details
  if (!TX_HASH) {
    console.log("\n📋 Next steps:")
    console.log("1. Send Zcash to the address above")
    console.log("2. Wait for Zcash network confirmation")
    console.log("3. Update TX_HASH and VOUT in this script")
    console.log("4. Run script again")
    return
  }

  // Step 2: Finalize deposit (after sending Zcash)
  console.log("\n📍 Step 2: Finalize deposit")
  console.log(`Using TX: ${TX_HASH}`)

  try {
    const nearTxHash = await bridgeClient.finalizeZcashDeposit(
      TX_HASH,
      VOUT,
      depositResult.zcashDepositArgs,
    )

    console.log("✅ Deposit complete!")
    console.log(`NEAR TX: ${nearTxHash}`)
    console.log(`Explorer: https://testnet.nearblocks.io/txns/${nearTxHash}`)
  } catch (error) {
    console.log("❌ Finalization failed:")
    console.log((error as Error).message)
    console.log("\nDouble-check your TX_HASH and VOUT values")
  }
}

main().catch(console.error)
