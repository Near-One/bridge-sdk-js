#!/usr/bin/env node

/**
 * Bitcoin Withdrawal Example
 *
 * Simple example showing how to withdraw Bitcoin from NEAR using the Omni Bridge SDK.
 *
 * Setup:
 * 1. Replace NEAR_ACCOUNT with your testnet account
 * 2. Replace BITCOIN_ADDRESS with your Bitcoin testnet address
 * 3. Ensure you have nBTC balance and NEAR credentials in ~/.near-credentials
 *
 * Usage: bun run examples/bitcoin-withdraw.ts
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
const BITCOIN_ADDRESS = "tb1q7jn2426dwpsf3xlasazzjuwcvayjn6fhlm2vjp"
const NETWORK = "testnet" as "testnet" | "mainnet"

setNetwork(NETWORK)

async function main() {
  console.log("🚀 Bitcoin Withdrawal Example")
  console.log(`Withdrawing from ${NEAR_ACCOUNT} to ${BITCOIN_ADDRESS}`)

  // Initialize NEAR client
  const keyStore = new UnencryptedFileSystemKeyStore(path.join(os.homedir(), ".near-credentials"))
  const signer = await getSignerFromKeystore(NEAR_ACCOUNT, NETWORK, keyStore)
  const provider = new JsonRpcProvider({
    url: "https://rpc.testnet.near.org",
  })
  const account = new Account(NEAR_ACCOUNT, provider, signer)

  const bridgeClient = new NearBridgeClient(account, "omni.n-bridge.testnet")

  // Get minimum withdrawal amount
  const config = await bridgeClient.getBitcoinBridgeConfig()
  const withdrawalAmount = BigInt(config.min_withdraw_amount)

  console.log(`Amount: ${withdrawalAmount} satoshis`)

  try {
    // Method 1: Automated (recommended)
    console.log("\n⏳ Starting automated withdrawal...")

    const bitcoinTxHash = await bridgeClient.executeBitcoinWithdrawal(
      BITCOIN_ADDRESS,
      withdrawalAmount,
    )

    console.log("✅ Success!")
    console.log(`Bitcoin TX: ${bitcoinTxHash}`)
    console.log(`Explorer: https://blockstream.info/testnet/tx/${bitcoinTxHash}`)
  } catch (_error) {
    console.log("❌ Automated method failed, trying manual...")

    // Method 2: Manual steps
    const pendingId = await bridgeClient.initBitcoinWithdrawal(BITCOIN_ADDRESS, withdrawalAmount)
    console.log(`Pending ID: ${pendingId}`)

    console.log("⏳ Waiting for MPC signing...")
    const nearTxHash = await bridgeClient.waitForBitcoinTransactionSigning(pendingId)

    console.log("⏳ Broadcasting to Bitcoin network...")
    const bitcoinTxHash = await bridgeClient.finalizeBitcoinWithdrawal(nearTxHash)

    console.log("✅ Manual method succeeded!")
    console.log(`Bitcoin TX: ${bitcoinTxHash}`)
    console.log(`Explorer: https://blockstream.info/testnet/tx/${bitcoinTxHash}`)
  }
}

main().catch(console.error)
