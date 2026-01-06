import { hex } from "@scure/base"
import { serialize, wormhole } from "@wormhole-foundation/sdk"
import evm from "@wormhole-foundation/sdk/evm"
import solana from "@wormhole-foundation/sdk/solana"

export type WormholeNetwork = "Mainnet" | "Testnet" | "Devnet"

/**
 * Fetch Wormhole VAA for a Solana transaction.
 * Waits up to 2 minutes for guardians to sign.
 *
 * @param txSignature - Solana transaction signature
 * @param network - Wormhole network
 * @returns Hex-encoded VAA
 */
export async function getWormholeVaa(
  txSignature: string,
  network: WormholeNetwork,
): Promise<string> {
  const wh = await wormhole(network, [evm, solana])
  const result = await wh.getVaa(txSignature, "Uint8Array", 120_000)
  if (!result) {
    throw new Error("No VAA found")
  }
  const serialized = serialize(result)
  return hex.encode(serialized)
}

/**
 * @deprecated Use `getWormholeVaa` instead
 */
export const getVaa = getWormholeVaa
