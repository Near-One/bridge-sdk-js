import { getProviderByNetwork, view } from "@near-js/client"
import { addresses } from "../config.js"
import { ChainKind, type OmniAddress } from "../types/index.js"

const ORIGIN_CHAIN_PATTERNS: Record<string, ChainKind> = {
  "nbtc.bridge.near": ChainKind.Btc,
  "eth.bridge.near": ChainKind.Eth,
  "sol.omdep.near": ChainKind.Sol,
  "base.omdep.near": ChainKind.Base,
  "arb.omdep.near": ChainKind.Arb,
}

/**
 * Parses the origin chain from a NEAR token address format (offline parsing)
 * 
 * @param nearAddress - The NEAR token address (e.g., "sol-3ZLekZYq2qkZiSpnSvabjit34tUkjSwD1JFuW9as9wBG.omdep.near")
 * @returns The origin chain kind, or null if pattern is not recognized
 */
export function parseOriginChain(nearAddress: string): ChainKind | null {
  // Check exact matches first
  if (nearAddress in ORIGIN_CHAIN_PATTERNS) {
    return ORIGIN_CHAIN_PATTERNS[nearAddress]
  }

  // Check prefixed bridged tokens
  if (nearAddress.endsWith(".omdep.near")) {
    if (nearAddress.startsWith("sol-")) return ChainKind.Sol
    if (nearAddress.startsWith("base-")) return ChainKind.Base
    if (nearAddress.startsWith("arb-")) return ChainKind.Arb
  }

  // Check Ethereum legacy pattern
  if (nearAddress.endsWith(".factory.bridge.near")) {
    return ChainKind.Eth
  }

  return null
}

/**
 * Converts a token address from one chain to its equivalent on another chain.
 * For non-NEAR to non-NEAR conversions, the process goes through NEAR as an intermediary.
 *
 * @param tokenAddress The source token address to convert
 * @param destinationChain The target chain for the conversion
 * @returns Promise resolving to the equivalent token address on the destination chain
 * @throws Error if source and destination chains are the same
 *
 * @example
 * // Convert NEAR token to ETH
 * const ethAddress = await getBridgedToken("near:token123", ChainKind.Ethereum)
 *
 * // Convert ETH token to Solana (goes through NEAR)
 * const solAddress = await getBridgedToken("eth:0x123...", ChainKind.Sol)
 */
export async function getBridgedToken(
  tokenAddress: OmniAddress,
  destinationChain: ChainKind,
): Promise<OmniAddress | null> {
  const rpcProvider = getProviderByNetwork(addresses.network)
  return await view<OmniAddress>({
    account: addresses.near,
    method: "get_bridged_token",
    args: {
      chain: ChainKind[destinationChain].toString(),
      address: tokenAddress,
    },
    deps: { rpcProvider },
  })
}
