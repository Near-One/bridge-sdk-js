#!/usr/bin/env node

/**
 * Ethereum to NEAR Transfer Example
 *
 * Complete flow to bridge USDC from Ethereum to NEAR Protocol.
 * Demonstrates the transaction builder pattern with viem.
 *
 * Setup:
 * 1. Set ETH_PRIVATE_KEY environment variable
 * 2. Ensure you have USDC and ETH for gas on Ethereum
 *
 * Usage:
 *   RECIPIENT=alice.near bun run examples/eth-to-near.ts
 */

import { BridgeAPI, ChainKind, createBridge } from "@omni-bridge/core"
import { createEvmBuilder } from "@omni-bridge/evm"
import { type Address, createPublicClient, createWalletClient, http, parseUnits } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { mainnet } from "viem/chains"

// Configuration
const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address
const NETWORK = (process.env.NETWORK as "mainnet" | "testnet") ?? "mainnet"
const RECIPIENT = process.env.RECIPIENT ?? "alice.near"
const AMOUNT = process.env.AMOUNT ?? "10" // USDC amount

async function main() {
  // Validate environment
  const privateKey = process.env.ETH_PRIVATE_KEY
  if (!privateKey) {
    console.error("Set ETH_PRIVATE_KEY environment variable")
    process.exit(1)
  }

  console.log("ETH → NEAR Transfer Example")
  console.log(`Network: ${NETWORK}`)
  console.log(`Recipient: ${RECIPIENT}`)
  console.log(`Amount: ${AMOUNT} USDC`)

  // ============================================================================
  // Step 1: Initialize SDK and wallet
  // ============================================================================
  console.log("\n=== Step 1: Initialize ===")

  const bridge = createBridge({ network: NETWORK })
  const evm = createEvmBuilder({ network: NETWORK, chain: ChainKind.Eth })
  const api = new BridgeAPI(NETWORK)

  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const walletClient = createWalletClient({
    account,
    chain: mainnet,
    transport: http(),
  })
  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(),
  })

  const sender = `eth:${account.address}` as const
  console.log(`Sender: ${sender}`)

  // ============================================================================
  // Step 2: Validate the transfer
  // ============================================================================
  console.log("\n=== Step 2: Validate Transfer ===")

  const amount = parseUnits(AMOUNT, 6) // USDC has 6 decimals

  const validated = await bridge.validateTransfer({
    token: `eth:${USDC_ADDRESS}`,
    amount,
    fee: 0n,
    nativeFee: 0n,
    sender,
    recipient: `near:${RECIPIENT}`,
  })

  console.log("Validation passed:")
  console.log(`  Source chain: ${ChainKind[validated.sourceChain]}`)
  console.log(`  Destination chain: ${ChainKind[validated.destChain]}`)
  console.log(`  Normalized amount: ${validated.normalizedAmount}`)
  console.log(`  Contract: ${validated.contractAddress}`)

  // ============================================================================
  // Step 3: Approve the bridge contract (for ERC20 tokens)
  // ============================================================================
  console.log("\n=== Step 3: Approve Bridge Contract ===")

  const approvalTx = evm.buildMaxApproval(USDC_ADDRESS)
  console.log("Building approval transaction...")
  console.log(`  To: ${approvalTx.to}`)
  console.log(`  Chain ID: ${approvalTx.chainId}`)

  const approvalHash = await walletClient.sendTransaction(approvalTx)
  console.log(`Approval TX sent: ${approvalHash}`)

  const approvalReceipt = await publicClient.waitForTransactionReceipt({
    hash: approvalHash,
  })
  console.log(`Approval confirmed in block ${approvalReceipt.blockNumber}`)

  // ============================================================================
  // Step 4: Build and send the transfer
  // ============================================================================
  console.log("\n=== Step 4: Execute Transfer ===")

  const transferTx = evm.buildTransfer(validated)
  console.log("Building transfer transaction...")
  console.log(`  To: ${transferTx.to}`)
  console.log(`  Value: ${transferTx.value}`)
  console.log(`  Chain ID: ${transferTx.chainId}`)

  const transferHash = await walletClient.sendTransaction(transferTx)
  console.log(`Transfer TX sent: ${transferHash}`)

  const transferReceipt = await publicClient.waitForTransactionReceipt({
    hash: transferHash,
  })
  console.log(`Transfer confirmed in block ${transferReceipt.blockNumber}`)
  console.log(`Explorer: https://etherscan.io/tx/${transferHash}`)

  // ============================================================================
  // Step 5: Track transfer status
  // ============================================================================
  console.log("\n=== Step 5: Track Transfer ===")
  console.log("Waiting for finalization on NEAR (this may take 5-15 minutes)...")

  for (let attempt = 1; attempt <= 60; attempt++) {
    try {
      const statuses = await api.getTransferStatus({ transactionHash: transferHash })
      const latestStatus = statuses[statuses.length - 1]

      if (latestStatus === "Finalised" || latestStatus === "Claimed") {
        console.log("\n✓ Transfer finalized!")

        const transfers = await api.getTransfer({ transactionHash: transferHash })
        const transfer = transfers[0]
        if (transfer?.initialized?.EVMLog) {
          console.log(`  Origin TX: ${transfer.initialized.EVMLog.transaction_hash}`)
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
