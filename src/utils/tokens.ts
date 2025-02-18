import { getProviderByNetwork, view } from "@near-js/client"
import { addresses } from "../config"
import { ChainKind, type OmniAddress } from "../types"
import { getChain } from "./chain"

/**
 * Converts a NEAR token to its equivalent on another chain
 * @param tokenAddress The NEAR token address to convert
 * @param destinationChain The target chain for conversion
 * @returns Promise resolving to the equivalent token address on the destination chain
 */
export async function convertFromNear(
  tokenAddress: OmniAddress,
  destinationChain: ChainKind,
): Promise<OmniAddress> {
  const rpcProvider = getProviderByNetwork(addresses.network)
  return await view<OmniAddress>({
    account: addresses.near,
    method: "get_token_address",
    args: {
      chain_kind: ChainKind[destinationChain],
      token: tokenAddress.split(":")[1],
    },
    deps: { rpcProvider },
  })
}

/**
 * Converts a token from another chain to its NEAR equivalent
 * @param tokenAddress The non-NEAR token address to convert
 * @returns Promise resolving to the equivalent NEAR token address
 */
export async function convertToNear(tokenAddress: OmniAddress): Promise<OmniAddress> {
  const rpcProvider = getProviderByNetwork(addresses.network)
  const address = await view<string>({
    account: addresses.near,
    method: "get_token_id",
    args: { address: tokenAddress },
    deps: { rpcProvider },
  })
  return `near:${address}`
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
 * const ethAddress = await getTokenAddress("near:token123", ChainKind.Ethereum)
 *
 * // Convert ETH token to Solana (goes through NEAR)
 * const solAddress = await getTokenAddress("eth:0x123...", ChainKind.Sol)
 */
export async function getTokenAddress(
  tokenAddress: OmniAddress,
  destinationChain: ChainKind,
): Promise<OmniAddress> {
  const sourceChain = getChain(tokenAddress)

  // Validate chains are different
  if (sourceChain === destinationChain) {
    throw new Error("Source and destination chains must be different")
  }

  // Direct NEAR to other chain conversion
  if (sourceChain === ChainKind.Near) {
    return convertFromNear(tokenAddress, destinationChain)
  }

  // Direct other chain to NEAR conversion
  if (destinationChain === ChainKind.Near) {
    return convertToNear(tokenAddress)
  }

  // Non-NEAR to non-NEAR conversion (via NEAR as intermediary)
  const nearToken = await convertToNear(tokenAddress)
  return convertFromNear(`near:${nearToken}`, destinationChain)
}
