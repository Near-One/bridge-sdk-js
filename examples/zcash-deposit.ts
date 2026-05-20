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
 * 1. Ensure NEAR credentials are in ~/.near-credentials or set NEAR_PRIVATE_KEY
 * 2. For step 1: Run without TX_HASH to get a deposit address
 * 3. For step 2: Set TX_HASH and VOUT after sending Zcash
 * 4. Set ZCASH_RPC_URL to a Zcash JSON-RPC endpoint. If your provider's auth
 *    fits in the URL path or query string, just include it there. For HTTP
 *    Basic or header-based auth, pass `rpcHeaders` to `createBtcBuilder`
 *    directly instead of using this env var.
 *
 * Usage:
 *   Step 1 (get address): ZCASH_RPC_URL=https://... bun run examples/zcash-deposit.ts
 *   Step 2 (finalize):    ZCASH_RPC_URL=https://... TX_HASH=abc123 VOUT=0 bun run examples/zcash-deposit.ts
 */

import { createBtcBuilder } from "@omni-bridge/btc"
import { ChainKind, createBridge, getAddresses, type Network } from "@omni-bridge/core"
import { createNearBuilder, toNearKitTransaction } from "@omni-bridge/near"
import { Near } from "near-kit"

// Configuration - can be overridden via environment variables
const NEAR_ACCOUNT = process.env.NEAR_ACCOUNT ?? "omni-sdk-test.testnet"
const NETWORK: Network = (process.env.NETWORK as Network) ?? "testnet"
const ZCASH_RPC_URL = process.env.ZCASH_RPC_URL ?? ""

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
  console.log("Zcash Deposit Example (New SDK)")
  console.log(`Account: ${NEAR_ACCOUNT}`)
  console.log(`Network: ${NETWORK}`)

  const bridge = createBridge({ network: NETWORK })
  const nearBuilder = createNearBuilder({ network: NETWORK })
  const addresses = getAddresses(NETWORK)

  // Get connector config
  const config = await nearBuilder.getUtxoConnectorConfig("zcash")
  console.log(`\nConnector: ${addresses.zcash.zcashConnector}`)
  console.log(`Min deposit: ${config.min_deposit_amount} zatoshis`)

  // Check current balance
  const balance = await nearBuilder.getUtxoTokenBalance("zcash", NEAR_ACCOUNT)
  console.log(`Current nZEC balance: ${balance} zatoshis`)

  // Step 1: Generate deposit address if no TX_HASH provided
  if (!TX_HASH) {
    console.log("\n=== Step 1: Generate deposit address ===")

    const depositResult = await bridge.getUtxoDepositAddress(ChainKind.Zcash, NEAR_ACCOUNT)

    console.log(`\nSend Zcash to: ${depositResult.address}`)
    console.log(`Chain: ${depositResult.chain}`)
    console.log(`Recipient: ${depositResult.recipient}`)

    console.log("\n=== Next steps ===")
    console.log("1. Send Zcash to the address above")
    console.log("2. Wait for Zcash network confirmation")
    console.log("3. Run again with TX_HASH and VOUT:")
    console.log(
      "   ZCASH_RPC_URL=<url> TX_HASH=<hash> VOUT=<index> bun run examples/zcash-deposit.ts",
    )
    return
  }

  // Step 2: Finalize deposit
  console.log("\n=== Step 2: Finalize deposit ===")
  console.log(`TX Hash: ${TX_HASH}`)
  console.log(`VOUT: ${VOUT}`)

  // Zcash RPC is only needed for proof generation in step 2.
  if (!ZCASH_RPC_URL) {
    console.error("Set ZCASH_RPC_URL environment variable before finalizing")
    process.exit(1)
  }

  const zcashBuilder = createBtcBuilder({
    network: NETWORK,
    chain: "zcash",
    rpcUrl: ZCASH_RPC_URL,
  })

  // Get the deposit proof
  console.log("\nFetching deposit proof from Zcash network...")
  let proof: Awaited<ReturnType<typeof zcashBuilder.getDepositProof>>

  try {
    proof = await zcashBuilder.getDepositProof(TX_HASH, VOUT)
    console.log(`✓ Proof generated for ${proof.amount} zatoshis`)
    console.log(`  Block hash: ${proof.tx_block_blockhash}`)
    console.log(`  TX index: ${proof.tx_index}`)
    console.log(`  Merkle proof: ${proof.merkle_proof.length} hashes`)
  } catch (error) {
    console.error("✗ Failed to get deposit proof:")
    console.error((error as Error).message)
    console.log("\nMake sure:")
    console.log("- The transaction is confirmed on the Zcash network")
    console.log("- The TX_HASH and VOUT are correct")
    console.log("- ZCASH_RPC_URL is reachable and accepts JSON-RPC")
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
    chain: "zcash",
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
    const explorerHost = NETWORK === "mainnet" ? "nearblocks.io" : "testnet.nearblocks.io"
    console.log("\n✓ Deposit finalized!")
    console.log(`  TX Hash: ${result.transaction.hash}`)
    console.log(`  Explorer: https://${explorerHost}/txns/${result.transaction.hash}`)

    const newBalance = await nearBuilder.getUtxoTokenBalance("zcash", NEAR_ACCOUNT)
    console.log(`\n  Previous balance: ${balance} zatoshis`)
    console.log(`  New balance: ${newBalance} zatoshis`)
    console.log(`  Deposited: ${newBalance - balance} zatoshis`)
  } catch (error) {
    console.error("\n✗ Finalization failed:")
    console.error((error as Error).message)

    if ((error as Error).message.includes("already")) {
      console.log("\nThe deposit may have already been finalized by relayers.")
      const currentBalance = await nearBuilder.getUtxoTokenBalance("zcash", NEAR_ACCOUNT)
      console.log(`Current balance: ${currentBalance} zatoshis`)
    }
  }
}

main().catch(console.error)
