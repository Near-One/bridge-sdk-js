/**
 * @omni-bridge/near
 *
 * NEAR transaction builder for Omni Bridge SDK
 * Builds unsigned transactions for NEAR Protocol
 */

export { createNearBuilder, type NearBuilder, type NearBuilderConfig } from "./builder.js"
export {
  sendWithNearApiJs,
  toNearApiJsActions,
  toNearKitTransaction,
} from "./shims.js"
export {
  calculateStorageAccountId,
  type TransferMessageForStorage,
} from "./storage.js"
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
  MPCSignature,
  type MPCSignatureRaw,
  type NearEvmProof,
  ProofKind,
  ProofKindSchema,
  type SignTransferEvent,
  type StorageDepositAction,
  StorageDepositActionSchema,
  type TransferFee,
  type TransferId,
  // UTXO types
  type UtxoBridgeFee,
  type UtxoConnectorConfig,
  type UtxoDepositFinalizationParams,
  type UtxoDepositMsg,
  type UtxoPostAction,
  type UtxoWithdrawalInitParams,
  type UtxoWithdrawalOutput,
  type UtxoWithdrawalVerifyParams,
  type WormholeVerifyProofArgs,
  WormholeVerifyProofArgsSchema,
} from "./types.js"
