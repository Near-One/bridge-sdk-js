/**
 * @omni-bridge/aptos
 *
 * Aptos transaction builder for Omni Bridge SDK
 * Builds entry-function payloads for the `omni_bridge` Move package,
 * compatible with @aptos-labs/ts-sdk `InputEntryFunctionData`
 */

export {
  type AptosBuilder,
  type AptosBuilderConfig,
  type AptosFunctionPayload,
  type AptosTokenMetadata,
  type AptosTransferPayload,
  createAptosBuilder,
} from "./builder.js"

export {
  aptosAddressToBytes,
  deriveBridgedTokenAddress as deriveAptosBridgedTokenAddress,
  deriveBridgeObjectAddress as deriveAptosBridgeObjectAddress,
  normalizeAptosAddress,
  normalizeEventData as normalizeAptosEventData,
} from "./encoding.js"

export {
  type AptosEventLog,
  type AptosInitTransferEvent,
  getDeployTokenLog as getAptosDeployTokenLog,
  getEventLog as getAptosEventLog,
  getFinTransferLog as getAptosFinTransferLog,
  getInitTransferEvent as getAptosInitTransferEvent,
  getInitTransferLog as getAptosInitTransferLog,
  isTransferFinalised as isAptosTransferFinalised,
  parseInitTransferEvent as parseAptosInitTransferEvent,
} from "./events.js"
