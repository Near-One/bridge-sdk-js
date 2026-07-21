import type { ActionSignature, ExchangeEnvelope, SendToEvmWithDataAction } from "./types.js"

export interface PostExchangeActionOptions {
  /** Hyperliquid REST base URL (no `/exchange` suffix). */
  apiUrl: string
  /** Signed action body. */
  action: SendToEvmWithDataAction
  /** Signature produced by signing the action's EIP-712 digest. */
  signature: ActionSignature
  /** Custom fetch implementation. Defaults to global `fetch`. */
  fetch?: typeof fetch
}

export interface PostExchangeResult {
  /** Parsed `/exchange` response body. */
  raw: unknown
}

/**
 * POST `{action, nonce, signature}` to Hyperliquid `/exchange`. Throws on
 * non-2xx status or `status: "err"` response. Does NOT wait for the
 * downstream HyperEVM `CoreReceived` log — consumers should subscribe via
 * their own tooling if they need landing confirmation.
 */
export async function postExchangeAction(
  options: PostExchangeActionOptions,
): Promise<PostExchangeResult> {
  const fetchImpl = options.fetch ?? fetch
  const envelope: ExchangeEnvelope = {
    action: options.action,
    nonce: options.action.nonce,
    signature: options.signature,
  }

  const response = await fetchImpl(`${options.apiUrl}/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(envelope),
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Hyperliquid /exchange HTTP ${response.status}: ${text}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`Hyperliquid /exchange returned non-JSON body: ${text}`)
  }

  const status = (parsed as { status?: unknown }).status
  if (status === "err") {
    const message = (parsed as { response?: unknown }).response ?? text
    throw new Error(`Hyperliquid /exchange rejected action: ${String(message)}`)
  }
  if (status !== "ok") {
    throw new Error(`Hyperliquid /exchange returned unexpected status: ${text}`)
  }

  return { raw: parsed }
}
