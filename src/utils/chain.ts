import type { OmniAddress } from "../types"
import { ChainKind } from "../types"

type ChainPrefix = "eth" | "near" | "sol" | "arb" | "base"

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
  } as const

  return chainMapping[prefix]
}
