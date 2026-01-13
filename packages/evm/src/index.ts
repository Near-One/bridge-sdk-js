/**
 * @omni-bridge/evm
 *
 * EVM transaction builder for Omni Bridge SDK
 * Builds unsigned transactions for Ethereum-family chains
 */

export { BRIDGE_TOKEN_FACTORY_ABI, ERC20_ABI } from "./abi.js"
export {
  createEvmBuilder,
  type EvmBuilder,
  type EvmBuilderConfig,
  type TokenMetadata,
  type TransferPayload,
} from "./builder.js"
export {
  type EvmInitTransferEvent,
  getInitTransferTopic,
  type LogEntry,
  parseInitTransferEvent,
} from "./events.js"
export { type EvmProof, getEvmProof } from "./proof.js"
