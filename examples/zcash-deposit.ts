#!/usr/bin/env node

/**
 * Zcash Deposit Example (New Package Structure)
 *
 * Two-step process to deposit Zcash and receive nZEC on NEAR:
 * 1. Generate deposit address using the Bridge API
 * 2. Send Zcash → Finalize deposit after confirmation
 *
 * This example demonstrates the new @omni-bridge packages architecture.
 *
 * Setup:
 * 1. Replace NEAR_ACCOUNT with your testnet account
 * 2. Replace TX_HASH and VOUT with your Zcash transaction details
 * 3. Set ZCASH_API_KEY environment variable
 *
 * Usage: ZCASH_API_KEY=your_key bun run examples/zcash-deposit.ts
 */

import { Near } from "near-kit"
import {
  ChainKind,
  createBridge,
  getAddresses,
  type Network,
} from "@omni-bridge/core"
import { createBtcBuilder } from "@omni-bridge/btc"

// Configuration - Replace with your values
const NEAR_ACCOUNT = "bridge-sdk-test.testnet"
const NETWORK: Network = "testnet"
const ZCASH_API_KEY = process.env.ZCASH_API_KEY ?? ""

// Step 2 configuration - Add these after sending Zcash
const TX_HASH = "" // Your Zcash transaction hash (leave empty for step 1 only)
const VOUT = 0 // Output index (usually 0 or 1)

async function main() {
  console.log("Zcash Deposit Example (New SDK)")

  if (!ZCASH_API_KEY) {
    console.error("Set ZCASH_API_KEY environment variable before running")
    process.exit(1)
  }

  // Initialize the Bridge for API access
  const bridge = createBridge({ network: NETWORK })
  const addresses = getAddresses(NETWORK)

  // Initialize near-kit for NEAR interactions
  const near = new Near({ network: NETWORK })

  // Get connector config to check minimum deposit
  const connectorConfig = await near.view<{
    min_deposit_amount: string
    deposit_bridge_fee: { fee_min: string }
  }>(addresses.zcash.zcashConnector, "get_config", {})

  if (connectorConfig) {
    const minDeposit =
      BigInt(connectorConfig.min_deposit_amount) +
      BigInt(connectorConfig.deposit_bridge_fee.fee_min)
    console.log(`Minimum deposit: ${minDeposit} zatoshis`)
  }

  // Step 1: Generate Zcash deposit address using the new Bridge API
  console.log("\nStep 1: Generate deposit address")

  const depositResult = await bridge.getUtxoDepositAddress(
    ChainKind.Zcash,
    NEAR_ACCOUNT,
  )

  console.log(`Send Zcash to: ${depositResult.address}`)
  console.log(`Chain: ${depositResult.chain}`)
  console.log(`Recipient: ${depositResult.recipient}`)

  // Check if user has provided transaction details
  if (!TX_HASH) {
    console.log("\nNext steps:")
    console.log("1. Send Zcash to the address above")
    console.log("2. Wait for Zcash network confirmation")
    console.log("3. Update TX_HASH and VOUT in this script")
    console.log("4. Run script again to finalize")
    return
  }

  // Step 2: Get deposit proof and finalize on NEAR
  console.log("\nStep 2: Finalize deposit")
  console.log(`Using TX: ${TX_HASH}`)

  // Create Zcash builder for proof generation
  // Note: Zcash uses the same builder with chain: "zcash" config
  const zcashBuilder = createBtcBuilder({
    network: NETWORK,
    chain: "zcash",
    rpcHeaders: { "x-api-key": ZCASH_API_KEY },
  })

  try {
    // Get the deposit proof from the Zcash blockchain
    const proof = await zcashBuilder.getDepositProof(TX_HASH, VOUT)
    console.log(`Proof generated for ${proof.amount} zatoshis`)

    console.log("\nDeposit proof ready!")
    console.log("To finalize, call verify_deposit on the Zcash connector contract")
    console.log(`Contract: ${addresses.zcash.zcashConnector}`)
  } catch (error) {
    console.log("Proof generation failed:")
    console.log((error as Error).message)
    console.log("\nMake sure the transaction is confirmed on the Zcash network")
  }
}

main().catch(console.error)
