import { serialize, wormhole } from "@wormhole-foundation/sdk"
import evm from "@wormhole-foundation/sdk/evm"
import solana from "@wormhole-foundation/sdk/solana"

export async function getVaa(txHash: string, network: "Mainnet" | "Testnet" | "Devnet") {
  const wh = await wormhole(network, [evm, solana])
  const result = await wh.getVaa(txHash, "Uint8Array", 60_000)
  if (!result) {
    throw new Error("No VAA found")
  }
  const serialized = serialize(result)
  return Buffer.from(serialized).toString("hex")
}
