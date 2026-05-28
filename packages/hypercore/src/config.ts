import type { Network } from "@omni-bridge/core"

/**
 * Hyperliquid REST API base URL (without `/exchange` or `/info` suffix).
 */
export const HYPERCORE_API_URL: Record<Network, string> = {
  mainnet: "https://api.hyperliquid.xyz",
  testnet: "https://api.hyperliquid-testnet.xyz",
}

/**
 * `hyperliquidChain` value embedded in the signed action JSON.
 */
export const HYPERLIQUID_CHAIN: Record<Network, "Mainnet" | "Testnet"> = {
  mainnet: "Mainnet",
  testnet: "Testnet",
}

/**
 * HyperEVM chain id used as `destinationChainId` in the action JSON.
 */
export const HYPEREVM_CHAIN_ID: Record<Network, number> = {
  mainnet: 999,
  testnet: 998,
}

/**
 * Default `signatureChainId` (Arb-Sepolia, `0x66eee`) — matches the Hyperliquid
 * Python SDK convention. The value only needs to be unique enough to prevent
 * signature replay across chains; mirroring the canonical SDK reduces interop
 * surprises.
 */
export const DEFAULT_SIGNATURE_CHAIN_ID = "0x66eee"

export const DEFAULT_GAS_LIMIT_INIT_TRANSFER = 800_000
export const DEFAULT_GAS_LIMIT_TRANSFER = 300_000
