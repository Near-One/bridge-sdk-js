#!/usr/bin/env node

/**
 * Register Polymarket outcome tokens on NEAR via Polygon bridge
 *
 * Fetches a Polymarket event by slug from the Gamma API, then for each
 * outcome token across all markets:
 *  1. Tries deriveDeterministicAddress (view) to derive the NEAR token account name
 *  2. Skips if the token is already registered on NEAR
 *  3. Sends logMetadata1155 on Polygon (emits a Wormhole message)
 *  4. Fetches the signed VAA from Wormhole guardians
 *  5. Calls deploy_token on the NEAR bridge contract
 *
 * Setup:
 *   EVENT_SLUG=will-the-us-confirm-that-aliens-exist-before-2027
 *   EVM_PRIVATE_KEY=0x...
 *   NEAR_ACCOUNT_ID=your.near
 *   NEAR_PRIVATE_KEY=ed25519:...
 *
 * Usage:
 *   bun run examples/polygon-outcome-tokens-registration.ts
 */

import { ChainKind } from "@omni-bridge/core"
import { createNearBuilder, ProofKind, toNearKitTransaction } from "@omni-bridge/near"
import { Near, parseAmount } from "near-kit"
import { createPublicClient, createWalletClient, http, type PublicClient } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { polygon } from "viem/chains"

// ============================================================================
// Config
// ============================================================================

const EVENT_SLUG = process.env.EVENT_SLUG
const POLYGON_RPC_URL = "https://polygon-bor-rpc.publicnode.com"

const FALLBACK_DEPOSIT = BigInt(parseAmount("4 NEAR"))

// Polymarket ConditionalTokens (CTF) ERC-1155 contract on Polygon mainnet
const CTF_CONTRACT = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045" as const

// OmniBridge ERC-1155 contract on Polygon mainnet
const BRIDGE_1155_CONTRACT = "0xd025b38762B4A4E36F0Cde483b86CB13ea00D989" as const

// Wormhole Core Bridge on Polygon mainnet
const WORMHOLE_CORE_POLYGON = "0x7A4B5a56256163F07b2C80A7cA55aBE66c4ec4d7"
// LogMessagePublished(address indexed sender, uint64 sequence, uint32 nonce, bytes payload, uint8 consistencyLevel)
const WORMHOLE_LOG_TOPIC = "0x6eb224fb001ed210e379b335e35efe88672a8ce935d981a6896b27ffdf52a3b2"
const WORMHOLE_POLYGON_CHAIN_ID = 5

// ============================================================================
// ABI
// ============================================================================

const LOG_METADATA_1155_ABI = [
  {
    // logMetadata1155 is payable with no return value — it stores the mapping
    // and emits a Wormhole LogMessagePublished message.
    name: "logMetadata1155",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "tokenAddress", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    // Pure view helper that computes the deterministic EVM address for a token.
    // Used to derive the NEAR token account name without spending gas.
    name: "deriveDeterministicAddress",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "tokenAddress", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "address" }],
  },
] as const

// ============================================================================
// Gamma API types
// ============================================================================

interface GammaMarket {
  question?: string
  conditionId?: string
  // Gamma API double-serializes this: the field value is a JSON-encoded string
  // containing a stringified array, e.g. "[\"107505...\", \"73056...\"]"
  clobTokenIds?: string | string[]
  clob_token_ids?: string | string[]
  outcomes?: string | string[] // also double-serialized like clobTokenIds
}

interface GammaEvent {
  title?: string
  markets?: GammaMarket[]
}

// ============================================================================
// Types
// ============================================================================

interface OutcomeToken {
  marketQuestion: string
  conditionId: string
  outcomeName: string
  tokenId: bigint
}

interface TokenRegistration {
  tokenId: bigint
  outcomeName: string
  marketQuestion: string
  deterministicAddress: string
  nearAccount: string
  status: "registered" | "already-registered" | "failed"
  nearTxHash?: string
  error?: string
}

// ============================================================================
// Helpers
// ============================================================================

async function fetchPolymarketEvent(slug: string): Promise<GammaEvent> {
  const url = `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`
  console.log(`  Gamma API: ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Gamma API error: ${res.status} ${res.statusText}`)
  const data = (await res.json()) as GammaEvent[]
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`No event found for slug: ${slug}`)
  }
  return data[0]
}

