/**
 * Solana to NEAR Token Deployment Example
 *
 * Complete flow to deploy (register) a Solana SPL token on NEAR so it can be bridged.
 * Demonstrates the transaction builder pattern with @solana/web3.js and near-kit.
 *
 * Flow:
 * 1. logMetadata on Solana (posts a Wormhole message with the token's metadata)
 * 2. Fetch the Wormhole VAA for that transaction
 * 3. deployToken on NEAR using the VAA as proof
 *
 * Note: unlike the EVM→NEAR flow, Solana does not require a separate bindToken
 * step — the mapping is established during deployment.
 *
 * Setup:
 * 1. Set SOLANA_PRIVATE_KEY (base58 encoded) environment variable
 * 2. Set NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY (ed25519:... base58 encoded) environment variables
 * 3. Ensure the Solana account holds SOL to cover fees, and the NEAR account holds
 *    enough NEAR to cover the storage deposit for deploy_token
 */

import { ChainKind, createBridge, getWormholeVaa, type WormholeNetwork } from "@omni-bridge/core"
import { createNearBuilder, ProofKind, toNearKitTransaction } from "@omni-bridge/near"
import { createSolanaBuilder } from "@omni-bridge/solana"
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js"
import bs58 from "bs58"
import { Near, type PrivateKey } from "near-kit"

// Configuration
const NETWORK = (process.env.NETWORK ?? "mainnet") as "mainnet" | "testnet"
const TOKEN = process.env.TOKEN

if (!TOKEN) {
  console.error("Set Token account to deploy in environment variables")
  process.exit(1)
}

// ~5 NEAR for storage — matches the deposit used by the EVM→NEAR deploy_token example
const DEPLOY_TOKEN_DEPOSIT = 5_000_000_000_000_000_000_000_000n

// RPC endpoints
const RPC_URLS = {
  mainnet: "https://api.mainnet-beta.solana.com",
  testnet: "https://api.devnet.solana.com",
}

const WORMHOLE_NETWORKS: Record<"mainnet" | "testnet", WormholeNetwork> = {
  mainnet: "Mainnet",
  testnet: "Testnet",
}

async function main() {
  // Validate environment
  const solanaPrivateKey = process.env.SOLANA_PRIVATE_KEY
  if (!solanaPrivateKey) {
    console.error("Set SOLANA_PRIVATE_KEY environment variable (base58 encoded)")
    process.exit(1)
  }

  const nearAccountId = process.env.NEAR_ACCOUNT_ID
  const nearPrivateKey = process.env.NEAR_PRIVATE_KEY
  if (!nearAccountId || !nearPrivateKey) {
    console.error("Set NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY environment variables")
    process.exit(1)
  }

  console.log("Solana → NEAR Token Deployment Example")
  console.log(`Network: ${NETWORK}`)
  console.log(`Token: ${TOKEN}`)

  // ============================================================================
  // Step 1: Initialize SDK and wallets
  // ============================================================================
  console.log("\n=== Step 1: Initialize ===")

  const connection = new Connection(RPC_URLS[NETWORK])
  const keypair = Keypair.fromSecretKey(bs58.decode(solanaPrivateKey))
  const feePayer = keypair.publicKey
  console.log(`Solana Payer: ${feePayer}`)

  const solana = createSolanaBuilder({ network: NETWORK, connection })
  const bridge = createBridge({ network: NETWORK })
  const nearBuilder = createNearBuilder({ network: NETWORK })
  const near = new Near({
    network: NETWORK,
    privateKey: nearPrivateKey as PrivateKey,
    defaultSignerId: nearAccountId,
  })
  console.log(`NEAR Signer: ${nearAccountId}`)

  // Skip deployment if the token is already registered on NEAR
  const existing = await bridge.getBridgedToken(`sol:${TOKEN}`, ChainKind.Near)
  if (existing) {
    console.log(`\nToken already deployed on NEAR: ${existing}`)
    return
  }

  // ============================================================================
  // Step 2: Log Metadata on Solana
  // ============================================================================
  console.log("\n=== Step 2: Log Metadata (Solana) ===")

  const logMetaDataInstructions = await solana.buildLogMetadata(new PublicKey(TOKEN), feePayer)

  // Build and send Solana transaction
  const { blockhash } = await connection.getLatestBlockhash()
  const solTx = new Transaction({
    recentBlockhash: blockhash,
    feePayer,
  })
  solTx.add(...logMetaDataInstructions)

  const logMetadataTxHash = await sendAndConfirmTransaction(connection, solTx, [keypair])

  console.log(`✓ Transaction Hash: ${logMetadataTxHash}`)

  // ============================================================================
  // Step 3: Fetch the Wormhole VAA for the logMetadata transaction
  // ============================================================================
  console.log("\n=== Step 3: Fetch Wormhole VAA ===")

  const vaa = await getWormholeVaa(logMetadataTxHash, WORMHOLE_NETWORKS[NETWORK])

  console.log(`✓ VAA retrieved (${vaa.length} hex chars)`)

  // ============================================================================
  // Step 4: Deploy the token on NEAR
  // ============================================================================
  console.log("\n=== Step 4: Deploy Token (NEAR) ===")

  const proverArgs = nearBuilder.serializeWormholeProofArgs({
    proof_kind: ProofKind.LogMetadata,
    vaa,
  })

  const deployTx = nearBuilder.buildDeployToken(
    ChainKind.Sol,
    proverArgs,
    nearAccountId,
    DEPLOY_TOKEN_DEPOSIT,
  )

  const deployResult = await toNearKitTransaction(near, deployTx).send({ waitUntil: "FINAL" })

  console.log(`✓ Deploy Token TX: ${deployResult.transaction.hash}`)

  const bridgedToken = await bridge.getBridgedToken(`sol:${TOKEN}`, ChainKind.Near)
  console.log(`\n🎉 Token deployed on NEAR: ${bridgedToken}`)
}

main().catch(console.error)
