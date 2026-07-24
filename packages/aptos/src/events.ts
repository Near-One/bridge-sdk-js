/**
 * Aptos event parsing for Omni Bridge
 *
 * Extracts and parses bridge events from committed Aptos transactions via
 * the fullnode REST API (v1). Matches the Rust bridge-sdk-rs
 * AptosBridgeClient event parsing logic.
 */

import { decodeUtf8Message, normalizeAptosAddress, normalizeEventData } from "./encoding.js"

/** Move module that hosts the bridge entry functions. */
const MODULE_NAME = "omni_bridge"

/**
 * Parsed InitTransfer event data.
 */
export interface AptosInitTransferEvent {
  sender: string
  tokenAddress: string
  originNonce: bigint
  amount: bigint
  fee: bigint
  nativeFee: bigint
  /** OmniAddress string of the destination, e.g. `near:alice.near`. */
  recipient: string
  /** UTF-8 decoded message; raw `0x…` hex kept if not valid UTF-8. */
  message: string
}

/**
 * Raw Aptos event log with the metadata needed for MPC proof construction.
 * `data` is the canonical sorted-key JSON form the MPC nodes reconstruct.
 */
export interface AptosEventLog {
  /** Event GUID account address, zero-padded to canonical form. */
  accountAddress: string
  sequenceNumber: bigint
  /** Move event type tag, e.g. `0x…::omni_bridge::InitTransfer` (verbatim). */
  typeTag: string
  /** Canonical JSON string of the event data (recursively sorted keys). */
  data: string
  /** Index of the event in the transaction's `events` array. */
  eventIndex: number
}

interface AptosTransactionEvent {
  guid: { account_address: string }
  sequence_number: string
  type: string
  data: unknown
}

interface AptosCommittedTransaction {
  hash: string
  success?: boolean
  vm_status?: string
  events?: AptosTransactionEvent[]
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init)
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Aptos RPC request failed (${response.status}): ${body}`)
  }
  return response.json()
}

function trimBaseUrl(rpcUrl: string): string {
  return rpcUrl.replace(/\/+$/, "")
}

/**
 * Parse a u64/u128 REST field, accepting only canonical decimal strings —
 * the same strings Rust's `u64`/`u128` `FromStr` accepts (BigInt alone would
 * also accept hex/binary/signed/empty forms the protocol never produces).
 */
function parseDecimalBigInt(raw: string, context: string): bigint {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${context} is not an integer: ${raw}`)
  }
  return BigInt(raw)
}

/**
 * Fetch a committed transaction by hash from an Aptos fullnode REST endpoint
 * (`rpcUrl` must include the `/v1` segment).
 */
async function getCommittedTransaction(
  rpcUrl: string,
  txHash: string,
): Promise<AptosCommittedTransaction> {
  // Validate before interpolating into the URL path — a crafted "hash" could
  // otherwise re-target the request ("../", "?", "#").
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    throw new Error(`Invalid Aptos transaction hash: ${txHash}`)
  }
  const tx = (await fetchJson(
    `${trimBaseUrl(rpcUrl)}/transactions/by_hash/${txHash}`,
  )) as AptosCommittedTransaction
  if (tx.success === undefined) {
    throw new Error(`Transaction ${txHash} is still pending`)
  }
  if (tx.success !== true) {
    throw new Error(`Transaction ${txHash} failed: ${tx.vm_status ?? "unknown VM status"}`)
  }
  return tx
}

/** Split a Move event type tag `0xaddr::module::Struct` into its parts. */
function parseEventType(eventType: string): [string, string, string] | null {
  const firstSep = eventType.indexOf("::")
  if (firstSep === -1) return null
  const secondSep = eventType.indexOf("::", firstSep + 2)
  if (secondSep === -1) return null
  return [
    eventType.slice(0, firstSep),
    eventType.slice(firstSep + 2, secondSep),
    eventType.slice(secondSep + 2),
  ]
}

function isBridgeEvent(event: AptosTransactionEvent, bridgeAddress: string, eventName: string) {
  const parts = parseEventType(event.type)
  if (!parts) return false
  const [address, module, name] = parts
  if (module !== MODULE_NAME || name !== eventName) return false
  try {
    return normalizeAptosAddress(address) === normalizeAptosAddress(bridgeAddress)
  } catch {
    return false
  }
}

