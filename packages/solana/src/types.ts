/**
 * Solana-specific types for Omni Bridge SDK
 */

import type { ChainKind } from "@omni-bridge/core"
import type BN from "bn.js"

/**
 * Token metadata for deploy token operations
 */
export interface SolanaTokenMetadata {
  token: string
  name: string
  symbol: string
  decimals: number
}

/**
 * Transfer ID for cross-chain transfers (Solana-specific)
 */
export interface SolanaTransferId {
  originChain: ChainKind | number
  originNonce: bigint | BN
}

/**
 * Payload for finalizing transfers
 */
export interface SolanaTransferMessagePayload {
  destination_nonce: bigint | number
  transfer_id: {
    origin_chain: ChainKind | string
    origin_nonce: bigint | string
  }
  token_address: string
  amount: bigint | string
  recipient: string
  fee_recipient?: string | null
}

/**
 * MPC signature interface for signed operations
 */
export interface SolanaMPCSignature {
  toBytes(): Uint8Array
}

/**
 * Deposit payload used internally for finalize transfer
 */
export interface SolanaDepositPayload {
  destinationNonce: BN
  transferId: {
    originChain: number
    originNonce: BN
  }
  amount: BN
  feeRecipient: string
}
