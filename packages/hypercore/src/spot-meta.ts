import type { Address } from "viem"

/**
 * Resolved metadata for a Hyperliquid spot token, sufficient to build a
 * `sendToEvmWithData` action against it.
 */
export interface SpotTokenInfo {
  /** Spot identifier shape `NAME:0x<32hex>` — the action JSON's `token` field. */
  spotId: string
  /** HlBridgeToken ERC-20 on HyperEVM — the action JSON's `destinationRecipient`. */
  hlBridgeToken: Address
  /**
   * HlBridgeToken ERC-20 `.decimals()`, used by `formatAmount` when converting
   * the bridge-wei `amount` to the action JSON's decimal string. By the
   * HyperEVM↔HyperCore linking invariant this equals
   * `weiDecimals + evm_extra_wei_decimals`. Note: `szDecimals` is order-size
   * precision and is unrelated — using it would over-divide for tokens like
   * PURR/HFUN where `szDecimals < weiDecimals`.
   */
  decimals: number
}

/**
 * Shape of Hyperliquid `/info { type: "spotMeta" }` token entries we depend on.
 * The endpoint returns additional fields we ignore.
 */
export interface SpotMetaToken {
  name: string
  fullName?: string | null
  szDecimals: number
  weiDecimals: number
  tokenId: string
  evmContract?: {
    address: string
    evm_extra_wei_decimals: number
  } | null
}

interface SpotMetaResponse {
  tokens: SpotMetaToken[]
}

export interface SpotMetaFetchOptions {
  /** Custom fetch implementation (e.g. for tests). Defaults to global `fetch`. */
  fetch?: typeof fetch
}

/**
 * Fetch the full spot-token table from Hyperliquid `/info`.
 */
export async function fetchSpotMeta(
  apiUrl: string,
  options: SpotMetaFetchOptions = {},
): Promise<SpotMetaToken[]> {
  const fetchImpl = options.fetch ?? fetch
  const response = await fetchImpl(`${apiUrl}/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "spotMeta" }),
  })
  if (!response.ok) {
    throw new Error(`Hyperliquid /info request failed: HTTP ${response.status}`)
  }
  const json = (await response.json()) as SpotMetaResponse
  return json.tokens
}

/**
 * Parse a Hyperliquid spot identifier in the canonical `NAME:0x<32hex>` form
 * (the same shape used in `/info spotMeta` and the action JSON `token` field).
 */
export function parseSpotId(spotId: string): { name: string; tokenId: string } {
  const colon = spotId.indexOf(":")
  if (colon === -1) {
    throw new Error(
      `Invalid spot identifier "${spotId}": expected "NAME:0x<32hex>" — names alone are ambiguous and not accepted`,
    )
  }
  const name = spotId.slice(0, colon)
  const tokenId = spotId.slice(colon + 1).toLowerCase()
  if (!/^0x[0-9a-f]{32}$/.test(tokenId)) {
    throw new Error(
      `Invalid spot identifier "${spotId}": tokenId must be a 32-hex string (16 bytes), got "${tokenId}"`,
    )
  }
  return { name, tokenId }
}

function findToken(tokens: SpotMetaToken[], spotId: string): SpotMetaToken {
  const { tokenId } = parseSpotId(spotId)
  const match = tokens.find((t) => t.tokenId.toLowerCase() === tokenId)
  if (!match) {
    throw new Error(`Hyperliquid spot token "${spotId}" not found in /info spotMeta`)
  }
  if (!match.evmContract) {
    throw new Error(
      `Spot token "${spotId}" has no linked HyperEVM contract (cannot be bridged via HlBridgeToken)`,
    )
  }
  return match
}

function toInfo(match: SpotMetaToken): SpotTokenInfo {
  // Safe: findToken throws when evmContract is null.
  const evm = match.evmContract as NonNullable<SpotMetaToken["evmContract"]>
  return {
    spotId: `${match.name}:${match.tokenId}`,
    hlBridgeToken: evm.address as Address,
    decimals: match.weiDecimals + evm.evm_extra_wei_decimals,
  }
}

/**
 * Look up `SpotTokenInfo` by full spot identifier (`NAME:0x<32hex>`).
 * Throws if the identifier is malformed, the tokenId isn't in `/info spotMeta`,
 * or the token has no linked HyperEVM contract.
 */
export async function resolveSpotToken(
  apiUrl: string,
  spotId: string,
  options: SpotMetaFetchOptions = {},
): Promise<SpotTokenInfo> {
  const tokens = await fetchSpotMeta(apiUrl, options)
  return toInfo(findToken(tokens, spotId))
}

/**
 * Process-local cache of `/info spotMeta` results, keyed by api URL.
 */
const CACHE: Map<string, Promise<SpotMetaToken[]>> = new Map()

/**
 * Like `resolveSpotToken`, but memoizes the `/info` response per `apiUrl` for
 * the lifetime of the process. Subsequent lookups for any spot identifier
 * reuse the cached table — typically one network round-trip per session.
 */
export async function resolveSpotTokenCached(
  apiUrl: string,
  spotId: string,
  options: SpotMetaFetchOptions = {},
): Promise<SpotTokenInfo> {
  let pending = CACHE.get(apiUrl)
  if (!pending) {
    pending = fetchSpotMeta(apiUrl, options).catch((err) => {
      CACHE.delete(apiUrl)
      throw err
    })
    CACHE.set(apiUrl, pending)
  }
  const tokens = await pending
  return toInfo(findToken(tokens, spotId))
}

/** Test-only — clear the memoized `/info` cache. */
export function _clearSpotMetaCache(): void {
  CACHE.clear()
}
