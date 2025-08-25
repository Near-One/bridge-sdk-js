#!/usr/bin/env node

/**
 * Bitcoin Withdrawal Example
 *
 * Simple example showing how to withdraw Zcash from NEAR using the Omni Bridge SDK.
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
const ZCASH_ADDRESS = "tmXxJxBHuNhDD5nca3uCQwcSGgsJ7qLfvWg"
const NETWORK = "testnet" as "testnet" | "mainnet"

setNetwork(NETWORK)

async function main() {
  console.log("🚀 Zcash Withdrawal Example")
  console.log(`Withdrawing from ${NEAR_ACCOUNT} to ${ZCASH_ADDRESS}`)

  // Initialize NEAR client
  const keyStore = new UnencryptedFileSystemKeyStore(path.join(os.homedir(), ".near-credentials"))
  const signer = await getSignerFromKeystore(NEAR_ACCOUNT, NETWORK, keyStore)
  const provider = new JsonRpcProvider({
    url: "https://rpc.testnet.near.org",
  })
  const account = new Account(NEAR_ACCOUNT, provider, signer)

  const bridgeClient = new NearBridgeClient(account, "omni.n-bridge.testnet")

  // Get minimum withdrawal amount
  const config = await bridgeClient.getZcashBridgeConfig()
  const withdrawalAmount = BigInt(config.min_withdraw_amount)

  console.log(`Amount: ${withdrawalAmount} zatoshis`)

  const pendingId = await bridgeClient.initZcashWithdrawal(ZCASH_ADDRESS, withdrawalAmount)
  console.log(`Pending ID: ${pendingId}`)

  const nearTxHash = await bridgeClient.signZcashTransaction(pendingId)
  console.log(`NEAR TX: ${nearTxHash}`)

  const zcashTxHash = await bridgeClient.finalizeZcashWithdrawal(nearTxHash)
  console.log(`Zcash TX: ${zcashTxHash}`)
}

main().catch(console.error)
