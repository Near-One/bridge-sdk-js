import { createRpcClientWrapper, view } from "@near-js/client"
import { addresses } from "../config.js"
import { ChainKind, type OmniAddress } from "../types/index.js"

const CHAIN_PATTERNS: Record<string, ChainKind> = {
  "nbtc.bridge.near": ChainKind.Btc,
  "eth.bridge.near": ChainKind.Eth,
  "sol.omdep.near": ChainKind.Sol,
  "base.omdep.near": ChainKind.Base,
  "arb.omdep.near": ChainKind.Arb,
  "bnb.omdep.near": ChainKind.Bnb,
  "nbtc.n-bridge.testnet": ChainKind.Btc,
  "eth.sepolia.testnet": ChainKind.Eth,
  "sol.omnidep.testnet": ChainKind.Sol,
  "base.omnidep.testnet": ChainKind.Base,
  "arb.omnidep.testnet": ChainKind.Arb,
  "bnb.omnidep.testnet": ChainKind.Bnb,
}

/**
 * Validates if a NEAR address is a recognized omni bridge token
 * @param nearAddress - The NEAR address to validate
 * @returns true if the address follows a known omni bridge pattern
 *
 * @example
 * isBridgeToken("foo.omdep.near") // false
 * isBridgeToken("sol-ABC123.omdep.near") // true
 * isBridgeToken("random.near") // false
 */
export function isBridgeToken(nearAddress: string): boolean {
  return (
    nearAddress in CHAIN_PATTERNS ||
    /\.(omdep\.near|omnidep\.testnet|factory\.bridge\.(near|testnet))$/.test(nearAddress)
  )
}

/**
 * Parses the origin chain from a NEAR token address format (offline parsing)
 *
 * @param nearAddress - The NEAR token address (e.g., "sol-3ZLekZYq2qkZiSpnSvabjit34tUkjSwD1JFuW9as9wBG.omdep.near")
 * @returns The origin chain kind, or null if pattern is not recognized
 */
export function parseOriginChain(nearAddress: string): ChainKind | null {
  // Check exact matches
  if (nearAddress in CHAIN_PATTERNS) return CHAIN_PATTERNS[nearAddress]

  // Check prefixed patterns
  if (/\.(omdep\.near|omnidep\.testnet|factory\.bridge\.(near|testnet))$/.test(nearAddress)) {
    if (nearAddress.startsWith("sol-")) return ChainKind.Sol
    if (nearAddress.startsWith("base-")) return ChainKind.Base
    if (nearAddress.startsWith("arb-")) return ChainKind.Arb
    if (nearAddress.startsWith("bnb-")) return ChainKind.Bnb
    if (nearAddress.includes("factory.bridge")) return ChainKind.Eth
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
  const rpcProvider = createRpcClientWrapper([addresses.near.rpcUrl])
  return await view<OmniAddress>({
    account: addresses.near.contract,
    method: "get_bridged_token",
    args: {
      chain: ChainKind[destinationChain].toString(),
      address: tokenAddress,
    },
    deps: { rpcProvider },
  })
}
