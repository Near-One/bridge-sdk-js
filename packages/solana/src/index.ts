/**
 * @omni-bridge/solana
 *
 * Solana transaction builder for Omni Bridge SDK
 * Builds unsigned transaction instructions for Solana
 */

export {
  createSolanaBuilder,
  type SolanaBuilder,
  type SolanaBuilderConfig,
} from "./builder.js"

export type { BridgeTokenFactory } from "./idl.js"

export type {
  SolanaDepositPayload,
  SolanaMPCSignature,
  SolanaTokenMetadata,
  SolanaTransferId,
  SolanaTransferMessagePayload,
} from "./types.js"