// Gamma API double-serializes several array fields: the JSON value is itself a
// JSON-encoded string, e.g. "[\"107505...\", \"73056...\"]".
// Token IDs inside are already quoted strings so no float64 precision is lost.
function parseJsonStringOrArray(raw: string | string[] | undefined): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(String)
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) return (parsed as unknown[]).map(String)
  } catch {
    // fall through
  }
  return []
}

function extractOutcomeTokens(event: GammaEvent): OutcomeToken[] {
  const tokens: OutcomeToken[] = []
  for (const market of event.markets ?? []) {
    const question = market.question ?? "(no question)"
    const conditionId = market.conditionId ?? ""
    const tokenIds = parseJsonStringOrArray(market.clobTokenIds ?? market.clob_token_ids)
    const rawOutcomes = parseJsonStringOrArray(market.outcomes)
    const outcomes =
      rawOutcomes.length > 0 ? rawOutcomes : tokenIds.map((_, i) => `Outcome ${i + 1}`)
    for (let i = 0; i < tokenIds.length; i++) {
      const str = tokenIds[i].trim()
      tokens.push({
        marketQuestion: question,
        conditionId,
        outcomeName: outcomes[i] ?? `Outcome ${i + 1}`,
        tokenId: BigInt(str),
      })
    }
  }
  return tokens
}

async function readDeterministicAddress(
  client: PublicClient,
  tokenId: bigint,
): Promise<`0x${string}` | null> {
  try {
    return await client.readContract({
      address: BRIDGE_1155_CONTRACT,
      abi: LOG_METADATA_1155_ABI,
      functionName: "deriveDeterministicAddress",
      args: [CTF_CONTRACT, tokenId],
    })
  } catch {
    return null
  }
}

async function getVaaHex(emitter: string, sequence: bigint): Promise<string> {
  const emitterHex = emitter.replace("0x", "").toLowerCase().padStart(64, "0")
  const url = `https://api.wormholescan.io/api/v1/vaas/${WORMHOLE_POLYGON_CHAIN_ID}/${emitterHex}/${sequence}`
  console.log(`    Wormhole: ${url}`)
  for (let i = 1; i <= 10; i++) {
    const res = await fetch(url)
    if (res.ok) {
      const json = (await res.json()) as { data?: { vaa?: string } }
      const vaaBase64 = json?.data?.vaa
      if (vaaBase64) {
        return Array.from(atob(vaaBase64), (c) =>
          c.charCodeAt(0).toString(16).padStart(2, "0"),
        ).join("")
      }
    }
    console.log(`    Attempt ${i}/10: VAA not ready yet, waiting 6s...`)
    await new Promise((r) => setTimeout(r, 6000))
  }
  throw new Error("VAA not available after retries. Wormhole guardians may need more time.")
}

