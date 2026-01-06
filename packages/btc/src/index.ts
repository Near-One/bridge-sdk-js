/**
 * @omni-bridge/btc
 *
 * Bitcoin/UTXO transaction builder for Omni Bridge SDK
 * Builds withdrawal plans, generates proofs, and handles UTXO selection
 */

// Builder
export {
  type BtcBuilder,
  createBtcBuilder,
  linearFeeCalculator,
} from "./builder.js"

// RPC
export { buildBitcoinMerkleProof, UtxoRpcClient } from "./rpc.js"

// Types
export type {
  BtcBuilderConfig,
  BtcDepositProof,
  BtcMerkleProof,
  BtcWithdrawalPlan,
  FeeCalculator,
  LinearFeeParameters,
  NormalizedUTXO,
  UTXO,
  UtxoChainType,
  UtxoPlanOverrides,
  UtxoRpcConfig,
  UtxoSelectionOptions,
  UtxoSelectionResult,
} from "./types.js"
