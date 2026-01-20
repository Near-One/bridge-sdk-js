/**
 * Shims for converting NearUnsignedTransaction to library-specific types
 */

import type { NearUnsignedTransaction } from "@omni-bridge/core"
import type { Near } from "near-kit"
import { Amount, Gas } from "near-kit"

/**
 * Plain object representation of a NEAR action for use with near-api-js.
 * These serialize identically to @near-js/transactions Action class instances.
 */
export type NearApiJsAction =
  | { functionCall: { methodName: string; args: Uint8Array; gas: bigint; deposit: bigint } }
  | { transfer: { deposit: bigint } }
  | { createAccount: Record<string, never> }
  | { deleteAccount: { beneficiaryId: string } }

/**
 * Convert NearUnsignedTransaction to a near-kit TransactionBuilder.
 *
 * near-kit handles nonce, blockHash, and signing automatically.
 * The returned builder can be sent with `.send()` or built with `.build()`.
 *
 * @param near - Configured Near instance from near-kit
 * @param unsigned - Library-agnostic unsigned transaction from the SDK
 * @returns A near-kit TransactionBuilder ready to send
 *
 * @example
 * ```typescript
 * const near = new Near({ network: 'mainnet', privateKey: '...' })
 * const unsigned = builder.buildTransfer(validated, 'alice.near')
 * const result = await toNearKitTransaction(near, unsigned).send()
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

/**
 * Convert NearUnsignedTransaction actions to plain objects compatible with near-api-js.
 *
 * Returns plain objects that serialize identically to @near-js/transactions Action
 * class instances. Use with Account.signAndSendTransaction() - cast to Action[] if
 * TypeScript requires it.
 *
 * @param unsigned - Library-agnostic unsigned transaction from the SDK
 * @returns Array of plain action objects compatible with near-api-js
 *
 * @example
 * ```typescript
 * import type { Action } from 'near-api-js'
 * import { Account } from 'near-api-js'
 *
 * const account = new Account(...)
 * const actions = toNearApiJsActions(unsigned)
 *
 * // Cast to Action[] for TypeScript compatibility
 * const result = await account.signAndSendTransaction({
 *   receiverId: unsigned.receiverId,
 *   actions: actions as Action[],
 * })
 * ```
 */
export function toNearApiJsActions(unsigned: NearUnsignedTransaction): NearApiJsAction[] {
  return unsigned.actions.map((action) => {
    if (action.type === "FunctionCall") {
      return {
        functionCall: {
          methodName: action.methodName,
          args: action.args,
          gas: action.gas,
          deposit: action.deposit,
        },
      }
    }
    throw new Error(`Unsupported action type: ${action.type}`)
  })
}
