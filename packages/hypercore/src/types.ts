import type { Hex } from "viem"

/**
 * JSON body of a `sendToEvmWithData` Hyperliquid Core action.
 *
 * Field order matches the EIP-712 type list; reordering will change the
 * type hash and invalidate signatures.
 */
export interface SendToEvmWithDataAction {
  type: "sendToEvmWithData"
  hyperliquidChain: "Mainnet" | "Testnet"
  signatureChainId: string
  token: string
  amount: string
  sourceDex: "spot"
  destinationRecipient: string
  addressEncoding: "hex"
  destinationChainId: number
  gasLimit: number
  data: Hex
  nonce: number
}

export interface ActionSignature {
  r: Hex
  s: Hex
  v: number
}

/**
 * Envelope POSTed to Hyperliquid's `/exchange` endpoint.
 */
export interface ExchangeEnvelope {
  action: SendToEvmWithDataAction
  nonce: number
  signature: ActionSignature
}
