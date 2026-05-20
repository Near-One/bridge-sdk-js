/**
 * Storage account ID calculation for NEAR bridge transfers
 */

import { sha256 } from "@noble/hashes/sha2.js"
import type { ChainPrefix } from "@omni-bridge/core"
import { base58, hex } from "@scure/base"
import { b } from "@zorsh/zorsh"

// Variant order must match `omni_types::OmniAddress` in the Rust omni-bridge
// repo — borsh enum discriminants are positional. `HyperEvm` corresponds to
// the JSON/API chain name `HlEvm` and the address prefix `hlevm:`.
const OmniAddressSchema = b.enum({
  Eth: b.array(b.u8(), 20),
  Near: b.string(),
  Sol: b.array(b.u8(), 32),
  Arb: b.array(b.u8(), 20),
  Base: b.array(b.u8(), 20),
  Bnb: b.array(b.u8(), 20),
  Btc: b.string(),
  Zcash: b.string(),
  Pol: b.array(b.u8(), 20),
  HyperEvm: b.array(b.u8(), 20),
  Strk: b.array(b.u8(), 32),
  Abs: b.array(b.u8(), 20),
})

/**
 * Borsh schema for TransferMessageStorageAccount
 * This matches the exact field order and types from the Rust implementation
 */
const TransferMessageStorageAccountSchema = b.struct({
  token: OmniAddressSchema,
  amount: b.u128(),
  recipient: OmniAddressSchema,
  fee: b.struct({
    fee: b.u128(),
    native_fee: b.u128(),
  }),
  sender: OmniAddressSchema,
  msg: b.string(),
})

/**
 * Transfer message type for storage account calculation
 */
export type TransferMessageForStorage = {
  token: string
  amount: bigint
  recipient: string
  fee: {
    fee: bigint
    native_fee: bigint
  }
  sender: string
  msg: string
}

/**
 * Calculates the storage account ID for a transfer message
 *
 * This function replicates the Rust implementation:
 * 1. Serializes the transfer message using Borsh
 * 2. Hashes the serialized data with SHA256
 * 3. Converts the hash to hex to create an implicit NEAR account ID
 *
 * @param transferMessage - The transfer message data with bigint amounts
 * @returns The calculated storage account ID as a hex string
 */
export function calculateStorageAccountId(transferMessage: TransferMessageForStorage): string {
  const serializedData = TransferMessageStorageAccountSchema.serialize({
    token: parseOmniAddress(transferMessage.token),
    amount: transferMessage.amount,
    recipient: parseOmniAddress(transferMessage.recipient),
    fee: {
      fee: transferMessage.fee.fee,
      native_fee: transferMessage.fee.native_fee,
    },
    sender: parseOmniAddress(transferMessage.sender),
    msg: transferMessage.msg,
  })

  const hash = sha256(serializedData)
  return hex.encode(hash)
}

function parseOmniAddress(token: string) {
  const parts = token.split(":", 2)
  // Cast through ChainPrefix so the switch below is exhaustive at compile
  // time — adding a new variant to ChainPrefix without a case here will
  // trip the `never` assignment in the default branch.
  const chain = parts[0] as ChainPrefix
  const address = parts[1]
  if (!address) {
    throw new Error(`Invalid token address format: ${token}`)
  }
  const decodeHex = (addr: string) => Array.from(hex.decode(addr.slice(2)))
  const decodeBase58 = (addr: string) => Array.from(base58.decode(addr))
  // Starknet addresses are felts and often arrive with leading zero bytes
  // stripped (e.g. `strk:0x1234`). The borsh schema needs exactly 32 bytes,
  // so left-pad to 64 hex chars before decoding.
  const decodeStrk = (addr: string) => {
    const stripped = addr.startsWith("0x") || addr.startsWith("0X") ? addr.slice(2) : addr
    if (stripped.length > 64) {
      throw new Error(`Starknet address exceeds 32 bytes: ${addr}`)
    }
    return Array.from(hex.decode(stripped.padStart(64, "0")))
  }

  switch (chain) {
    case "eth":
      return { Eth: decodeHex(address) }
    case "near":
      return { Near: address }
    case "sol":
      return { Sol: decodeBase58(address) }
    case "arb":
      return { Arb: decodeHex(address) }
    case "base":
      return { Base: decodeHex(address) }
    case "bnb":
      return { Bnb: decodeHex(address) }
    case "pol":
      return { Pol: decodeHex(address) }
    case "hlevm":
      return { HyperEvm: decodeHex(address) }
    case "btc":
      return { Btc: address }
    case "zcash":
      return { Zcash: address }
    case "strk":
      return { Strk: decodeStrk(address) }
    case "abs":
      return { Abs: decodeHex(address) }
    default: {
      const _exhaustive: never = chain
      throw new Error(`Unknown chain: ${_exhaustive as string}`)
    }
  }
}
