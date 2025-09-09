import { sha256 } from "@noble/hashes/sha256"
import { b } from "@zorsh/zorsh"
import type { AccountId, OmniAddress } from "../types/common.js"
import type { OmniTransferMessage } from "../types/omni.js"

/**
 * Internal transfer message structure that matches the Rust TransferMessageStorageAccount.
 * Extends OmniTransferMessage with sender information.
 */
export interface StorageTransferMessage extends OmniTransferMessage {
  /** Sender address */
  sender: OmniAddress
}

/**
 * Borsh serialization schema for TransferMessageStorageAccount.
 * This should match the Rust struct TransferMessageStorageAccount fields.
 */
const storageTransferSchema = b.struct({
  token: b.string(),
  amount: b.u128(),
  recipient: b.string(),
  fee: b.u128(),
  sender: b.string(),
  msg: b.string(),
})

/**
 * Calculates storage account ID from transfer data.
 *
 * This function replicates the Rust logic:
 * 1. Serialize the transfer message using borsh
 * 2. Calculate SHA256 hash of the serialized data
 * 3. Convert hash to hex string
 *
 * @param transfer - The transfer message with sender
 * @returns The calculated storage account ID (64-character hex string)
 */
export function getStorageAccountId(transfer: StorageTransferMessage): AccountId {
  // Map to the exact structure expected by the Rust implementation
  const transferData = {
    token: transfer.tokenAddress,
    amount: transfer.amount,
    recipient: transfer.recipient,
    fee: transfer.fee,
    sender: transfer.sender,
    msg: transfer.message || "",
  }

  // Serialize the transfer message using borsh
  const serializedData = storageTransferSchema.serialize(transferData)

  // Calculate SHA256 hash of the serialized data
  const hash = sha256(serializedData)

  // Convert hash to hex string (lowercase)
  const hexString = Array.from(hash)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")

  return hexString as AccountId
}

/**
 * Calculates storage account ID from an OmniTransferMessage and sender.
 *
 * @param transfer - The omni transfer message
 * @param sender - The sender address
 * @returns The calculated storage account ID
 */
export function getStorageAccountIdFromTransfer(
  transfer: OmniTransferMessage,
  sender: OmniAddress,
): AccountId {
  return getStorageAccountId({ ...transfer, sender })
}
