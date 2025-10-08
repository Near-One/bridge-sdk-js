import { equalBytes } from "@noble/curves/utils.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { createBase58check } from "@scure/base"

const ZCASH_NETWORKS = {
  mainnet: {
    name: "mainnet",
    pubKeyHash: new Uint8Array([0x1c, 0xb8]), // t1
    scriptHash: new Uint8Array([0x1c, 0xbd]), // t3
  },
  testnet: {
    name: "testnet",
    pubKeyHash: new Uint8Array([0x1d, 0x25]), // tm
    scriptHash: new Uint8Array([0x1c, 0xba]), // t2
  },
}

const base58check = createBase58check(sha256)

function decodeZcashAddress(address: string) {
  const data = base58check.decode(address)
  if (data.length !== 22) throw new Error("Invalid Zcash address length")

  const prefix = data.slice(0, 2)
  const hash = data.slice(2)

  // Check all networks and address types
  for (const [networkName, network] of Object.entries(ZCASH_NETWORKS)) {
    if (equalBytes(prefix, network.pubKeyHash)) {
      return { type: "pkh", hash, network: networkName }
    }
    if (equalBytes(prefix, network.scriptHash)) {
      return { type: "sh", hash, network: networkName }
    }
  }

  throw new Error(`Unknown Zcash address prefix: ${address}`)
}

function createZcashScript(addressInfo: { type: string; hash: Uint8Array }): string {
  const hashHex = Array.from(addressInfo.hash)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")

  switch (addressInfo.type) {
    case "pkh":
      return `76a914${hashHex}88ac`
    case "sh":
      return `a914${hashHex}87`
    default:
      throw new Error(`Unsupported address type: ${addressInfo.type}`)
  }
}

// Now your getScript function auto-detects network
export function getZcashScript(address: string): string {
  const addressInfo = decodeZcashAddress(address)
  console.log(`Detected ${addressInfo.network} ${addressInfo.type} address`)
  return createZcashScript(addressInfo)
}
