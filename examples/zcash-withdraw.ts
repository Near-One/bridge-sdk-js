#!/usr/bin/env node

/**
 * Zcash Withdrawal Example
 *
 * Simple example showing how to withdraw Zcash from NEAR using the Omni Bridge SDK.
 *
 * Setup:
 * 1. Replace NEAR_ACCOUNT with your testnet account
 * 2. Replace ZCASH_ADDRESS with your Zcash testnet address
 * 3. Ensure you have TAZ balance and NEAR credentials in ~/.near-credentials
 *
 * Usage: bun run examples/zcash-withdraw.ts
 */

import os from "node:os"
import path from "node:path"
import { Account } from "@near-js/accounts"
import { getSignerFromKeystore } from "@near-js/client"
import { UnencryptedFileSystemKeyStore } from "@near-js/keystores-node"
import { JsonRpcProvider } from "@near-js/providers"
import { NearBridgeClient } from "../src/clients/near.js"
import { addresses, setNetwork } from "../src/config.js"
import { ChainKind } from "../src/types/chain.js"

// Configuration - Replace with your values
const NEAR_ACCOUNT = "bridge-sdk-test.testnet"
const ZCASH_ADDRESS = "tmXxJxBHuNhDD5nca3uCQwcSGgsJ7qLfvWg"
const NETWORK = "testnet" as "testnet" | "mainnet"
const ZCASH_API_KEY = process.env.ZCASH_API_KEY ?? ""

setNetwork(NETWORK)

async function main() {
  console.log("🚀 Zcash Withdrawal Example")
  console.log(`Withdrawing from ${NEAR_ACCOUNT} to ${ZCASH_ADDRESS}`)

  if (!ZCASH_API_KEY) {
    console.error("⚠️  Set ZCASH_API_KEY environment variable before running this script")
    process.exit(1)
  }

  // Initialize NEAR client
  const keyStore = new UnencryptedFileSystemKeyStore(path.join(os.homedir(), ".near-credentials"))
  const signer = await getSignerFromKeystore(NEAR_ACCOUNT, NETWORK, keyStore)
  const provider = new JsonRpcProvider({
    url: "https://rpc.testnet.near.org",
  })
  const account = new Account(NEAR_ACCOUNT, provider, signer)

  const bridgeClient = new NearBridgeClient(account, addresses.near.contract, {
    zcashApiKey: ZCASH_API_KEY,
  })

  // Get minimum withdrawal amount
  const config = await bridgeClient.getUtxoBridgeConfig(ChainKind.Zcash)
  const withdrawalAmount = BigInt(config.min_withdraw_amount)

  console.log(`Amount: ${withdrawalAmount} zatoshis`)

  const pending = await bridgeClient.initUtxoWithdrawal(ChainKind.Zcash, ZCASH_ADDRESS, withdrawalAmount)
  console.log(`Pending ID: ${pending.pendingId}`)

  const nearTxHash = await bridgeClient.signUtxoTransaction(ChainKind.Zcash, pending.pendingId, 0)
  console.log(`NEAR TX: ${nearTxHash}`)

  const zcashTxHash = await bridgeClient.finalizeUtxoWithdrawal(ChainKind.Zcash, nearTxHash)
  console.log(`Zcash TX: ${zcashTxHash}`)
}

main().catch(console.error)
