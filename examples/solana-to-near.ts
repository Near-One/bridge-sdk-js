#!/usr/bin/env node

/**
 * Solana to NEAR Transfer Example
 *
 * Complete flow to bridge USDC from Solana to NEAR Protocol.
 * Demonstrates the Solana builder with @solana/web3.js.
 *
 * Setup:
 * 1. Set SOLANA_PRIVATE_KEY environment variable (base58 encoded)
 * 2. Ensure you have USDC and SOL for fees on Solana
 *
 * Usage:
 *   RECIPIENT=alice.near bun run examples/solana-to-near.ts
 */

import { createBridge, BridgeAPI, ChainKind, type Network } from "@omni-bridge/core"
import { createSolanaBuilder } from "@omni-bridge/solana"
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js"
import bs58 from "bs58"

// Configuration
const NETWORK: Network = (process.env.NETWORK as Network) ?? "mainnet"
const RECIPIENT = process.env.RECIPIENT ?? "alice.near"
const AMOUNT = process.env.AMOUNT ?? "1000000" // 1 USDC (6 decimals)

// USDC on Solana mainnet
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"

// RPC endpoints
const RPC_URLS = {
  mainnet: "https://api.mainnet-beta.solana.com",
  testnet: "https://api.devnet.solana.com",
}

async function main() {
  // Validate environment
  const privateKey = process.env.SOLANA_PRIVATE_KEY
  if (!privateKey) {
    console.error("Set SOLANA_PRIVATE_KEY environment variable (base58 encoded)")
    process.exit(1)
  }

  console.log("Solana → NEAR Transfer Example")
  console.log(`Network: ${NETWORK}`)
  console.log(`Recipient: ${RECIPIENT}`)
  console.log(`Amount: ${AMOUNT} (base units)`)

  // ============================================================================
  // Step 1: Initialize SDK and wallet
  // ============================================================================
  console.log("\n=== Step 1: Initialize ===")

  const connection = new Connection(RPC_URLS[NETWORK])
  const keypair = Keypair.fromSecretKey(bs58.decode(privateKey))
  const payer = keypair.publicKey

  const bridge = createBridge({ network: NETWORK })
  const solana = createSolanaBuilder({ network: NETWORK, connection })
  const api = new BridgeAPI(NETWORK)

  console.log(`Sender: ${payer.toBase58()}`)
  console.log(`RPC: ${RPC_URLS[NETWORK]}`)

  // ============================================================================
  // Step 2: Validate the transfer
  // ============================================================================
  console.log("\n=== Step 2: Validate Transfer ===")

  const validated = await bridge.validateTransfer({
    token: `sol:${USDC_MINT}`,
    amount: BigInt(AMOUNT),
    fee: 0n,
    nativeFee: 0n,
    sender: `sol:${payer.toBase58()}`,
    recipient: `near:${RECIPIENT}`,
  })

  console.log("Validation passed:")
  console.log(`  Source chain: ${ChainKind[validated.sourceChain]}`)
  console.log(`  Destination chain: ${ChainKind[validated.destChain]}`)
  console.log(`  Normalized amount: ${validated.normalizedAmount}`)

  // ============================================================================
  // Step 3: Build transfer instructions
  // ============================================================================
  console.log("\n=== Step 3: Build Instructions ===")

  const instructions = await solana.buildTransfer(validated, payer)
  console.log(`Built ${instructions.length} instruction(s)`)

  // Log PDAs for debugging
  console.log("Program addresses:")
  console.log(`  Config: ${solana.deriveConfig().toBase58()}`)
  console.log(`  Authority: ${solana.deriveAuthority().toBase58()}`)
  console.log(`  SOL Vault: ${solana.deriveSolVault().toBase58()}`)

  // ============================================================================
  // Step 4: Send transaction
  // ============================================================================
  console.log("\n=== Step 4: Execute Transfer ===")

  const transaction = new Transaction()
  transaction.add(...instructions)

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  transaction.recentBlockhash = blockhash
  transaction.feePayer = payer

  console.log("Sending transaction...")
  const signature = await sendAndConfirmTransaction(connection, transaction, [keypair], {
    commitment: "confirmed",
  })

  console.log(`Transfer TX sent: ${signature}`)
  console.log(`Explorer: https://solscan.io/tx/${signature}`)

  // ============================================================================
  // Step 5: Track transfer status
  // ============================================================================
  console.log("\n=== Step 5: Track Transfer ===")
  console.log("Waiting for finalization on NEAR (this may take 5-15 minutes)...")

  for (let attempt = 1; attempt <= 60; attempt++) {
    try {
      const statuses = await api.getTransferStatus({ transactionHash: signature })
      const latestStatus = statuses[statuses.length - 1]

      if (latestStatus === "Finalised" || latestStatus === "Claimed") {
        console.log("\n✓ Transfer finalized!")

        const transfers = await api.getTransfer({ transactionHash: signature })
        const transfer = transfers[0]
        if (transfer?.initialized?.Solana) {
          console.log(`  Origin TX: ${transfer.initialized.Solana.signature}`)
        }
        if (transfer?.finalised?.NearReceipt) {
          console.log(`  Destination TX: ${transfer.finalised.NearReceipt.transaction_hash}`)
        }
        return
      }

      console.log(`  Attempt ${attempt}/60: ${latestStatus ?? "pending"}...`)
    } catch {
      console.log(`  Attempt ${attempt}/60: waiting...`)
    }

    await new Promise((r) => setTimeout(r, 15000))
  }

  console.log("\nTransfer initiated but not yet finalized.")
  console.log("Check status later with the Bridge API.")
}

main().catch(console.error)
