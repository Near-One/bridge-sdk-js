/**
 * Helpers for bridging into Hyperliquid (HyperCore L1) via HyperEVM.
 */

import { ChainKind, type OmniAddress, type TransferParams } from "../types.js"
import { omniAddress } from "./address.js"

/**
 * `TransferParams.message` value that routes the destination-side
 * `OmniBridge.finTransfer` through the 3-arg `mint(addr, amt, bytes)` path
 * on `HlBridgeToken`. The bridge contract parses the message as JSON with a
 * `DestHexMsg` field whose value is the hex-encoded destination directive;
 * `"636F7265"` is ASCII `"core"`, which `HlBridgeToken` interprets as
 * "redirect the mint to the system-address pool so HyperCore credits the
 * user's spot balance."
 */
export const HYPERLIQUID_MESSAGE = '{"DestHexMsg":"636F7265"}'

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
