/**
 * Storage account ID calculation for NEAR bridge transfers
 */

import { sha256 } from "@noble/hashes/sha2.js"
import { base58, hex } from "@scure/base"
import { b } from "@zorsh/zorsh"

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
  const chain = parts[0]
  const address = parts[1]
  if (!address) {
    throw new Error(`Invalid token address format: ${token}`)
  }
  const decodeHex = (addr: string) => Array.from(hex.decode(addr.slice(2)))
  const decodeBase58 = (addr: string) => Array.from(base58.decode(addr))

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
    case "btc":
      return { Btc: address }
    case "zcash":
      return { Zcash: address }
    default:
      throw new Error(`Unknown chain: ${chain}`)
  }
}
