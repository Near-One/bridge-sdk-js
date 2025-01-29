import { serialize, wormhole } from "@wormhole-foundation/sdk"
import evm from "@wormhole-foundation/sdk/evm"
import solana from "@wormhole-foundation/sdk/solana"

// biome-ignore lint/correctness/noUnusedVariables: This will be used later
async function getVaaForTransfer(txHash: string) {
  const wh = await wormhole("Mainnet", [evm, solana])
  const result = await wh.getVaa(txHash, "Uint8Array", 60_000)
  if (!result) {
    throw new Error("No VAA found")
  }
  const serialized = serialize(result)
  return Buffer.from(serialized).toString("base64")
}

//getVaaForTransfer("0x260f282ac5fab934f7fb0e19b502bcb7e7261d715ec70b97282f04bd8f506225")
