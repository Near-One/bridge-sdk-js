/**
 * Zcash-specific utilities for address encoding and fee calculation
 */

import { sha256 } from "@noble/hashes/sha2.js"
import { createBase58check } from "@scure/base"
import type { FeeCalculator } from "./types.js"

const ZCASH_NETWORKS = {
  mainnet: {
    name: "mainnet",
    pubKeyHash: new Uint8Array([0x1c, 0xb8]), // t1
    scriptHash: new Uint8Array([0x1c, 0xbd]), // t3
  },
  testnet: {
    name: "testnet",
    pubKeyHash: new Uint8Array([0x1d, 0x25]), // tm
    scriptHash: new Uint8Array([0x1c, 0xba]), // t2
  },
}

const base58check = createBase58check(sha256)

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

interface AddressInfo {
  type: "pkh" | "sh"
  hash: Uint8Array
  network: string
}

function decodeZcashAddress(address: string): AddressInfo {
  const data = base58check.decode(address)
  if (data.length !== 22) throw new Error("Invalid Zcash address length")

  const prefix = data.slice(0, 2)
  const hash = data.slice(2)

  // Check all networks and address types
  for (const [networkName, network] of Object.entries(ZCASH_NETWORKS)) {
    if (equalBytes(prefix, network.pubKeyHash)) {
      return { type: "pkh", hash, network: networkName }
    }
    if (equalBytes(prefix, network.scriptHash)) {
      return { type: "sh", hash, network: networkName }
    }
  }

  throw new Error(`Unknown Zcash address prefix: ${address}`)
}

function createZcashScriptFromInfo(addressInfo: AddressInfo): string {
  const hashHex = Array.from(addressInfo.hash)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")

  switch (addressInfo.type) {
    case "pkh":
      // P2PKH: OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
      return `76a914${hashHex}88ac`
    case "sh":
      // P2SH: OP_HASH160 <20 bytes> OP_EQUAL
      return `a914${hashHex}87`
    default:
      throw new Error(`Unsupported address type: ${addressInfo.type}`)
  }
}

/**
 * Convert a Zcash address to its script_pubkey
 * Supports both mainnet (t1, t3) and testnet (tm, t2) addresses
 *
 * @param address - Zcash transparent address
 * @returns Hex-encoded script_pubkey
 */
export function getZcashScript(address: string): string {
  const addressInfo = decodeZcashAddress(address)
  return createZcashScriptFromInfo(addressInfo)
}

/**
 * ZIP-317 marginal fee calculation for Zcash transactions
 *
 * See: https://zips.z.cash/zip-0317
 *
 * For transparent-only transactions:
 * - Each input or output counts as a "logical action"
 * - Grace actions = 2 (first 2 actions are free)
 * - Marginal fee = 5000 zatoshis per action
 *
 * @param inputs - Number of transaction inputs
 * @param outputs - Number of transaction outputs
 * @returns Fee in zatoshis
 */
export function calculateZcashFee(inputs: number, outputs: number): bigint {
  const marginalFee = 5000 // zatoshis per logical action
  const graceActions = 2

  // For transparent transactions, logical actions = max(inputs, outputs)
  const logicalActions = Math.max(inputs, outputs)

  // Fee = marginalFee * max(graceActions, logicalActions)
  const fee = marginalFee * Math.max(graceActions, logicalActions)

  return BigInt(fee)
}

/**
 * Create a Zcash fee calculator function
 *
 * Uses ZIP-317 marginal fee model instead of Bitcoin's linear fee calculation
 */
export function zcashFeeCalculator(): FeeCalculator {
  return (inputCount: number, outputCount: number) => calculateZcashFee(inputCount, outputCount)
}

/**
 * Default dust threshold for Zcash (5000 zatoshis)
 * This is higher than Bitcoin's 546 satoshis due to ZIP-317
 */
export const ZCASH_DUST_THRESHOLD = 5000n
