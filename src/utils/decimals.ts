import { addresses } from "../config"
import type { OmniAddress } from "../types"

export interface TokenDecimals {
  decimals: number
  origin_decimals: number
}

/**
 * Normalizes an amount from one decimal precision to another using BigInt math
 * @param amount The amount to normalize as a bigint
 * @param fromDecimals The source decimal precision
 * @param toDecimals The target decimal precision
 * @returns The normalized amount as a bigint
 */
export function normalizeAmount(amount: bigint, fromDecimals: number, toDecimals: number): bigint {
  if (fromDecimals === toDecimals) return amount

  if (fromDecimals > toDecimals) {
    // Scale down: Divide by power of 10
    const scale = 10n ** BigInt(fromDecimals - toDecimals)
    return amount / scale
    // biome-ignore lint/style/noUselessElse: Adds clarity
  } else {
    // Scale up: Multiply by power of 10
    const scale = 10n ** BigInt(toDecimals - fromDecimals)
    return amount * scale
  }
}

/**
 * Verifies if a transfer amount will be valid after normalization
 * @param amount The amount to transfer
 * @param fee The fee to be deducted
 * @param originDecimals The decimals of the token on the source chain
 * @param destinationDecimals The decimals of the token on the destination chain
 * @returns true if the normalized amount (minus fee) will be greater than 0
 */
export function verifyTransferAmount(
  amount: bigint,
  fee: bigint,
  originDecimals: number,
  destinationDecimals: number,
): boolean {
  try {
    // Use the minimum of origin and destination decimals for normalization
    const minDecimals = Math.min(originDecimals, destinationDecimals)

    // First normalize amount and fee to the minimum decimals
    const normalizedAmount = normalizeAmount(amount, originDecimals, minDecimals)
    const normalizedFee = normalizeAmount(fee, originDecimals, minDecimals)

    // Check if amount minus fee is greater than 0
    return normalizedAmount > normalizedFee && normalizedAmount - normalizedFee > 0n
  } catch {
    // If we hit any math errors, the amount is effectively too small
    return false
  }
}

/**
 * Get the minimum number of decimals between origin and destination chains
 * @param contractId The NEAR contract to query
 * @param sourceToken The source token address
 * @param destinationToken The destination token address
 * @returns The minimum number of decimals
 */
export async function getMinimumDecimals(
  contractId: string,
  sourceToken: OmniAddress,
  destinationToken: OmniAddress,
): Promise<number> {
  const sourceDecimals = await getTokenDecimals(contractId, sourceToken)
  const destDecimals = await getTokenDecimals(contractId, destinationToken)

  return Math.min(sourceDecimals.decimals, destDecimals.decimals)
}

/**
 * Gets token decimals from the NEAR contract
 * @param contractId The NEAR contract ID to query
 * @param tokenAddress The Omni token address to check
 * @returns Promise resolving to the token's decimal information
 */
export async function getTokenDecimals(
  contractId: string,
  tokenAddress: OmniAddress,
): Promise<TokenDecimals> {
  const response = await fetch(`https://rpc.${addresses.network}.near.org`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "dontcare",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: "get_token_decimals",
        args_base64: Buffer.from(JSON.stringify({ address: tokenAddress })).toString("base64"),
      },
    }),
  })

  const result = await response.json()

  if (result.error) {
    throw new Error(
      `Failed to get token decimals: ${result.error.message || JSON.stringify(result.error)}`,
    )
  }

  // Parse the result which is returned as an encoded JSON string
  const decoded = Buffer.from(result.result.result).toString()
  const decimals = JSON.parse(decoded) as TokenDecimals

  return decimals
}

/**
 * Gets the minimum transferable amount for a token pair accounting for decimal normalization
 * @param originDecimals The decimals of the source token
 * @param destinationDecimals The decimals of the destination token
 * @returns The minimum transferable amount as a bigint
 */
export function getMinimumTransferableAmount(
  originDecimals: number,
  destinationDecimals: number,
): bigint {
  // Start with 1 in destination decimal system
  let minAmount = 1n

  // If origin has more decimals, we need to scale up
  if (originDecimals > destinationDecimals) {
    minAmount = minAmount * 10n ** BigInt(originDecimals - destinationDecimals)
  }

  return minAmount
}
