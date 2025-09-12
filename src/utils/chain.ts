import * as btc from "@scure/btc-signer"
import { PublicKey } from "@solana/web3.js"
import { ethers } from "ethers"
import type { OmniAddress } from "../types/index.js"
import { ChainKind } from "../types/index.js"

type ChainPrefix = "eth" | "near" | "sol" | "arb" | "base" | "bnb" | "btc"

// Type helpers for EVM chains
export type EVMChainKind = ChainKind.Eth | ChainKind.Base | ChainKind.Arb | ChainKind.Bnb

/**
 * Checks if a given chain is an EVM-compatible chain
 * @param chain - The chain to check
 * @returns true if the chain is EVM-compatible, false otherwise
 */
export function isEvmChain(chain: ChainKind): chain is EVMChainKind {
  return (
    chain === ChainKind.Eth ||
    chain === ChainKind.Base ||
    chain === ChainKind.Arb ||
    chain === ChainKind.Bnb
  )
}

/**
 * Validates if an address is valid for the specified chain
 * @param chain - The target chain kind
 * @param address - The address string to validate
 * @throws Error if the address is invalid for the specified chain
 */
export function validateAddress(chain: ChainKind, address: string): void {
  switch (chain) {
    case ChainKind.Eth:
    case ChainKind.Arb:
    case ChainKind.Base:
    case ChainKind.Bnb:
      if (!ethers.isAddress(address)) {
        throw new Error(`Invalid ${ChainKind[chain]} address: ${address}`)
      }
      break

    case ChainKind.Near:
      if (!isValidNearAccountId(address)) {
        throw new Error(`Invalid NEAR account ID: ${address}`)
      }
      break

    case ChainKind.Sol:
      try {
        new PublicKey(address)
      } catch {
        throw new Error(`Invalid Solana address: ${address}`)
      }
      break

    case ChainKind.Btc:
      try {
        // Use the Address decoder with mainnet (for basic validation)
        const addressDecoder = btc.Address(btc.NETWORK)
        addressDecoder.decode(address)
      } catch {
        throw new Error(`Invalid Bitcoin address: ${address}`)
      }
      break

    default:
      throw new Error(`Unsupported chain kind: ${chain}`)
  }
}

/**
 * Validates NEAR account ID format according to NEAR protocol rules
 * @param accountId - The account ID to validate
 * @returns true if valid, false otherwise
 */
function isValidNearAccountId(accountId: string): boolean {
  // NEAR account ID validation rules:
  // 1. Must be 2-64 characters long
  // 2. Can contain lowercase letters, digits, dots, - and _
  // 3. Cannot start or end with separator (- or _)
  // 4. Cannot have two consecutive separators
  // 5. For implicit accounts (hex), must be exactly 64 characters

  if (accountId.length < 2 || accountId.length > 64) {
    return false
  }

  // Check for implicit account (64-character hex string)
  if (accountId.length === 64 && /^[0-9a-f]+$/.test(accountId)) {
    return true
  }

  // Check for named account - allow lowercase letters, digits, dots, dashes, underscores
  const validCharPattern = /^[a-z0-9._-]+$/
  if (!validCharPattern.test(accountId)) {
    return false
  }

  // Cannot start or end with separator (- or _)
  if (
    accountId.startsWith("-") ||
    accountId.startsWith("_") ||
    accountId.endsWith("-") ||
    accountId.endsWith("_")
  ) {
    return false
  }

  // Cannot have consecutive separators
  if (
    accountId.includes("--") ||
    accountId.includes("__") ||
    accountId.includes("-_") ||
    accountId.includes("_-")
  ) {
    return false
  }

  return true
}

// Helper function to construct OmniAddress
export const omniAddress = (chain: ChainKind, address: string): OmniAddress => {
  const prefix = ChainKind[chain].toLowerCase() as ChainPrefix
  return `${prefix}:${address}`
}

/**
 * Validates an address for the specified chain and returns a valid OmniAddress
 * @param chain - The target chain kind
 * @param address - The address string to validate
 * @returns Valid OmniAddress
 * @throws Error if the address is invalid for the specified chain
 */
export const validateOmniAddress = (chain: ChainKind, address: string): OmniAddress => {
  validateAddress(chain, address)
  return omniAddress(chain, address)
}

// Extract chain from omni address
export const getChain = (addr: OmniAddress): ChainKind => {
  const prefix = addr.split(":")[0] as ChainPrefix

  const chainMapping = {
    eth: ChainKind.Eth,
    near: ChainKind.Near,
    sol: ChainKind.Sol,
    arb: ChainKind.Arb,
    base: ChainKind.Base,
    bnb: ChainKind.Bnb,
    btc: ChainKind.Btc,
  } as const

  return chainMapping[prefix]
}
