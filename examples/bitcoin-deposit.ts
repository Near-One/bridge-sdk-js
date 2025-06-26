#!/usr/bin/env node

/**
 * Bitcoin Deposit Example
 *
 * Two-step process to deposit Bitcoin and receive nBTC on NEAR:
 * 1. Generate deposit address → Send Bitcoin to it
 * 2. Finalize deposit after Bitcoin confirmation
 *
 * Setup:
 * 1. Replace NEAR_ACCOUNT with your testnet account
 * 2. Replace TX_HASH and VOUT with your Bitcoin transaction details
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

// Step 2 configuration - Add these after sending Bitcoin
const TX_HASH = "1f33f2668594bc29b1b4c3594b141a76f538429e0d2f1406cf135ba711d062d1" // Your Bitcoin transaction hash
const VOUT = 1 // Output index (usually 0 or 1)

setNetwork(NETWORK)

async function main() {
  console.log("🚀 Bitcoin Deposit Example")

  // Initialize NEAR client
  const keyStore = new UnencryptedFileSystemKeyStore(path.join(os.homedir(), ".near-credentials"))
  const signer = await getSignerFromKeystore(NEAR_ACCOUNT, NETWORK, keyStore)
  const provider = new JsonRpcProvider({
    url: "https://rpc.testnet.near.org",
  })
  const account = new Account(NEAR_ACCOUNT, provider, signer)

  const bridgeClient = new NearBridgeClient(account, "omni.n-bridge.testnet")

  // Get minimum deposit amount
  const config = await bridgeClient.getBitcoinBridgeConfig()
  console.log(`Minimum deposit: ${config.min_deposit_amount} satoshis`)

  // Step 1: Generate Bitcoin deposit address
  console.log("\n📍 Step 1: Generate deposit address")
  const depositResult = await bridgeClient.getBitcoinDepositAddress(NEAR_ACCOUNT)

  console.log(`✅ Send Bitcoin to: ${depositResult.depositAddress}`)

  // Check if user has provided transaction details
  if (!TX_HASH) {
    console.log("\n📋 Next steps:")
    console.log("1. Send Bitcoin to the address above")
    console.log("2. Wait for Bitcoin network confirmation")
    console.log("3. Update TX_HASH and VOUT in this script")
    console.log("4. Run script again")
    return
  }

  // Step 2: Finalize deposit (after sending Bitcoin)
  console.log("\n📍 Step 2: Finalize deposit")
  console.log(`Using TX: ${TX_HASH}`)

  try {
    const nearTxHash = await bridgeClient.finalizeBitcoinDeposit(
      TX_HASH,
      VOUT,
      depositResult.btcDepositArgs,
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
