#!/usr/bin/env node

/**
 * Bitcoin Deposit Example (New Package Structure)
 *
 * Two-step process to deposit Bitcoin and receive nBTC on NEAR:
 * 1. Generate deposit address using the Bridge API
 * 2. Send Bitcoin → Finalize deposit after confirmation
 *
 * This example demonstrates the new @omni-bridge packages architecture.
 *
 * Setup:
 * 1. Replace NEAR_ACCOUNT with your testnet account
 * 2. Replace TX_HASH and VOUT with your Bitcoin transaction details
 * 3. Ensure NEAR credentials are in ~/.near-credentials
 *
 * Usage: bun run examples/bitcoin-deposit.ts
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

// Step 2 configuration - Add these after sending Bitcoin
const TX_HASH = "" // Your Bitcoin transaction hash (leave empty for step 1 only)
const VOUT = 0 // Output index (usually 0 or 1)

async function main() {
  console.log("Bitcoin Deposit Example (New SDK)")

  // Initialize the Bridge for API access
  const bridge = createBridge({ network: NETWORK })
  const addresses = getAddresses(NETWORK)

  // Initialize near-kit for NEAR interactions
  const near = new Near({ network: NETWORK })

  // Get connector config to check minimum deposit
  const connectorConfig = await near.view<{ min_deposit_amount: string }>(
    addresses.btc.btcConnector,
    "get_config",
    {},
  )
  if (connectorConfig) {
    console.log(`Minimum deposit: ${connectorConfig.min_deposit_amount} satoshis`)
  }

  // Step 1: Generate Bitcoin deposit address using the new Bridge API
  console.log("\nStep 1: Generate deposit address")

  const depositResult = await bridge.getUtxoDepositAddress(
    ChainKind.Btc,
    NEAR_ACCOUNT,
  )

  console.log(`Send Bitcoin to: ${depositResult.address}`)
  console.log(`Chain: ${depositResult.chain}`)
  console.log(`Recipient: ${depositResult.recipient}`)

  // Check if user has provided transaction details
  if (!TX_HASH) {
    console.log("\nNext steps:")
    console.log("1. Send Bitcoin to the address above")
    console.log("2. Wait for Bitcoin network confirmation (1-2 blocks)")
    console.log("3. Update TX_HASH and VOUT in this script")
    console.log("4. Run script again to finalize")
    return
  }

  // Step 2: Get deposit proof and finalize on NEAR
  console.log("\nStep 2: Finalize deposit")
  console.log(`Using TX: ${TX_HASH}`)

  // Create BTC builder for proof generation
  const btcBuilder = createBtcBuilder({ network: NETWORK })

  try {
    // Get the deposit proof from the Bitcoin blockchain
    const proof = await btcBuilder.getDepositProof(TX_HASH, VOUT)
    console.log(`Proof generated for ${proof.amount} satoshis`)

    // Build the finalization transaction for NEAR
    // Note: Finalization requires calling verify_deposit on the btcConnector contract
    // This would need near-kit with credentials to sign and send:
    //
    // const nearWithCredentials = new Near({
    //   network: NETWORK,
    //   privateKey: "ed25519:...",
    // })
    //
    // await nearWithCredentials
    //   .transaction(NEAR_ACCOUNT)
    //   .functionCall(addresses.btc.btcConnector, "verify_deposit", {
    //     deposit_msg: { recipient_id: NEAR_ACCOUNT },
    //     tx_bytes: proof.tx_bytes,
    //     vout: VOUT,
    //     tx_block_blockhash: proof.tx_block_blockhash,
    //     tx_index: proof.tx_index,
    //     merkle_proof: proof.merkle_proof,
    //   }, { gas: "300 Tgas" })
    //   .send()

    console.log("\nDeposit proof ready!")
    console.log("To finalize, call verify_deposit on the BTC connector contract")
    console.log(`Contract: ${addresses.btc.btcConnector}`)
  } catch (error) {
    console.log("Proof generation failed:")
    console.log((error as Error).message)
    console.log("\nMake sure the transaction is confirmed on the Bitcoin network")
  }
}

main().catch(console.error)
