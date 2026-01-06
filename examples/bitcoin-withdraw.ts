#!/usr/bin/env node

/**
 * Bitcoin Withdrawal Example (New Package Structure)
 *
 * Shows how to withdraw Bitcoin from NEAR using the new @omni-bridge packages.
 *
 * Note: Withdrawals require:
 * 1. nBTC balance on NEAR
 * 2. Building the withdrawal transaction
 * 3. Waiting for MPC signing (handled by bridge relayers)
 * 4. Broadcasting the signed transaction
 *
 * Setup:
 * 1. Replace NEAR_ACCOUNT with your testnet account
 * 2. Replace BITCOIN_ADDRESS with your Bitcoin testnet address
 * 3. Ensure you have nBTC balance and NEAR credentials
 *
 * Usage: bun run examples/bitcoin-withdraw.ts
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
const BITCOIN_ADDRESS = "tb1q7jn2426dwpsf3xlasazzjuwcvayjn6fhlm2vjp"
const NETWORK: Network = "testnet"

async function main() {
  console.log("Bitcoin Withdrawal Example (New SDK)")
  console.log(`Withdrawing from ${NEAR_ACCOUNT} to ${BITCOIN_ADDRESS}`)

  // Initialize clients
  const bridge = createBridge({ network: NETWORK })
  const btcBuilder = createBtcBuilder({ network: NETWORK })
  const addresses = getAddresses(NETWORK)
  const near = new Near({ network: NETWORK })

  // Get connector config for minimum withdrawal
  const connectorConfig = await near.view<{
    min_withdraw_amount: string
    change_address: string
  }>(addresses.btc.btcConnector, "get_config", {})

  if (!connectorConfig) {
    throw new Error("Failed to get connector config")
  }

  const withdrawalAmount = BigInt(connectorConfig.min_withdraw_amount)
  console.log(`Minimum withdrawal: ${withdrawalAmount} satoshis`)

  // Get available UTXOs from the connector
  const utxos = await near.view<Record<string, unknown>>(
    addresses.btc.btcConnector,
    "get_utxos_paged",
    {},
  )

  if (!utxos || Object.keys(utxos).length === 0) {
    console.log("No UTXOs available in bridge - try again later")
    return
  }

  console.log(`Available UTXOs: ${Object.keys(utxos).length}`)

  // Build withdrawal plan using the BTC builder
  // This selects UTXOs and calculates fees
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

    const plan = btcBuilder.buildWithdrawalPlan(
      normalizedUtxos,
      withdrawalAmount,
      BITCOIN_ADDRESS,
      connectorConfig.change_address,
      2, // fee rate in sat/vB
    )

    console.log("\nWithdrawal Plan:")
    console.log(`  Inputs: ${plan.inputs.length}`)
    console.log(`  Outputs: ${plan.outputs.length}`)
    console.log(`  Fee: ${plan.fee} satoshis`)

    // To execute the withdrawal, you would:
    // 1. Call ft_transfer_call on the nBTC token contract
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
    //     target_btc_address: BITCOIN_ADDRESS,
    //     input: plan.inputs,
    //     output: plan.outputs,
    //   },
    // }
    //
    // await nearWithCredentials
    //   .transaction(NEAR_ACCOUNT)
    //   .functionCall(addresses.btc.btcToken, "ft_transfer_call", {
    //     receiver_id: addresses.btc.btcConnector,
    //     amount: (withdrawalAmount + plan.fee + bridgeFee).toString(),
    //     msg: JSON.stringify(msg),
    //   }, { gas: "100 Tgas", attachedDeposit: "1 yocto" })
    //   .send()

    console.log("\nWithdrawal plan ready!")
    console.log("To execute, call ft_transfer_call on the nBTC token contract")
  } catch (error) {
    console.log("Failed to build withdrawal plan:")
    console.log((error as Error).message)
  }
}

main().catch(console.error)
