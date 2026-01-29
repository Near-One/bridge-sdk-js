/**
 * Utilities for identifying and parsing omni bridge tokens on NEAR
 */

import { ChainKind } from "../types.js"

/**
 * Known bridge token suffixes for mainnet and testnet.
 * These are the NEAR account suffixes used by the omni bridge.
 */
const BRIDGE_TOKEN_SUFFIXES = [".bridge.near", ".n-bridge.testnet", ".omni-bridge.testnet"]

/**
 * Known bridge token prefixes and their corresponding chain kinds.
 * These are used by the omni bridge deployer contract.
 */
const BRIDGE_TOKEN_PREFIXES: Record<string, ChainKind> = {
  "eth-": ChainKind.Eth,
  "arb-": ChainKind.Arb,
  "base-": ChainKind.Base,
  "bnb-": ChainKind.Bnb,
  "sol-": ChainKind.Sol,
  "pol-": ChainKind.Pol,
}

/**
 * Special native wrapped tokens and their chain kinds
 */
const NATIVE_BRIDGE_TOKENS: Record<string, ChainKind> = {
  // Mainnet
  "nbtc.bridge.near": ChainKind.Btc,
  "nzec.bridge.near": ChainKind.Zcash,
  // Testnet
  "nbtc.n-bridge.testnet": ChainKind.Btc,
  "nzcash.n-bridge.testnet": ChainKind.Zcash,
}

/**
 * Deployer account patterns that contain bridge tokens
 */
const DEPLOYER_PATTERNS = [
  ".omdep.near",
  ".omdeployer.testnet",
  ".bridge.near",
  ".n-bridge.testnet",
]

/**
 * Check if a NEAR address is a recognized omni bridge token.
 *
 * This performs offline validation without any RPC calls.
 *
 * @param nearAddress - The NEAR account address to check
 * @returns true if the address matches known bridge token patterns
 *
 * @example
 * ```ts
 * isBridgeToken("nbtc.bridge.near") // true
 * isBridgeToken("sol-ABC123.omdep.near") // true
 * isBridgeToken("random.near") // false
 * ```
 */
export function isBridgeToken(nearAddress: string): boolean {
  // Check native bridge tokens first
  if (NATIVE_BRIDGE_TOKENS[nearAddress]) {
    return true
  }

  // Check if it's a deployed bridge token (has chain prefix)
  for (const suffix of DEPLOYER_PATTERNS) {
    if (nearAddress.endsWith(suffix)) {
      const accountName = nearAddress.slice(0, -suffix.length)
      // Check if it starts with a known chain prefix
      for (const prefix of Object.keys(BRIDGE_TOKEN_PREFIXES)) {
        if (accountName.startsWith(prefix) || accountName.includes(`.${prefix.slice(0, -1)}-`)) {
          return true
        }
      }
    }
  }

  // Check generic bridge token suffixes
  for (const suffix of BRIDGE_TOKEN_SUFFIXES) {
    if (nearAddress.endsWith(suffix)) {
      return true
    }
  }

  return false
}

/**
 * Parse the origin chain from a NEAR bridge token address.
 *
 * This performs offline parsing without any RPC calls.
 *
 * @param nearAddress - The NEAR account address of a bridge token
 * @returns The origin ChainKind, or null if not a recognized bridge token
 *
 * @example
 * ```ts
 * parseOriginChain("nbtc.bridge.near") // ChainKind.Btc
 * parseOriginChain("sol-ABC123.omdep.near") // ChainKind.Sol
 * parseOriginChain("random.near") // null
 * ```
 */
export function parseOriginChain(nearAddress: string): ChainKind | null {
  // Check native bridge tokens first
  if (NATIVE_BRIDGE_TOKENS[nearAddress] !== undefined) {
    return NATIVE_BRIDGE_TOKENS[nearAddress]
  }

  // Check for chain prefix in deployed tokens
  for (const suffix of DEPLOYER_PATTERNS) {
    if (nearAddress.endsWith(suffix)) {
      const accountName = nearAddress.slice(0, -suffix.length)

      // Direct prefix match (e.g., "sol-ABC123")
      for (const [prefix, chain] of Object.entries(BRIDGE_TOKEN_PREFIXES)) {
        if (accountName.startsWith(prefix)) {
          return chain
        }
      }

      // Nested prefix match (e.g., "some.eth-token")
      for (const [prefix, chain] of Object.entries(BRIDGE_TOKEN_PREFIXES)) {
        if (accountName.includes(`.${prefix.slice(0, -1)}-`)) {
          return chain
        }
      }
    }
  }

  return null
}
