/**
 * Helpers for bridging into Hyperliquid (HyperCore L1) via HyperEVM.
 */

import { ChainKind, type OmniAddress, type TransferParams } from "../types.js"
import { omniAddress } from "./address.js"

/**
 * Marker placed in `TransferParams.message` to signal a Hyperliquid-bound
 * transfer. The on-chain `HlBridgeToken` only checks whether the message is
 * non-empty to choose the 3-arg `mint` path (which forwards the minted balance
 * to the configured system address so HyperCore credits it to the user's
 * spot balance). The content itself is ignored — we use a self-describing
 * string so it's clear in logs and the indexer.
 */
export const HYPERLIQUID_MESSAGE = "hypercore"

/**
 * Build `TransferParams` for a NEAR → Hyperliquid (HyperCore) transfer.
 *
 * The destination is HyperEVM — HyperCore uses the same 20-byte EVM addresses,
 * so `hypercoreRecipient` is the user's HyperEVM/HyperCore address.
 *
 * @param params.token         NEAR-side token to send (e.g. `near:wrap.near`).
 * @param params.amount        Transfer amount (origin decimals).
 * @param params.fee           Bridge fee (origin decimals). Defaults to 0n.
 * @param params.nativeFee     Native NEAR fee. Defaults to 0n.
 * @param params.sender        NEAR sender (e.g. `near:alice.near`).
 * @param params.hypercoreRecipient
 *   Recipient's 20-byte EVM-style address on HyperEVM/HyperCore (`0x…`).
 */
export function buildHyperliquidTransferParams(params: {
  token: OmniAddress
  amount: bigint
  sender: OmniAddress
  hypercoreRecipient: string
  fee?: bigint
  nativeFee?: bigint
}): TransferParams {
  return {
    token: params.token,
    amount: params.amount,
    fee: params.fee ?? 0n,
    nativeFee: params.nativeFee ?? 0n,
    sender: params.sender,
    recipient: omniAddress(ChainKind.HyperEvm, params.hypercoreRecipient),
    message: HYPERLIQUID_MESSAGE,
  }
}
