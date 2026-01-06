#!/usr/bin/env node

/**
 * Zcash Withdrawal Example (New Package Structure)
 *
 * Shows how to withdraw Zcash from NEAR using the new @omni-bridge packages.
 *
 * Note: Withdrawals require:
 * 1. nZEC balance on NEAR
 * 2. Building the withdrawal transaction
 * 3. Waiting for MPC signing (handled by bridge relayers)
 * 4. Broadcasting the signed transaction
 *
 * Setup:
 * 1. Replace NEAR_ACCOUNT with your testnet account
 * 2. Replace ZCASH_ADDRESS with your Zcash testnet address
 * 3. Set ZCASH_API_KEY environment variable
 * 4. Ensure you have nZEC balance
 *
 * Usage: ZCASH_API_KEY=your_key bun run examples/zcash-withdraw.ts
 */

import { Near } from "near-kit"
import {
  ChainKind,
  createBridge,
  getAddresses,
  type Network,
} from "@omni-bridge/core"
import { createBtcBuilder, getZcashScript } from "@omni-bridge/btc"

// Configuration - Replace with your values
const NEAR_ACCOUNT = "bridge-sdk-test.testnet"
const ZCASH_ADDRESS = "tmXxJxBHuNhDD5nca3uCQwcSGgsJ7qLfvWg"
const NETWORK: Network = "testnet"
const ZCASH_API_KEY = process.env.ZCASH_API_KEY ?? ""

async function main() {
  console.log("Zcash Withdrawal Example (New SDK)")
  console.log(`Withdrawing from ${NEAR_ACCOUNT} to ${ZCASH_ADDRESS}`)

  if (!ZCASH_API_KEY) {
    console.error("Set ZCASH_API_KEY environment variable before running")
    process.exit(1)
  }

  // Initialize clients
  const bridge = createBridge({ network: NETWORK })
  const zcashBuilder = createBtcBuilder({
    network: NETWORK,
    chain: "zcash",
    rpcHeaders: { "x-api-key": ZCASH_API_KEY },
  })
  const addresses = getAddresses(NETWORK)
  const near = new Near({ network: NETWORK })

  // Verify the Zcash address is valid by converting to script
  try {
    const script = getZcashScript(ZCASH_ADDRESS)
    console.log(`Address script: ${script.slice(0, 20)}...`)
  } catch (error) {
    console.error("Invalid Zcash address:", (error as Error).message)
    process.exit(1)
  }

  // Get connector config for minimum withdrawal
  const connectorConfig = await near.view<{
    min_withdraw_amount: string
    change_address: string
  }>(addresses.zcash.zcashConnector, "get_config", {})

  if (!connectorConfig) {
    throw new Error("Failed to get connector config")
  }

  const withdrawalAmount = BigInt(connectorConfig.min_withdraw_amount)
  console.log(`Minimum withdrawal: ${withdrawalAmount} zatoshis`)

  // Get available UTXOs from the connector
  const utxos = await near.view<Record<string, unknown>>(
    addresses.zcash.zcashConnector,
    "get_utxos_paged",
    {},
  )

  if (!utxos || Object.keys(utxos).length === 0) {
    console.log("No UTXOs available in bridge - try again later")
    return
  }

  console.log(`Available UTXOs: ${Object.keys(utxos).length}`)

  // Build withdrawal plan using the Zcash builder
  // Uses ZIP-317 fee calculation automatically
  try {
    const normalizedUtxos = Object.entries(utxos).map(([key, utxo]) => {
      const [txid] = key.split("@")
      const u = utxo as { vout: number; balance: string; tx_bytes?: number[] }
      return {
        txid: txid!,
        vout: u.vout,
        balance: BigInt(u.balance),
        tx_bytes: u.tx_bytes,
      }
    })

    const plan = zcashBuilder.buildWithdrawalPlan(
      normalizedUtxos,
      withdrawalAmount,
      ZCASH_ADDRESS,
      connectorConfig.change_address,
    )

    console.log("\nWithdrawal Plan (ZIP-317 fees):")
    console.log(`  Inputs: ${plan.inputs.length}`)
    console.log(`  Outputs: ${plan.outputs.length}`)
    console.log(`  Fee: ${plan.fee} zatoshis`)

    // To execute the withdrawal, you would:
    // 1. Call ft_transfer_call on the nZEC token contract
    // 2. Wait for MPC signing via the bridge API
    // 3. Broadcast the signed transaction
    //
    // Example with near-kit (requires credentials):
    //
    // const nearWithCredentials = new Near({
    //   network: NETWORK,
    //   privateKey: "ed25519:...",
    // })
    //
    // const msg = {
    //   Withdraw: {
    //     target_btc_address: ZCASH_ADDRESS,
    //     input: plan.inputs,
    //     output: plan.outputs,
    //   },
    // }
    //
    // await nearWithCredentials
    //   .transaction(NEAR_ACCOUNT)
    //   .functionCall(addresses.zcash.zcashToken, "ft_transfer_call", {
    //     receiver_id: addresses.zcash.zcashConnector,
    //     amount: (withdrawalAmount + plan.fee + bridgeFee).toString(),
    //     msg: JSON.stringify(msg),
    //   }, { gas: "100 Tgas", attachedDeposit: "1 yocto" })
    //   .send()

    console.log("\nWithdrawal plan ready!")
    console.log("To execute, call ft_transfer_call on the nZEC token contract")
  } catch (error) {
    console.log("Failed to build withdrawal plan:")
    console.log((error as Error).message)
  }
}

main().catch(console.error)
