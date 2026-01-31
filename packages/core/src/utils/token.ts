/**
 * Token utilities for identifying and parsing bridge token addresses
 */

import { ChainKind } from "../types.js"

/**
 * Known bridge token contract patterns for exact matching
 * Maps NEAR contract addresses to their origin chain
 */
const KNOWN_BRIDGE_TOKENS: Record<string, ChainKind> = {
  // Mainnet
  "nbtc.bridge.near": ChainKind.Btc,
  "zec.omft.near": ChainKind.Zcash,
  "eth.bridge.near": ChainKind.Eth,
  "sol.omdep.near": ChainKind.Sol,
  "base.omdep.near": ChainKind.Base,
  "arb.omdep.near": ChainKind.Arb,
  "bnb.omdep.near": ChainKind.Bnb,
  "pol.omdep.near": ChainKind.Pol,
  // Testnet
  "nbtc.n-bridge.testnet": ChainKind.Btc,
  "nzcash.n-bridge.testnet": ChainKind.Zcash,
  "eth.sepolia.testnet": ChainKind.Eth,
  "sol.omnidep.testnet": ChainKind.Sol,
  "base.omnidep.testnet": ChainKind.Base,
  "arb.omnidep.testnet": ChainKind.Arb,
  "bnb.omnidep.testnet": ChainKind.Bnb,
  "pol.omnidep.testnet": ChainKind.Pol,
}

/**
 * Regex pattern matching known bridge token factory suffixes
 */
const BRIDGE_TOKEN_SUFFIX_PATTERN =
  /\.(omdep\.near|omnidep\.testnet|factory\.bridge\.near|factory\.sepolia\.testnet)$/

/**
 * Chain prefix patterns for wrapped tokens
 */
const CHAIN_PREFIXES: Record<string, ChainKind> = {
  "sol-": ChainKind.Sol,
  "base-": ChainKind.Base,
  "arb-": ChainKind.Arb,
  "bnb-": ChainKind.Bnb,
  "pol-": ChainKind.Pol,
}

/**
 * Validates if a NEAR address is a recognized omni bridge token
 *
 * @param nearAddress - The NEAR address to validate
 * @returns true if the address follows a known omni bridge token pattern
 *
 * @example
 * ```ts
 * isBridgeToken("nbtc.bridge.near") // true - known BTC token
 * isBridgeToken("sol-ABC123.omdep.near") // true - wrapped SOL token
 * isBridgeToken("random.near") // false - not a bridge token
 * isBridgeToken("foo.omdep.near") // true - matches factory suffix
 * ```
 */
export function isBridgeToken(nearAddress: string): boolean {
  return nearAddress in KNOWN_BRIDGE_TOKENS || BRIDGE_TOKEN_SUFFIX_PATTERN.test(nearAddress)
}

/**
 * Parses the origin chain from a NEAR token address format.
 * This is an offline parsing function that uses pattern matching
 * without making any RPC calls.
 *
 * @param nearAddress - The NEAR token address
 *   (e.g., "sol-3ZLekZYq2qkZiSpnSvabjit34tUkjSwD1JFuW9as9wBG.omdep.near")
 * @returns The origin chain kind, or null if pattern is not recognized
 *
 * @example
 * ```ts
 * parseOriginChain("nbtc.bridge.near") // ChainKind.Btc
 * parseOriginChain("sol-ABC123.omdep.near") // ChainKind.Sol
 * parseOriginChain("eth.factory.bridge.near") // ChainKind.Eth
 * parseOriginChain("random.near") // null
 * ```
 */
export function parseOriginChain(nearAddress: string): ChainKind | null {
  // Check exact matches first
  const exactMatch = KNOWN_BRIDGE_TOKENS[nearAddress]
  if (exactMatch !== undefined) return exactMatch

  // Check if it matches a bridge token factory pattern
  if (BRIDGE_TOKEN_SUFFIX_PATTERN.test(nearAddress)) {
    // Check for chain prefixes
    for (const [prefix, chain] of Object.entries(CHAIN_PREFIXES)) {
      if (nearAddress.startsWith(prefix)) return chain
    }

    // ETH tokens use factory.bridge (mainnet) or factory.sepolia (testnet) suffix
    if (nearAddress.includes("factory.bridge") || nearAddress.includes("factory.sepolia"))
      return ChainKind.Eth
  }

  return null
}
