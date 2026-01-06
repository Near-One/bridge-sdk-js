/**
 * Shims for converting NearUnsignedTransaction to library-specific types
 */

import type { NearUnsignedTransaction } from "@omni-bridge/core"
import type { Near } from "near-kit"
import { Amount, Gas } from "near-kit"

/**
 * Convert NearUnsignedTransaction to a near-kit TransactionBuilder
 *
 * near-kit's TransactionBuilder handles nonce, blockHash, and signing automatically.
 * The returned builder can be sent with `.send()` or built with `.build()`.
 *
 * @param near - Configured Near instance from near-kit
 * @param unsigned - Library-agnostic unsigned transaction from the SDK
 * @returns A near-kit TransactionBuilder ready to send
 *
 * @example
 * ```typescript
 * import { Near } from 'near-kit'
 * import { createNearBuilder, toNearKitTransaction } from '@omni-bridge/near'
 *
 * const near = new Near({ network: 'mainnet', privateKey: '...' })
 * const builder = createNearBuilder({ network: 'mainnet' })
 *
 * const unsigned = builder.buildTransfer(validated, 'alice.near')
 * const tx = toNearKitTransaction(near, unsigned)
 * await tx.send()
 * ```
 */
export function toNearKitTransaction(near: Near, unsigned: NearUnsignedTransaction) {
  let tx = near.transaction(unsigned.signerId)

  for (const action of unsigned.actions) {
    if (action.type === "FunctionCall") {
      tx = tx.functionCall(unsigned.receiverId, action.methodName, action.args, {
        gas: Gas.Tgas(Number(action.gas / 1_000_000_000_000n)),
        attachedDeposit: Amount.yocto(action.deposit),
      })
    }
  }

  return tx
}
