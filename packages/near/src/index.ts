/**
 * @omni-bridge/near
 *
 * NEAR transaction builder for Omni Bridge SDK
 * Builds unsigned transactions for NEAR Protocol
 */

export { createNearBuilder, type NearBuilder, type NearBuilderConfig } from "./builder.js"
export {
  // Schemas for Borsh serialization
  BindTokenArgsSchema,
  ChainKindSchema,
  DEPOSIT,
  DeployTokenArgsSchema,
  EvmProofSchema,
  type EvmVerifyProofArgs,
  EvmVerifyProofArgsSchema,
  type FastFinTransferParams,
  type FinalizationParams,
  FinTransferArgsSchema,
  GAS,
  type InitTransferEvent,
  type LogMetadataEvent,
  type MPCSignature,
  type NearEvmProof,
  ProofKind,
  ProofKindSchema,
  type SignTransferEvent,
  type StorageDepositAction,
  StorageDepositActionSchema,
  type TransferFee,
  type TransferId,
  type WormholeVerifyProofArgs,
  WormholeVerifyProofArgsSchema,
} from "./types.js"