async function getDeployTokenDeposit(near: Near, bridgeContract: string): Promise<bigint> {
  for (const method of ["required_balance_for_deploy_token", "required_balance_for_bind_token"]) {
    try {
      const result = await near.view<string>(bridgeContract, method, {})
      if (result) {
        console.log(`  Deposit (${method}): ${result} yocto`)
        return BigInt(result)
      }
    } catch {
      // try next
    }
  }
  console.log(`  No view method found, using fallback ${FALLBACK_DEPOSIT} yocto (~4 NEAR)`)
  return FALLBACK_DEPOSIT
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  if (!EVENT_SLUG) {
    console.error("Set EVENT_SLUG environment variable")
    console.error(
      "  Example: EVENT_SLUG=will-the-us-confirm-that-aliens-exist-before-2027 bun run examples/polygon-outcome-tokens-registration.ts",
    )
    process.exit(1)
  }

  const evmPrivateKey = process.env.EVM_PRIVATE_KEY
  const nearAccountId = process.env.NEAR_ACCOUNT_ID
  const nearPrivateKey = process.env.NEAR_PRIVATE_KEY

  if (!evmPrivateKey || !nearAccountId || !nearPrivateKey) {
    console.error(
      "Set EVM_PRIVATE_KEY, NEAR_ACCOUNT_ID, and NEAR_PRIVATE_KEY environment variables",
    )
    process.exit(1)
  }

  console.log("Polymarket Outcome Token Registration")
  console.log(`Event:      ${EVENT_SLUG}`)
  console.log(`NEAR:       ${nearAccountId}`)

  // ============================================================================
  // Step 1: Fetch event from Gamma API
  // ============================================================================
  console.log("\n=== Step 1: Fetch Polymarket event ===")
  const event = await fetchPolymarketEvent(EVENT_SLUG)
  console.log(`  Title:   ${event.title ?? "(no title)"}`)
  console.log(`  Markets: ${event.markets?.length ?? 0}`)

  const tokens = extractOutcomeTokens(event)
  if (tokens.length === 0) {
    console.error("No outcome tokens found in event")
    process.exit(1)
  }

  console.log(`  Outcome tokens: ${tokens.length}`)
  for (const t of tokens) {
    console.log(
      `    [${t.outcomeName}] tokenId=${t.tokenId}  conditionId=${t.conditionId}  ${t.marketQuestion}`,
    )
  }

  // ============================================================================
  // Step 2: Set up clients
  // ============================================================================
  console.log("\n=== Step 2: Set up clients ===")

  const account = privateKeyToAccount(evmPrivateKey as `0x${string}`)
  console.log(`  EVM account: ${account.address}`)

  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(POLYGON_RPC_URL),
  })
  const walletClient = createWalletClient({
    account,
    chain: polygon,
    transport: http(POLYGON_RPC_URL),
  })

  const near = new Near({
    network: "mainnet",
    privateKey: nearPrivateKey as `ed25519:${string}`,
    defaultSignerId: nearAccountId,
  })
  const nearBuilder = createNearBuilder({ network: "mainnet" })
  const bridgeContract = nearBuilder["bridgeContract"] as string
  const deployDeposit = await getDeployTokenDeposit(near, bridgeContract)

  // ============================================================================
  // Step 3: Register each outcome token
  // ============================================================================
  const results: TokenRegistration[] = []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    console.log(`\n=== Token ${i + 1}/${tokens.length}: [${token.outcomeName}] ===`)
    console.log(`  Question:    ${token.marketQuestion}`)
    console.log(`  ConditionId: ${token.conditionId}`)
    console.log(`  Token ID:    ${token.tokenId}`)

    const result: TokenRegistration = {
      tokenId: token.tokenId,
      outcomeName: token.outcomeName,
      marketQuestion: token.marketQuestion,
      deterministicAddress: "",
      nearAccount: "",
      status: "failed",
    }

    try {
      // [3a] Get deterministic address via free view call (no gas).
      // deriveDeterministicAddress computes the same CREATE2 address the contract
      // uses internally, giving us the NEAR token account name up front.
      console.log("  [3a] Deriving deterministic address...")
      let deterministicAddress = await readDeterministicAddress(publicClient, token.tokenId)
      if (deterministicAddress) {
        result.deterministicAddress = deterministicAddress
        result.nearAccount = `pol-${deterministicAddress.toLowerCase()}.omdep.near`
        console.log(`  Deterministic address: ${deterministicAddress}`)
        console.log(`  NEAR token account:    ${result.nearAccount}`)
      } else {
        console.log("  Note: deriveDeterministicAddress not available as view, will read after tx")
      }

      // [3b] If we have the address, check if already registered on NEAR (saves gas)
      if (deterministicAddress) {
        const alreadyExists = await near.accountExists(result.nearAccount)
        if (alreadyExists) {
          console.log("  Already registered on NEAR, skipping")
          result.status = "already-registered"
          results.push(result)
          continue
        }
      }

      // [3c] Send logMetadata1155 on Polygon
      console.log("  [3c] Sending logMetadata1155 on Polygon...")
      const txHash = await walletClient.writeContract({
        address: BRIDGE_1155_CONTRACT,
        abi: LOG_METADATA_1155_ABI,
        functionName: "logMetadata1155",
        args: [CTF_CONTRACT, token.tokenId],
      })
      console.log(`  Polygon TX: ${txHash}`)

      // [3d] Wait for receipt
      console.log("  [3d] Waiting for receipt...")
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      console.log(`  Block: ${receipt.blockNumber}, status: ${receipt.status}`)
      if (receipt.status === "reverted") throw new Error("Transaction reverted on Polygon")

      // [3e] If address wasn't available pre-tx, try again now that the mapping is populated.
      if (!deterministicAddress) {
        deterministicAddress = await readDeterministicAddress(publicClient, token.tokenId)
        if (deterministicAddress) {
          result.deterministicAddress = deterministicAddress
          result.nearAccount = `pol-${deterministicAddress.toLowerCase()}.omdep.near`
          console.log(`  Deterministic address: ${deterministicAddress}`)
          console.log(`  NEAR token account:    ${result.nearAccount}`)
        } else {
          console.log("  Note: could not get deterministic address")
        }
      }

      // [3e] Extract Wormhole emitter and sequence from logs
      const wormholeLog = receipt.logs.find(
        (log) =>
          log.address.toLowerCase() === WORMHOLE_CORE_POLYGON.toLowerCase() &&
          log.topics[0] === WORMHOLE_LOG_TOPIC,
      )
      if (!wormholeLog) throw new Error("No Wormhole LogMessagePublished found in transaction")

      if (!wormholeLog.topics[1]) throw new Error("Wormhole log is missing sender topic")
      const emitter = `0x${wormholeLog.topics[1].slice(-40)}` as `0x${string}`
      const sequence = BigInt(`0x${wormholeLog.data.slice(2, 66)}`)
      console.log(`  emitter: ${emitter}`)
      console.log(`  sequence: ${sequence}`)

      // [3f] Fetch signed VAA from Wormhole
      console.log("  [3f] Fetching VAA from Wormhole...")
      const vaaHex = await getVaaHex(emitter, sequence)
      console.log(`  VAA length: ${vaaHex.length} hex chars`)

      // [3g] Serialize Borsh proof for NEAR prover
      const proverArgs = nearBuilder.serializeWormholeProofArgs({
        proof_kind: ProofKind.LogMetadata,
        vaa: vaaHex,
      })

      // [3h] Build and send deploy_token on NEAR
      console.log("  [3h] Deploying token on NEAR...")
      const unsignedTx = nearBuilder.buildDeployToken(
        ChainKind.Pol,
        proverArgs,
        nearAccountId,
        deployDeposit,
      )
      const nearResult = await toNearKitTransaction(near, unsignedTx)
        .send()
        .catch((e) => {
          console.error("  NEAR error:", JSON.stringify(e?.data ?? e?.details ?? e, null, 2))
          throw e
        })

      result.status = "registered"
      result.nearTxHash = nearResult.transaction.hash
      console.log(`  NEAR TX: ${nearResult.transaction.hash}`)
      console.log(`  Explorer: https://nearblocks.io/txns/${nearResult.transaction.hash}`)
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err)
      console.error(`  FAILED: ${result.error}`)
      result.status = "failed"
    }

    results.push(result)
  }

  // ============================================================================
  // Summary
  // ============================================================================
  console.log(`\n${"=".repeat(60)}`)
  console.log("REGISTRATION SUMMARY")
  console.log("=".repeat(60))
  console.log(`Event: ${event.title ?? EVENT_SLUG}`)
  console.log("")

  for (const r of results) {
    const icon = r.status === "registered" ? "✓" : r.status === "already-registered" ? "=" : "✗"
    console.log(`${icon}  [${r.outcomeName}]  tokenId=${r.tokenId}`)
    console.log(`    Market:     ${r.marketQuestion}`)
    console.log(`    EVM addr:   ${r.deterministicAddress || "(unknown)"}`)
    console.log(`    NEAR token: ${r.nearAccount || "(unknown)"}`)
    if (r.status === "registered" && r.nearTxHash) {
      console.log(`    NEAR TX:    https://nearblocks.io/txns/${r.nearTxHash}`)
    } else if (r.status === "already-registered") {
      console.log("    Status:     already registered")
    } else if (r.status === "failed") {
      console.log(`    Error:      ${r.error}`)
    }
    console.log("")
  }

  const registered = results.filter((r) => r.status === "registered").length
  const alreadyRegistered = results.filter((r) => r.status === "already-registered").length
  const failed = results.filter((r) => r.status === "failed").length
  console.log(
    `${registered} newly registered, ${alreadyRegistered} already existed, ${failed} failed`,
  )

  const withAccount = results.filter((r) => r.nearAccount)
  if (withAccount.length > 0) {
    console.log("\nNEAR token accounts:")
    for (const r of withAccount) {
      console.log(`  [${r.outcomeName}]  ${r.nearAccount}`)
    }
  }
}

main().catch(console.error)
