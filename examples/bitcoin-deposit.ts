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
 * 1. Ensure NEAR credentials are in ~/.near-credentials or set NEAR_PRIVATE_KEY
 * 2. For step 1: Run without TX_HASH to get deposit address
 * 3. For step 2: Set TX_HASH and VOUT after sending Bitcoin
 *
 * Usage:
 *   Step 1 (get address): bun run examples/bitcoin-deposit.ts
 *   Step 2 (finalize):    TX_HASH=abc123 VOUT=0 bun run examples/bitcoin-deposit.ts
 */

import { createBtcBuilder } from "@omni-bridge/btc"
import { ChainKind, createBridge, getAddresses, type Network } from "@omni-bridge/core"
import { createNearBuilder, toNearKitTransaction } from "@omni-bridge/near"
import { Near } from "near-kit"

// Configuration - can be overridden via environment variables
const NEAR_ACCOUNT = process.env.NEAR_ACCOUNT ?? "omni-sdk-test.testnet"
const NETWORK: Network = (process.env.NETWORK as Network) ?? "testnet"

// Step 2 configuration - set via environment variables
const TX_HASH = process.env.TX_HASH ?? ""
const VOUT = Number.parseInt(process.env.VOUT ?? "0", 10)

async function createNearInstance(): Promise<Near> {
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

async function main() {
  console.log("Bitcoin Deposit Example (New SDK)")
  console.log(`Account: ${NEAR_ACCOUNT}`)
  console.log(`Network: ${NETWORK}`)

  const bridge = createBridge({ network: NETWORK })
  const nearBuilder = createNearBuilder({ network: NETWORK })
  const addresses = getAddresses(NETWORK)

  // Get connector config
  const config = await nearBuilder.getUtxoConnectorConfig("btc")
  console.log(`\nConnector: ${addresses.btc.btcConnector}`)
  console.log(`Min deposit: ${config.min_deposit_amount} satoshis`)

  // Check current balance
  const balance = await nearBuilder.getUtxoTokenBalance("btc", NEAR_ACCOUNT)
  console.log(`Current nBTC balance: ${balance} satoshis`)

  // Step 1: Generate deposit address if no TX_HASH provided
  if (!TX_HASH) {
    console.log("\n=== Step 1: Generate deposit address ===")

    const depositResult = await bridge.getUtxoDepositAddress(ChainKind.Btc, NEAR_ACCOUNT)

    console.log(`\nSend Bitcoin to: ${depositResult.address}`)
    console.log(`Chain: ${depositResult.chain}`)
    console.log(`Recipient: ${depositResult.recipient}`)

    console.log("\n=== Next steps ===")
    console.log("1. Send testnet BTC to the address above")
    console.log("2. Wait for 2 confirmations (~20 minutes)")
    console.log("3. Run again with TX_HASH and VOUT:")
    console.log(`   TX_HASH=<your_tx_hash> VOUT=<output_index> bun run examples/bitcoin-deposit.ts`)
    return
  }

  // Step 2: Finalize deposit
  console.log("\n=== Step 2: Finalize deposit ===")
  console.log(`TX Hash: ${TX_HASH}`)
  console.log(`VOUT: ${VOUT}`)

  const btcBuilder = createBtcBuilder({ network: NETWORK, chain: "btc" })

  // Get the deposit proof
  console.log("\nFetching deposit proof from Bitcoin network...")
  let proof: Awaited<ReturnType<typeof btcBuilder.getDepositProof>>

  try {
    proof = await btcBuilder.getDepositProof(TX_HASH, VOUT)
    console.log(`✓ Proof generated for ${proof.amount} satoshis`)
    console.log(`  Block hash: ${proof.tx_block_blockhash}`)
    console.log(`  TX index: ${proof.tx_index}`)
    console.log(`  Merkle proof: ${proof.merkle_proof.length} hashes`)
  } catch (error) {
    console.error("✗ Failed to get deposit proof:")
    console.error((error as Error).message)
    console.log("\nMake sure:")
    console.log("- The transaction is confirmed (2+ confirmations)")
    console.log("- The TX_HASH and VOUT are correct")
    return
  }

  // Check minimum deposit
  if (proof.amount < BigInt(config.min_deposit_amount)) {
    console.error(
      `\n✗ Deposit amount ${proof.amount} is below minimum ${config.min_deposit_amount}`,
    )
    return
  }

  // Build the finalization transaction
  console.log("\nBuilding finalization transaction...")
  const finalizeTx = nearBuilder.buildUtxoDepositFinalization({
    chain: "btc",
    depositMsg: {
      recipient_id: NEAR_ACCOUNT,
    },
    txBytes: proof.tx_bytes,
    vout: VOUT,
    txBlockBlockhash: proof.tx_block_blockhash,
    txIndex: proof.tx_index,
    merkleProof: proof.merkle_proof,
    signerId: NEAR_ACCOUNT,
  })

  // Send the transaction
  console.log("Sending verify_deposit transaction...")
  const near = await createNearInstance()

  try {
    const result = await toNearKitTransaction(near, finalizeTx).send({ waitUntil: "FINAL" })
    console.log(`\n✓ Deposit finalized!`)
    console.log(`  TX Hash: ${result.transaction.hash}`)
    console.log(`  Explorer: https://testnet.nearblocks.io/txns/${result.transaction.hash}`)

    // Check new balance
    const newBalance = await nearBuilder.getUtxoTokenBalance("btc", NEAR_ACCOUNT)
    console.log(`\n  Previous balance: ${balance} satoshis`)
    console.log(`  New balance: ${newBalance} satoshis`)
    console.log(`  Deposited: ${newBalance - balance} satoshis`)
  } catch (error) {
    console.error("\n✗ Finalization failed:")
    console.error((error as Error).message)

    // Check if already finalized
    if ((error as Error).message.includes("already")) {
      console.log("\nThe deposit may have already been finalized by relayers.")
      const currentBalance = await nearBuilder.getUtxoTokenBalance("btc", NEAR_ACCOUNT)
      console.log(`Current balance: ${currentBalance} satoshis`)
    }
  }
}

main().catch(console.error)
