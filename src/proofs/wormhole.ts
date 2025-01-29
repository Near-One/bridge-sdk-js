import { serialize, wormhole } from "@wormhole-foundation/sdk"
import evm from "@wormhole-foundation/sdk/evm"
import solana from "@wormhole-foundation/sdk/solana"

export async function getVaaForTransfer(txHash: string) {
  const wh = await wormhole("Mainnet", [evm, solana])
  const result = await wh.getVaa(txHash, "Uint8Array", 60_000)
  if (!result) {
    throw new Error("No VAA found")
  }
  const serialized = serialize(result)
  return Buffer.from(serialized).toString("base64")
}
