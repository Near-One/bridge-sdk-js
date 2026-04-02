/**
 * Starknet event parsing for Omni Bridge
 *
 * Extracts and parses bridge events from Starknet transaction receipts.
 * Matches the Rust bridge-sdk-rs StarknetBridgeClient event parsing logic.
 */

import { hash, type RpcProvider } from "starknet"
import { decodeByteArray } from "./encoding.js"

/**
 * Parsed InitTransfer event data.
 */
export interface StarknetInitTransferEvent {
  sender: bigint
  tokenAddress: bigint
  originNonce: bigint
  amount: bigint
  fee: bigint
  nativeFee: bigint
  recipient: string
  message: string
}

/**
 * Raw Starknet event log with full metadata for MPC proof construction.
 */
export interface StarknetEventLog {
  fromAddress: bigint
  keys: bigint[]
  data: bigint[]
  blockHash: bigint
  blockNumber: number
  logIndex: number
}

/**
 * Starknet selector for "InitTransfer" event.
 *
 * This is starknet_keccak("InitTransfer") — the same as selector!("InitTransfer") in Rust.
 */
export function getInitTransferSelector(): bigint {
  return selectorFromName("InitTransfer")
}

/**
 * Compute a Starknet selector from a function/event name.
 * This is starknet_keccak(name) — keccak256 masked to 250 bits.
 */
function selectorFromName(name: string): bigint {
  return BigInt(hash.getSelectorFromName(name))
}

/**
 * Extract a specific event log from a Starknet transaction receipt.
 */
export async function getEventLog(
  provider: RpcProvider,
  txHash: string,
  eventName: string,
): Promise<StarknetEventLog> {
  const receipt = await provider.getTransactionReceipt(txHash)

  if (!("events" in receipt)) {
    throw new Error("Unexpected receipt type — no events field")
  }

  const eventSelector = selectorFromName(eventName)

  const events = receipt.events
  let foundIndex = -1
  let foundEvent: (typeof events)[number] | undefined

  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    if (e && e.keys.length > 0) {
      const firstKey = e.keys[0]
      if (firstKey && BigInt(firstKey) === eventSelector) {
        foundIndex = i
        foundEvent = e
        break
      }
    }
  }

  if (foundIndex === -1 || !foundEvent) {
    throw new Error(`${eventName} event not found in receipt for tx ${txHash}`)
  }

  let blockHash: bigint
  let blockNumber: number

  if ("block_hash" in receipt && "block_number" in receipt) {
    blockHash = BigInt(receipt.block_hash as string)
    blockNumber = receipt.block_number as number
  } else {
    throw new Error("Transaction is still pending (no block info)")
  }

  return {
    fromAddress: BigInt(foundEvent.from_address),
    keys: foundEvent.keys.map((k: string) => BigInt(k)),
    data: foundEvent.data.map((d: string) => BigInt(d)),
    blockHash,
    blockNumber,
    logIndex: foundIndex,
  }
}

/**
 * Get the InitTransfer event log from a transaction receipt.
 */
export async function getInitTransferLog(
  provider: RpcProvider,
  txHash: string,
): Promise<StarknetEventLog> {
  return getEventLog(provider, txHash, "InitTransfer")
}

/**
 * Get the DeployToken event log from a transaction receipt.
 */
export async function getDeployTokenLog(
  provider: RpcProvider,
  txHash: string,
): Promise<StarknetEventLog> {
  return getEventLog(provider, txHash, "DeployToken")
}

/**
 * Get the FinTransfer event log from a transaction receipt.
 */
export async function getFinTransferLog(
  provider: RpcProvider,
  txHash: string,
): Promise<StarknetEventLog> {
  return getEventLog(provider, txHash, "FinTransfer")
}

/**
 * Parse an InitTransfer event from its raw event log.
 *
 * Event layout (from contract):
 *   keys: [selector, sender, token_address, origin_nonce]
 *   data: [amount, fee, native_fee, ...recipient_bytearray, ...message_bytearray]
 */
export function parseInitTransferEvent(log: StarknetEventLog): StarknetInitTransferEvent {
  if (log.keys.length < 4) {
    throw new Error("InitTransfer event has too few keys")
  }
  if (log.data.length < 3) {
    throw new Error("InitTransfer event has too few data fields")
  }

  const sender = log.keys[1]
  const tokenAddress = log.keys[2]
  const originNonce = log.keys[3]
  const amount = log.data[0]
  const fee = log.data[1]
  const nativeFee = log.data[2]

  if (
    sender === undefined ||
    tokenAddress === undefined ||
    originNonce === undefined ||
    amount === undefined ||
    fee === undefined ||
    nativeFee === undefined
  ) {
    throw new Error("InitTransfer event has missing fields")
  }

  // Data fields after the first 3 are ByteArray-encoded strings.
  // Convert bigint[] to string[] for decodeByteArray (which uses starknet.js).
  const dataStrings = log.data.map((d) => d.toString())
  const [recipient, nextIdx] = decodeByteArray(dataStrings, 3)
  const [message] = decodeByteArray(dataStrings, nextIdx)

  return {
    sender,
    tokenAddress,
    originNonce,
    amount,
    fee,
    nativeFee,
    recipient,
    message,
  }
}

/**
 * Check if a transfer with the given nonce has been finalised on Starknet.
 *
 * Calls the public `is_transfer_finalised` method on the bridge contract.
 */
export async function isTransferFinalised(
  provider: RpcProvider,
  bridgeAddress: string,
  nonce: bigint,
): Promise<boolean> {
  const result = await provider.callContract({
    contractAddress: bridgeAddress,
    entrypoint: "is_transfer_finalised",
    calldata: [`0x${nonce.toString(16)}`],
  })

  const firstResult = result[0]
  return result.length > 0 && firstResult !== undefined && BigInt(firstResult) !== 0n
}
