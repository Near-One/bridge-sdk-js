import { ChainKind, type OmniAddress } from "./types"

export function parseOmniAddress(address: string): OmniAddress {
  const [chain, addr] = address.split(":")
  const chainKey = Object.keys(ChainKind).find((k) => k.toLowerCase() === chain.toLowerCase())
  if (!chainKey) {
    throw new Error(`Invalid chain: ${chain}`)
  }
  return {
    chain: ChainKind[chainKey as keyof typeof ChainKind],
    address: addr,
  }
}

export function formatOmniAddress(addr: OmniAddress): string {
  return `${ChainKind[addr.chain].toLowerCase()}:${addr.address}`
}
