#!/usr/bin/env node

/**
 * Starknet to NEAR Transfer Example
 *
 * Complete flow to bridge STRK from Starknet to NEAR.
 * Demonstrates the transaction builder pattern with starknet.js.
 *
 * Setup:
 * 1. Set STARKNET_ACCOUNT_ADDRESS and STARKNET_PRIVATE_KEY environment variables
 * 2. Ensure the sender account holds STRK to cover the amount, native fee, and gas
 *
 * Usage:
 *   RECIPIENT=alice.near bun run examples/starknet-to-near.ts
 */

import { BridgeAPI, ChainKind, createBridge, omniAddress } from "@omni-bridge/core"
import { createStarknetBuilder } from "@omni-bridge/starknet"
import { Account, RpcProvider } from "starknet"

// Configuration
const NETWORK = (process.env.NETWORK ?? "mainnet") as "mainnet" | "testnet"
const RECIPIENT = process.env.RECIPIENT ?? "alice.near"
const AMOUNT = process.env.AMOUNT ?? "1000000000000000000" // 1 STRK (18 decimals)
const STRK =
  process.env.STRK_TOKEN ?? "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"

async function main() {
  // Validate environment
  const accountAddress = process.env.STARKNET_ACCOUNT_ADDRESS
  const privateKey = process.env.STARKNET_PRIVATE_KEY
  if (!accountAddress || !privateKey) {
    console.error("Set STARKNET_ACCOUNT_ADDRESS and STARKNET_PRIVATE_KEY environment variables")
    process.exit(1)
  }

  console.log("Starknet → NEAR Transfer Example")
  console.log(`Network: ${NETWORK}`)
  console.log(`Recipient: ${RECIPIENT}`)
  console.log(`Amount: ${AMOUNT} (base units)`)

  // ============================================================================
  // Step 1: Initialize SDK and account
  // ============================================================================
  console.log("\n=== Step 1: Initialize ===")

  const bridge = createBridge({ network: NETWORK })
  const starknetBuilder = createStarknetBuilder({ network: NETWORK })
  const api = new BridgeAPI(NETWORK)

  const nodeUrl =
    process.env.STARKNET_RPC_URL ??
    (NETWORK === "mainnet"
      ? "https://starknet-mainnet.public.blastapi.io"
      : "https://starknet-sepolia.public.blastapi.io")
  const provider = new RpcProvider({ nodeUrl })
  const account = new Account({ provider, address: accountAddress, signer: privateKey })

  const token = omniAddress(ChainKind.Strk, STRK)
  const sender = omniAddress(ChainKind.Strk, accountAddress)
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

  const calls = starknetBuilder.buildTransfer({
    token: STRK,
    amount: validated.params.amount,
    fee: validated.params.fee,
    nativeFee: validated.params.nativeFee,
    recipient: validated.params.recipient,
    feeToken: STRK, // native fee paid in STRK, folded into the token approve
  })

  const { transaction_hash } = await account.execute(calls)
  console.log(`Transfer TX sent: ${transaction_hash}`)

  await provider.waitForTransaction(transaction_hash)
  console.log(
    `Explorer: https://${NETWORK === "testnet" ? "sepolia." : ""}starkscan.co/tx/${transaction_hash}`,
  )

  // ============================================================================
  // Step 4: Track transfer status
  // ============================================================================
  console.log("\n=== Step 4: Track Transfer ===")
  console.log("Waiting for finalization on NEAR...")

  for (let attempt = 1; attempt <= 60; attempt++) {
    try {
      const transfers = await api.getTransfer({ transactionHash: transaction_hash })
      const transfer = transfers[0]

      if (transfer.finalised?.transaction_hash) {
        console.log(`  Transfer Finalised!`)
        console.log(`  Destination TX has on NEAR: ${transfer.finalised.transaction_hash}`)
        return
      }

      console.log(`  Attempt ${attempt}/60: ${transfer.status ?? "pending"}...`)
    } catch (error) {
      console.log(`  Failed attempt ${attempt}/60: waiting...`, error)
    }

    await new Promise((r) => setTimeout(r, 15000))
  }

  console.log("\nTransfer initiated but not yet finalized.")
  console.log("Check status later with the Bridge API.")
}

main().catch(console.error)
