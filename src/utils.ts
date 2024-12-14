import { ChainKind } from "./types"
import type { OmniAddress } from "./types"

// Helper function to construct OmniAddress
export const omniAddress = (chain: ChainKind, address: string): OmniAddress => {
  if ("Eth" in chain) return `eth:${address}`
  if ("Near" in chain) return `near:${address}`
  if ("Sol" in chain) return `sol:${address}`
  if ("Arb" in chain) return `arb:${address}`
  if ("Base" in chain) return `base:${address}`
  throw new Error("Unknown chain kind")
}

// Get chain from OmniAddress
export const getChain = (addr: OmniAddress): ChainKind => {
  const [prefix] = addr.split(":") as [keyof typeof ChainKind]
  const chain = prefix.toLowerCase()

  switch (chain) {
    case "eth":
      return ChainKind.Eth
    case "near":
      return ChainKind.Near
    case "sol":
      return ChainKind.Sol
    case "arb":
      return ChainKind.Arb
    case "base":
      return ChainKind.Base
    default:
      throw new Error(`Unknown chain prefix: ${prefix}`)
  }
}
