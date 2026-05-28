import type { OmniAddress } from "@omni-bridge/core"
import { type Address, concatHex, encodeAbiParameters, type Hex } from "viem"

export const ACTION_TRANSFER = 0x00
export const ACTION_INIT_TRANSFER = 0x01

/**
 * Encode the `data` payload for `HlBridgeToken` `ACTION_TRANSFER`: release
 * `amount` from the system-address pool to `recipient` on HyperEVM.
 *
 * Layout: `0x00 || abi.encode(address recipient)`.
 */
export function encodeTransferAction(recipient: Address): Hex {
  // viem's `encodeAbiParameters` rejects non-EIP-55 mixed-case addresses; the
  // on-chain encoding only cares about the 20 raw bytes, so lowercase before
  // encoding to accept any caller-provided form.
  const normalized = recipient.toLowerCase() as Address
  return concatHex(["0x00", encodeAbiParameters([{ type: "address" }], [normalized])])
}

/**
 * Encode the `data` payload for `HlBridgeToken` `ACTION_INIT_TRANSFER`: bridge
 * `amount` via `OmniBridge.initTransfer` to `recipient` with `fee`.
 *
 * Layout: `0x01 || abi.encode(uint128 fee, string recipient, string message)`.
 */
export function encodeInitTransferAction(
  fee: bigint,
  recipient: OmniAddress,
  message: string,
): Hex {
  return concatHex([
    "0x01",
    encodeAbiParameters(
      [{ type: "uint128" }, { type: "string" }, { type: "string" }],
      [fee, recipient, message],
    ),
  ])
}
