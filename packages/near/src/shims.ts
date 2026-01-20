/**
 * Shims for converting NearUnsignedTransaction to library-specific types
 */

import type { Account } from "@near-js/accounts"
import { type Action, actionCreators } from "@near-js/transactions"
import type { NearUnsignedTransaction } from "@omni-bridge/core"
import type { Near } from "near-kit"
import { Amount, Gas } from "near-kit"

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
 * Convert NearUnsignedTransaction actions to @near-js/transactions Action array.
 *
 * Use this with @near-js/accounts Account.signAndSendTransaction() which
 * handles nonce, blockHash, and signing automatically.
 *
 * @param unsigned - Library-agnostic unsigned transaction from the SDK
 * @returns Array of Action objects for use with @near-js/accounts
 *
 * @example
 * ```typescript
 * import { Account } from '@near-js/accounts'
 * import { JsonRpcProvider } from '@near-js/providers'
 * import { InMemoryKeyStore } from '@near-js/keystores'
 * import { KeyPair } from '@near-js/crypto'
 * import { InMemorySigner } from '@near-js/signers'
 *
 * const keyStore = new InMemoryKeyStore()
 * await keyStore.setKey('mainnet', 'alice.near', KeyPair.fromString('ed25519:...'))
 * const provider = new JsonRpcProvider({ url: 'https://rpc.mainnet.near.org' })
 * const signer = new InMemorySigner(keyStore)
 * const account = new Account({ accountId: 'alice.near', provider, signer })
 *
 * const actions = toNearApiJsActions(unsigned)
 * const result = await account.signAndSendTransaction({
 *   receiverId: unsigned.receiverId,
 *   actions,
 * })
 * ```
 */
export function toNearApiJsActions(unsigned: NearUnsignedTransaction): Action[] {
  return unsigned.actions.map((action) => {
    if (action.type === "FunctionCall") {
      return actionCreators.functionCall(action.methodName, action.args, action.gas, action.deposit)
    }
    throw new Error(`Unsupported action type: ${action.type}`)
  })
}

/**
 * Send a NearUnsignedTransaction using a @near-js/accounts Account.
 *
 * This is a convenience wrapper that converts the unsigned transaction
 * and sends it in one call. The Account handles nonce, blockHash, and signing.
 *
 * @param account - Account instance from @near-js/accounts (with signer configured)
 * @param unsigned - Library-agnostic unsigned transaction from the SDK
 * @returns Promise resolving to the transaction execution outcome
 *
 * @example
 * ```typescript
 * import { Account } from '@near-js/accounts'
 * import { JsonRpcProvider } from '@near-js/providers'
 * import { InMemoryKeyStore } from '@near-js/keystores'
 * import { KeyPair } from '@near-js/crypto'
 * import { InMemorySigner } from '@near-js/signers'
 *
 * const keyStore = new InMemoryKeyStore()
 * await keyStore.setKey('mainnet', 'alice.near', KeyPair.fromString('ed25519:...'))
 * const provider = new JsonRpcProvider({ url: 'https://rpc.mainnet.near.org' })
 * const signer = new InMemorySigner(keyStore)
 * const account = new Account({ accountId: 'alice.near', provider, signer })
 *
 * const unsigned = builder.buildTransfer(validated, 'alice.near')
 * const result = await sendWithNearApiJs(account, unsigned)
 * console.log('Transaction hash:', result.transaction.hash)
 * ```
 */
export async function sendWithNearApiJs(account: Account, unsigned: NearUnsignedTransaction) {
  const actions = toNearApiJsActions(unsigned)
  return account.signAndSendTransaction({
    receiverId: unsigned.receiverId,
    actions,
  })
}
