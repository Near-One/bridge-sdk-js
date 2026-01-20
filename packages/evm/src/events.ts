/**
 * EVM event parsing for bridge transactions
 */

import { decodeEventLog, type Hex } from "viem"
import { BRIDGE_TOKEN_FACTORY_ABI } from "./abi.js"

/**
 * Parsed InitTransfer event from EVM bridge contracts
 */
export interface EvmInitTransferEvent {
  sender: string
  tokenAddress: string
  originNonce: bigint
  amount: bigint
  fee: bigint
  nativeTokenFee: bigint
  recipient: string
  message: string
}

/**
 * Log entry format compatible with both viem and ethers receipts
 */
export interface LogEntry {
  topics: readonly string[] | string[]
  data: string
}

const INIT_TRANSFER_TOPIC = "0xaa7e1f77d43faa300bc5ae8f012f0b7cf80174f4c0b1cffeab250cb4966bb88c"

/**
 * Parse InitTransfer event from transaction logs.
 * Works with both viem and ethers receipt log formats.
 *
 * @param logs - Array of log entries from a transaction receipt
 * @returns Parsed InitTransfer event data
 * @throws Error if no InitTransfer event is found in the logs
 */
export function parseInitTransferEvent(logs: readonly LogEntry[]): EvmInitTransferEvent {
  for (const log of logs) {
    if (log.topics[0] !== INIT_TRANSFER_TOPIC) {
      continue
    }

    try {
      const decoded = decodeEventLog({
        abi: BRIDGE_TOKEN_FACTORY_ABI,
        eventName: "InitTransfer",
        topics: log.topics as [Hex, ...Hex[]],
        data: log.data as Hex,
      })

      return {
        sender: decoded.args.sender,
        tokenAddress: decoded.args.tokenAddress,
        originNonce: decoded.args.originNonce,
        amount: decoded.args.amount,
        fee: decoded.args.fee,
        nativeTokenFee: decoded.args.nativeTokenFee,
        recipient: decoded.args.recipient,
        message: decoded.args.message,
      }
    } catch {
      // Continue searching if decode fails
    }
  }

  throw new Error("InitTransfer event not found in transaction logs")
}

/**
 * Get the InitTransfer event topic hash
 */
export function getInitTransferTopic(): Hex {
  return INIT_TRANSFER_TOPIC
}
