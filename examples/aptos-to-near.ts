#!/usr/bin/env node

/**
 * Aptos to NEAR Transfer Example
 *
 * Complete flow to bridge APT from Aptos to NEAR.
 * Demonstrates the transaction builder pattern with @aptos-labs/ts-sdk.
 *
 * Setup:
 * 1. Set APTOS_PRIVATE_KEY environment variable
 * 2. Ensure the sender account holds APT to cover the amount, native fee, and gas
 *
 * Usage:
 *   RECIPIENT=alice.near bun run examples/aptos-to-near.ts
 */

import {
  Account,
  Aptos,
  AptosConfig,
  Network as AptosNetwork,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk"
import { createAptosBuilder } from "@omni-bridge/aptos"
import { BridgeAPI, ChainKind, createBridge, type Network, omniAddress } from "@omni-bridge/core"

// Configuration
const NETWORK: Network = (process.env.NETWORK as Network) ?? "mainnet"
const RECIPIENT = process.env.RECIPIENT ?? "alice.near"
const AMOUNT = process.env.AMOUNT ?? "1000000" // 0.01 APT (8 decimals)
const APT = "0x000000000000000000000000000000000000000000000000000000000000000a"

async function main() {
  // Validate environment
  const privateKey = process.env.APTOS_PRIVATE_KEY
  if (!privateKey) {
    console.error("Set APTOS_PRIVATE_KEY environment variable")
    process.exit(1)
  }

  console.log("Aptos → NEAR Transfer Example")
  console.log(`Network: ${NETWORK}`)
  console.log(`Recipient: ${RECIPIENT}`)
  console.log(`Amount: ${AMOUNT} (base units)`)

  // ============================================================================
  // Step 1: Initialize SDK and account
  // ============================================================================
  console.log("\n=== Step 1: Initialize ===")

  const bridge = createBridge({ network: NETWORK })
  const aptosBuilder = createAptosBuilder({ network: NETWORK })
  const api = new BridgeAPI(NETWORK)

  const account = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(privateKey) })
  const aptos = new Aptos(
    new AptosConfig({
      network: NETWORK === "mainnet" ? AptosNetwork.MAINNET : AptosNetwork.TESTNET,
      // clientConfig: { http2: false }, // IN CASE YOU USE - Bun doesn't fully support HTTP/2; disable to avoid stalled requests
    }),
  )

  const token = omniAddress(ChainKind.Aptos, APT)
  const sender = omniAddress(ChainKind.Aptos, account.accountAddress.toString())
  const recipient = omniAddress(ChainKind.Near, RECIPIENT)
  console.log(`Sender: ${sender}`)

  // ============================================================================
  // Step 2: Validate the transfer
  // ============================================================================
  console.log("\n=== Step 2: Validate Transfer ===")

  const feeRequestResult = await api.getFee(sender, recipient, token, AMOUNT)
  if (feeRequestResult.native_token_fee === null) throw new Error("Invalid native token fee in Api")

  const validated = await bridge.validateTransfer({
    token,
    amount: BigInt(AMOUNT),
    fee: 0n,
    nativeFee: feeRequestResult.native_token_fee,
    sender,
    recipient,
  })

  console.log("Validation passed:")
  console.log(`  Source chain: ${ChainKind[validated.sourceChain]}`)
  console.log(`  Destination chain: ${ChainKind[validated.destChain]}`)
  console.log(`  Normalized amount: ${validated.normalizedAmount}`)

  // ============================================================================
  // Step 3: Build, sign, and submit the transfer
  // ============================================================================
  console.log("\n=== Step 3: Execute Transfer ===")

  const payload = aptosBuilder.buildTransfer({
    token: "0xa",
    amount: validated.params.amount,
    fee: validated.params.fee,
    nativeFee: validated.params.nativeFee,
    recipient: validated.params.recipient,
  })

  const transaction = await aptos.transaction.build.simple({
    sender: account.accountAddress,
    data: payload,
    options: { maxGasAmount: 20000 }, // 20000 × 100 = 0.02 APT reserved instead of the 2 APT default, you can lower the amount if you want
  })

  const pending = await aptos.signAndSubmitTransaction({ signer: account, transaction })
  console.log(`Transfer TX sent: ${pending.hash}`)

  await aptos.waitForTransaction({ transactionHash: pending.hash })
  console.log(`Explorer: https://explorer.aptoslabs.com/txn/${pending.hash}?network=${NETWORK}`)

  // ============================================================================
  // Step 4: Track transfer status
  // ============================================================================
  console.log("\n=== Step 4: Track Transfer ===")
  console.log("Waiting for finalization on NEAR...")

  for (let attempt = 1; attempt <= 60; attempt++) {
    try {
      const statuses = await api.getTransferStatus({ transactionHash: pending.hash })
      const latestStatus = statuses[statuses.length - 1]

      if (latestStatus === "Finalised" || latestStatus === "Settled") {
        console.log("\n✓ Transfer finalized!")

        const transfers = await api.getTransfer({ transactionHash: pending.hash })
        const transfer = transfers[0]
        if (transfer?.initialised) {
          console.log(`  Origin TX: ${transfer.initialised.transaction_hash}`)
        }
        if (transfer?.finalised) {
          console.log(`  Destination TX: ${transfer.finalised.transaction_hash}`)
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
