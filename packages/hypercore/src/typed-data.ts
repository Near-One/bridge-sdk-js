import {
  encodeAbiParameters,
  type Hex,
  hexToBytes,
  keccak256,
  pad,
  type TypedDataDomain,
  toHex,
} from "viem"
import type { SendToEvmWithDataAction } from "./types.js"

/**
 * EIP-712 primary type name for Hyperliquid `sendToEvmWithData` user-signed
 * actions. The colon is non-standard for EIP-712 identifiers but matches the
 * Hyperliquid wire format — the typehash is computed by hashing the full
 * encoded-type string literally, so the colon is just bytes inside the hash
 * input. See `bridge-sdk-rs/.../hypercore-bridge-client/src/signing.rs:22`.
 */
export const SEND_TO_EVM_WITH_DATA_TYPE_NAME = "HyperliquidTransaction:SendToEvmWithData"

const SEND_TO_EVM_WITH_DATA_FIELDS = [
  { name: "hyperliquidChain", type: "string" },
  { name: "token", type: "string" },
  { name: "amount", type: "string" },
  { name: "sourceDex", type: "string" },
  { name: "destinationRecipient", type: "string" },
  { name: "addressEncoding", type: "string" },
  { name: "destinationChainId", type: "uint32" },
  { name: "gasLimit", type: "uint64" },
  { name: "data", type: "bytes" },
  { name: "nonce", type: "uint64" },
] as const

const EIP712_DOMAIN_TYPE =
  "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
const HL_DOMAIN_NAME = "HyperliquidSignTransaction"
const HL_DOMAIN_VERSION = "1"
const VERIFYING_CONTRACT = "0x0000000000000000000000000000000000000000"

export interface HyperCoreTypedData {
  domain: TypedDataDomain
  types: { [SEND_TO_EVM_WITH_DATA_TYPE_NAME]: typeof SEND_TO_EVM_WITH_DATA_FIELDS }
  primaryType: typeof SEND_TO_EVM_WITH_DATA_TYPE_NAME
  message: Omit<SendToEvmWithDataAction, "type">
  /**
   * EIP-712 digest (0x19 0x01 || domainSeparator || structHash) precomputed for
   * direct signing (e.g. `viem.wallet.sign({ hash })`). Wallets that prefer the
   * structured typed-data prompt can use `domain`/`types`/`message` instead.
   */
  digest: Hex
}

export function parseSignatureChainId(signatureChainId: string): bigint {
  const stripped = signatureChainId.startsWith("0x") ? signatureChainId.slice(2) : signatureChainId
  if (!/^[0-9a-fA-F]+$/.test(stripped)) {
    throw new Error(`signatureChainId must be a hex string, got: ${signatureChainId}`)
  }
  return BigInt(`0x${stripped}`)
}

/**
 * Build the EIP-712 typed-data envelope (including precomputed digest) for a
 * Hyperliquid `sendToEvmWithData` action.
 */
export function buildSendToEvmWithDataTypedData(
  action: SendToEvmWithDataAction,
): HyperCoreTypedData {
  const chainId = parseSignatureChainId(action.signatureChainId)

  const domainSeparator = computeDomainSeparator(chainId)
  const structHash = computeStructHash(action)
  const digest = keccak256(
    new Uint8Array([0x19, 0x01, ...hexToBytes(domainSeparator), ...hexToBytes(structHash)]),
  )

  return {
    domain: {
      name: HL_DOMAIN_NAME,
      version: HL_DOMAIN_VERSION,
      chainId,
      verifyingContract: VERIFYING_CONTRACT,
    },
    types: { [SEND_TO_EVM_WITH_DATA_TYPE_NAME]: SEND_TO_EVM_WITH_DATA_FIELDS },
    primaryType: SEND_TO_EVM_WITH_DATA_TYPE_NAME,
    message: {
      hyperliquidChain: action.hyperliquidChain,
      signatureChainId: action.signatureChainId,
      token: action.token,
      amount: action.amount,
      sourceDex: action.sourceDex,
      destinationRecipient: action.destinationRecipient,
      addressEncoding: action.addressEncoding,
      destinationChainId: action.destinationChainId,
      gasLimit: action.gasLimit,
      data: action.data,
      nonce: action.nonce,
    },
    digest,
  }
}

function computeDomainSeparator(chainId: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
      ],
      [
        keccak256(toHex(EIP712_DOMAIN_TYPE)),
        keccak256(toHex(HL_DOMAIN_NAME)),
        keccak256(toHex(HL_DOMAIN_VERSION)),
        chainId,
        VERIFYING_CONTRACT,
      ],
    ),
  )
}

function computeStructHash(action: SendToEvmWithDataAction): Hex {
  const typeString = `${SEND_TO_EVM_WITH_DATA_TYPE_NAME}(${SEND_TO_EVM_WITH_DATA_FIELDS.map(
    (f) => `${f.type} ${f.name}`,
  ).join(",")})`
  const typeHash = keccak256(toHex(typeString))

  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "uint256" },
      ],
      [
        typeHash,
        keccak256(toHex(action.hyperliquidChain)),
        keccak256(toHex(action.token)),
        keccak256(toHex(action.amount)),
        keccak256(toHex(action.sourceDex)),
        keccak256(toHex(action.destinationRecipient)),
        keccak256(toHex(action.addressEncoding)),
        BigInt(action.destinationChainId),
        BigInt(action.gasLimit),
        keccak256(action.data),
        BigInt(action.nonce),
      ],
    ),
  )
}

/**
 * Recover (r, s, v) components from a 65-byte 0x-prefixed compact signature,
 * shaped for Hyperliquid's `/exchange` envelope.
 */
export function splitSignature(signature: Hex): { r: Hex; s: Hex; v: number } {
  const bytes = hexToBytes(signature)
  if (bytes.length !== 65) throw new Error(`signature must be 65 bytes, got ${bytes.length}`)
  const r = pad(toHex(bytes.slice(0, 32)), { size: 32 })
  const s = pad(toHex(bytes.slice(32, 64)), { size: 32 })
  const v = bytes[64] as number
  return { r, s, v: v < 27 ? v + 27 : v }
}