/**
 * Extract a specific `omni_bridge` event log from a committed transaction.
 *
 * @param rpcUrl - Aptos fullnode REST endpoint, including the `/v1` segment
 * @param bridgeAddress - Address the `omni_bridge` package is published under
 * @param txHash - Transaction hash (`0x`-prefixed)
 * @param eventName - Event struct name, e.g. `"InitTransfer"`
 */
export async function getEventLog(
  rpcUrl: string,
  bridgeAddress: string,
  txHash: string,
  eventName: string,
): Promise<AptosEventLog> {
  const tx = await getCommittedTransaction(rpcUrl, txHash)
  const events = tx.events ?? []

  const eventIndex = events.findIndex((event) => isBridgeEvent(event, bridgeAddress, eventName))
  if (eventIndex === -1) {
    throw new Error(`${eventName} event not found in transaction ${txHash}`)
  }
  // findIndex above guarantees the element exists.
  const event = events[eventIndex] as AptosTransactionEvent
  if (event.data === undefined) {
    throw new Error(`${eventName} event in transaction ${txHash} has no data field`)
  }

  return {
    accountAddress: normalizeAptosAddress(event.guid.account_address),
    sequenceNumber: parseDecimalBigInt(event.sequence_number, "event sequence_number"),
    typeTag: event.type,
    data: normalizeEventData(event.data),
    eventIndex,
  }
}

/**
 * Get the InitTransfer event log from a committed transaction.
 */
export async function getInitTransferLog(
  rpcUrl: string,
  bridgeAddress: string,
  txHash: string,
): Promise<AptosEventLog> {
  return getEventLog(rpcUrl, bridgeAddress, txHash, "InitTransfer")
}

/**
 * Get the DeployToken event log from a committed transaction.
 */
export async function getDeployTokenLog(
  rpcUrl: string,
  bridgeAddress: string,
  txHash: string,
): Promise<AptosEventLog> {
  return getEventLog(rpcUrl, bridgeAddress, txHash, "DeployToken")
}

/**
 * Get the FinTransfer event log from a committed transaction.
 */
export async function getFinTransferLog(
  rpcUrl: string,
  bridgeAddress: string,
  txHash: string,
): Promise<AptosEventLog> {
  return getEventLog(rpcUrl, bridgeAddress, txHash, "FinTransfer")
}

/**
 * Decode the InitTransfer event of a committed transaction.
 */
export async function getInitTransferEvent(
  rpcUrl: string,
  bridgeAddress: string,
  txHash: string,
): Promise<AptosInitTransferEvent> {
  const log = await getInitTransferLog(rpcUrl, bridgeAddress, txHash)
  return parseInitTransferEvent(JSON.parse(log.data))
}

/**
 * Parse an InitTransfer event from its decoded `data` object, as returned by
 * the fullnode REST API (u64/u128 as decimal strings, `vector<u8>` as
 * `0x`-prefixed hex).
 */
export function parseInitTransferEvent(data: unknown): AptosInitTransferEvent {
  if (data === null || typeof data !== "object") {
    throw new Error("InitTransfer event data is not an object")
  }
  const record = data as Record<string, unknown>

  const stringField = (key: string): string => {
    const value = record[key]
    if (typeof value !== "string") {
      throw new Error(`InitTransfer event missing string field ${key}`)
    }
    return value
  }
  const bigIntField = (key: string): bigint =>
    parseDecimalBigInt(stringField(key), `InitTransfer event field ${key}`)

  return {
    sender: normalizeAptosAddress(stringField("sender")),
    tokenAddress: normalizeAptosAddress(stringField("token_address")),
    originNonce: bigIntField("origin_nonce"),
    amount: bigIntField("amount"),
    fee: bigIntField("fee"),
    nativeFee: bigIntField("native_fee"),
    recipient: stringField("recipient"),
    message: decodeUtf8Message(stringField("message")),
  }
}

/**
 * Check if a transfer with the given destination nonce has been finalised on
 * Aptos. Calls the `is_transfer_finalised` view function.
 */
export async function isTransferFinalised(
  rpcUrl: string,
  bridgeAddress: string,
  nonce: bigint,
): Promise<boolean> {
  const result = (await fetchJson(`${trimBaseUrl(rpcUrl)}/view`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      function: `${normalizeAptosAddress(bridgeAddress)}::${MODULE_NAME}::is_transfer_finalised`,
      type_arguments: [],
      arguments: [nonce.toString()],
    }),
  })) as unknown[]

  const value = result[0]
  if (typeof value !== "boolean") {
    throw new Error("is_transfer_finalised view returned no boolean")
  }
  return value
}
