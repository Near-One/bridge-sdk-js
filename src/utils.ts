import type { Chain, OmniAddress } from "./types"

// Helper function to construct OmniAddress
export const omniAddress = (chain: Chain, address: string): OmniAddress => {
  return `${chain}:${address}`
}

// Get chain from OmniAddress
export const getChain = (addr: OmniAddress): Chain => {
  const [chain] = addr.split(":") as [Chain]
  return chain
}
