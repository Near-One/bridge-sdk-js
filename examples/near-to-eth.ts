#!/usr/bin/env node

/**
 * NEAR to Ethereum Transfer Example
 *
 * Complete flow to bridge tokens from NEAR to Ethereum.
 * Demonstrates storage deposits and the near-kit shim.
 *
 * Setup:
 * 1. Set NEAR_PRIVATE_KEY or have credentials in ~/.near-credentials
 * 2. Have wrapped USDC on NEAR (usdc.bridge.near)
 *
 * Usage:
 *   RECIPIENT=0x... bun run examples/near-to-eth.ts
 */

import { createBridge, BridgeAPI, ChainKind, type Network } from "@omni-bridge/core"
import { createNearBuilder, toNearKitTransaction } from "@omni-bridge/near"
import { Near } from "near-kit"

// Configuration
const NETWORK: Network = (process.env.NETWORK as Network) ?? "mainnet"
const NEAR_ACCOUNT = process.env.NEAR_ACCOUNT ?? "alice.near"
const RECIPIENT = process.env.RECIPIENT ?? "0x0000000000000000000000000000000000000000"
const AMOUNT = process.env.AMOUNT ?? "1000000" // 1 USDC in base units (6 decimals)
const WRAPPED_USDC = "usdc.bridge.near"

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
  console.log("NEAR → ETH Transfer Example")
  console.log(`Network: ${NETWORK}`)
  console.log(`Sender: ${NEAR_ACCOUNT}`)
  console.log(`Recipient: ${RECIPIENT}`)
  console.log(`Amount: ${AMOUNT} (base units)`)

  // ============================================================================
  // Step 1: Initialize SDK
  // ============================================================================
  console.log("\n=== Step 1: Initialize ===")

  const bridge = createBridge({ network: NETWORK })
  const nearBuilder = createNearBuilder({ network: NETWORK })
  const api = new BridgeAPI(NETWORK)
  const near = await createNearInstance()

  console.log("SDK initialized")

  // ============================================================================
  // Step 2: Check and handle storage deposit
  // ============================================================================
  console.log("\n=== Step 2: Check Storage Deposit ===")

  const requiredDeposit = await nearBuilder.getRequiredStorageDeposit(NEAR_ACCOUNT)

  if (requiredDeposit > 0n) {
    console.log(`Storage deposit needed: ${requiredDeposit} yoctoNEAR`)

    const storageTx = nearBuilder.buildStorageDeposit(NEAR_ACCOUNT, requiredDeposit)
    const storageResult = await toNearKitTransaction(near, storageTx).send({
      waitUntil: "FINAL",
    })

    console.log(`Storage deposit confirmed: ${storageResult.transaction.hash}`)
  } else {
    console.log("Storage deposit sufficient")
  }

  // ============================================================================
  // Step 3: Validate the transfer
  // ============================================================================
  console.log("\n=== Step 3: Validate Transfer ===")

  const validated = await bridge.validateTransfer({
    token: `near:${WRAPPED_USDC}`,
    amount: BigInt(AMOUNT),
    fee: 0n,
    nativeFee: 0n,
    sender: `near:${NEAR_ACCOUNT}`,
    recipient: `eth:${RECIPIENT}`,
  })

  console.log("Validation passed:")
  console.log(`  Source chain: ${ChainKind[validated.sourceChain]}`)
  console.log(`  Destination chain: ${ChainKind[validated.destChain]}`)
  console.log(`  Normalized amount: ${validated.normalizedAmount}`)
  if (validated.bridgedToken) {
    console.log(`  Bridged token on ETH: ${validated.bridgedToken}`)
  }

  // ============================================================================
  // Step 4: Build and send the transfer
  // ============================================================================
  console.log("\n=== Step 4: Execute Transfer ===")

  const transferTx = nearBuilder.buildTransfer(validated, NEAR_ACCOUNT)
  console.log("Building transfer transaction...")
  console.log(`  Receiver: ${transferTx.receiverId}`)
  console.log(`  Actions: ${transferTx.actions.length}`)

  const result = await toNearKitTransaction(near, transferTx).send({
    waitUntil: "FINAL",
  })

  console.log(`Transfer TX sent: ${result.transaction.hash}`)
  console.log(`Explorer: https://nearblocks.io/txns/${result.transaction.hash}`)

  // ============================================================================
  // Step 5: Track transfer status
  // ============================================================================
  console.log("\n=== Step 5: Track Transfer ===")
  console.log("Waiting for finalization on Ethereum (this may take 5-20 minutes)...")

  for (let attempt = 1; attempt <= 60; attempt++) {
    try {
      const statuses = await api.getTransferStatus({
        transactionHash: result.transaction.hash,
      })
      const latestStatus = statuses[statuses.length - 1]

      if (latestStatus === "Finalised" || latestStatus === "Claimed") {
        console.log("\n✓ Transfer finalized!")

        const transfers = await api.getTransfer({
          transactionHash: result.transaction.hash,
        })
        const transfer = transfers[0]
        if (transfer?.initialized?.NearReceipt) {
          console.log(`  Origin TX: ${transfer.initialized.NearReceipt.transaction_hash}`)
        }
        if (transfer?.finalised?.EVMLog) {
          console.log(`  Destination TX: ${transfer.finalised.EVMLog.transaction_hash}`)
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
