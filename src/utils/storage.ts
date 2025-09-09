import { sha256 } from "@noble/hashes/sha2"
import { hex } from "@scure/base"
import { b } from "@zorsh/zorsh"
import type { AccountId } from "../types/common.js"

/**
 * Borsh schema for TransferMessageStorageAccount
 * This matches the exact field order and types from the Rust implementation
 */
const TransferMessageStorageAccountSchema = b.struct({
  token: b.string(),
  amount: b.u128(),
  recipient: b.string(),
  fee: b.struct({
    fee: b.u128(),
    native_fee: b.u128(),
  }),
  sender: b.string(),
  msg: b.string(),
})

/**
 * Transfer message type for storage account calculation
 */
export type TransferMessageForStorage = b.infer<typeof TransferMessageStorageAccountSchema>

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
export function calculateStorageAccountId(transferMessage: TransferMessageForStorage): AccountId {
  const serializedData = TransferMessageStorageAccountSchema.serialize(transferMessage)
  const hash = sha256(serializedData)
  return hex.encode(hash)
}
