/**
 * @omni-bridge/core
 *
 * Core types, validation, configuration, and API client for Omni Bridge SDK
 */

// API client
export {
  type ApiFeeResponse,
  BridgeAPI,
  type BridgeAPIConfig,
  type Chain,
  type PostAction,
  type Transfer,
  type TransferStatus,
  type UtxoChainParam,
  type UtxoDepositAddressResponse,
} from "./api.js"
// Bridge factory
export {
  type Bridge,
  type BridgeConfig,
  createBridge,
  type UtxoDepositOptions,
  type UtxoDepositResult,
} from "./bridge.js"

// Config
export {
  API_BASE_URLS,
  type BtcAddresses,
  type ChainAddresses,
  EVM_CHAIN_IDS,
  type EvmAddresses,
  getAddresses,
  type NearAddresses,
  type SolanaAddresses,
  type ZcashAddresses,
} from "./config.js"
// Errors
export {
  OmniBridgeError,
  ProofError,
  RpcError,
  ValidationError,
  type ValidationErrorCode,
} from "./errors.js"
// Types
export {
  type AccountId,
  type BtcUnsignedTransaction,
  ChainKind,
  type ChainPrefix,
  type EvmUnsignedTransaction,
  type Fee,
  type NearAction,
  type NearUnsignedTransaction,
  type Network,
  type Nonce,
  type OmniAddress,
  type SolanaInstruction,
  type SolanaUnsignedTransaction,
  type TokenDecimals,
  type TransferParams,
  type U128,
  type UTXO,
  type UtxoChain,
  type ValidatedTransfer,
} from "./types.js"

// Address utilities
export {
  type EvmChainKind,
  getAddress,
  getChain,
  getChainPrefix,
  isEvmChain,
  omniAddress,
} from "./utils/address.js"

// Decimal utilities
export {
  getMinimumTransferableAmount,
  normalizeAmount,
  validateTransferAmount,
  verifyTransferAmount,
} from "./utils/decimals.js"

// Wormhole VAA utilities
export { getVaa, getWormholeVaa, type WormholeNetwork } from "./wormhole.js"
