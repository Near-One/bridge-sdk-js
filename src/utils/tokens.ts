import { getProviderByNetwork, view } from "@near-js/client"
import { addresses } from "../config"
import { ChainKind, type OmniAddress } from "../types"

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
