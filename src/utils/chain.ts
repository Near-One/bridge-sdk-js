import type { OmniAddress } from "../types/index.js"
import { ChainKind } from "../types/index.js"

type ChainPrefix = "eth" | "near" | "sol" | "arb" | "base" | "bnb"

// Type helpers for EVM chains
export type EVMChainKind = ChainKind.Eth | ChainKind.Base | ChainKind.Arb | ChainKind.Bnb
export type UTXOChainKind = ChainKind.Btc | ChainKind.Zcash

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
 * Checks if a given chain is a UTXO chain
 * @param chain - The chain to check
 * @returns true if the chain is a UTXO chain, false otherwise
 */
export function isUtxoChain(chain: ChainKind): chain is UTXOChainKind {
  return chain === ChainKind.Btc || chain === ChainKind.Zcash
}

// Helper function to construct OmniAddress
export const omniAddress = (chain: ChainKind, address: string): OmniAddress => {
  const prefix = ChainKind[chain].toLowerCase() as ChainPrefix
  return `${prefix}:${address}`
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
  } as const

  return chainMapping[prefix]
}
