/**
 * Address utilities for parsing and constructing OmniAddresses
 */

import { ValidationError } from "../errors.js"
import { ChainKind, type ChainPrefix, type OmniAddress } from "../types.js"

// Mapping from chain prefix to ChainKind
const CHAIN_PREFIX_MAP: Record<ChainPrefix, ChainKind> = {
  eth: ChainKind.Eth,
  near: ChainKind.Near,
  sol: ChainKind.Sol,
  arb: ChainKind.Arb,
  base: ChainKind.Base,
  bnb: ChainKind.Bnb,
  btc: ChainKind.Btc,
  zec: ChainKind.Zcash,
  pol: ChainKind.Pol,
}

// Mapping from ChainKind to prefix
const CHAIN_KIND_PREFIX_MAP: Record<ChainKind, ChainPrefix> = {
  [ChainKind.Eth]: "eth",
  [ChainKind.Near]: "near",
  [ChainKind.Sol]: "sol",
  [ChainKind.Arb]: "arb",
  [ChainKind.Base]: "base",
  [ChainKind.Bnb]: "bnb",
  [ChainKind.Btc]: "btc",
  [ChainKind.Zcash]: "zec",
  [ChainKind.Pol]: "pol",
}

// Valid chain prefixes
const VALID_PREFIXES = new Set<string>(Object.keys(CHAIN_PREFIX_MAP))

/**
 * Extracts the chain from an OmniAddress
 */
export function getChain(address: OmniAddress): ChainKind {
  const colonIndex = address.indexOf(":")
  if (colonIndex === -1) {
    throw new ValidationError(`Invalid OmniAddress format: ${address}`, "INVALID_ADDRESS", {
      address,
    })
  }

  const prefix = address.slice(0, colonIndex) as ChainPrefix
  if (!VALID_PREFIXES.has(prefix)) {
    throw new ValidationError(`Unknown chain prefix: ${prefix}`, "INVALID_CHAIN", {
      prefix,
      address,
    })
  }

  return CHAIN_PREFIX_MAP[prefix]
}

/**
 * Extracts the raw address (without chain prefix) from an OmniAddress
 */
export function getAddress(address: OmniAddress): string {
  const colonIndex = address.indexOf(":")
  if (colonIndex === -1) {
    throw new ValidationError(`Invalid OmniAddress format: ${address}`, "INVALID_ADDRESS", {
      address,
    })
  }
  return address.slice(colonIndex + 1)
}

/**
 * Constructs an OmniAddress from chain kind and raw address
 */
export function omniAddress(chain: ChainKind, address: string): OmniAddress {
  const prefix = CHAIN_KIND_PREFIX_MAP[chain]
  return `${prefix}:${address}` as OmniAddress
}

// EVM chain kinds
export type EvmChainKind =
  | ChainKind.Eth
  | ChainKind.Base
  | ChainKind.Arb
  | ChainKind.Bnb
  | ChainKind.Pol

/**
 * Checks if a chain is an EVM-compatible chain
 */
export function isEvmChain(chain: ChainKind): chain is EvmChainKind {
  return (
    chain === ChainKind.Eth ||
    chain === ChainKind.Base ||
    chain === ChainKind.Arb ||
    chain === ChainKind.Bnb ||
    chain === ChainKind.Pol
  )
}

/**
 * Returns the chain prefix for a given chain kind
 */
export function getChainPrefix(chain: ChainKind): ChainPrefix {
  return CHAIN_KIND_PREFIX_MAP[chain]
}
