import { b } from "@zorsh/zorsh"
import { sha256 } from "@noble/hashes/sha256"
import type { AccountId, Fee, OmniAddress, U128 } from "../types/common.js"
import type { OmniTransferMessage } from "../types/omni.js"

/**
 * Represents a transfer message used for calculating storage account ID.
 * This should match the Rust struct TransferMessageStorageAccount.
 */
export interface TransferMessage {
  /** Token address */
  token: OmniAddress
  /** Transfer amount */
  amount: U128
  /** Recipient address */
  recipient: OmniAddress
  /** Transfer fee */
  fee: Fee
  /** Sender address */
  sender: OmniAddress
  /** Message string */
  msg: string
}

/**
 * Borsh serialization schema for TransferMessageStorageAccount.
 * This should match the Rust struct TransferMessageStorageAccount fields.
 */
export const TransferMessageStorageAccountSchema = b.struct({
  token: b.string(),
  amount: b.u128(),
  recipient: b.string(),
  fee: b.u128(),
  sender: b.string(),
  msg: b.string(),
})

/**
 * Calculates storage account ID from transfer message data.
 * 
 * This function replicates the Rust logic:
 * 1. Serialize the transfer message using borsh
 * 2. Calculate SHA256 hash of the serialized data
 * 3. Convert hash to hex string
 * 4. Return the hex string as AccountId
 * 
 * @param transferMessage - The transfer message data
 * @returns The calculated storage account ID
 */
export function calculateStorageAccountId(transferMessage: TransferMessage): AccountId {
  // Serialize the transfer message using borsh
  const serializedData = TransferMessageStorageAccountSchema.serialize(transferMessage)
  
  // Calculate SHA256 hash of the serialized data
  const hash = sha256(serializedData)
  
  // Convert hash to hex string (lowercase)
  const hexString = Array.from(hash)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
  
  return hexString as AccountId
}

/**
 * Calculates storage account ID from an OmniTransferMessage with sender information.
 * 
 * This is a convenience function that accepts the common OmniTransferMessage format
 * along with a sender address and converts it to the format needed for storage account ID calculation.
 * 
 * @param transfer - The omni transfer message
 * @param sender - The sender address
 * @returns The calculated storage account ID
 */
export function calculateStorageAccountIdFromOmniTransfer(
  transfer: OmniTransferMessage,
  sender: OmniAddress
): AccountId {
  const transferMessage: TransferMessage = {
    token: transfer.tokenAddress,
    amount: transfer.amount,
    recipient: transfer.recipient,
    fee: transfer.fee,
    sender: sender,
    msg: transfer.message || "",
  }
  
  return calculateStorageAccountId(transferMessage)
}