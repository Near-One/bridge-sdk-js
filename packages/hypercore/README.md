# @omni-bridge/hypercore

HyperCore (Hyperliquid L1) action builder for [Omni Bridge](https://github.com/nearone/bridge-sdk-js).

Builds the EIP-712 `sendToEvmWithData` user-signed action posted to Hyperliquid's `/exchange` endpoint. Use this when **the user is on HyperCore** and wants to bridge a spot balance to HyperEVM or any other supported chain.

> Bridging *to* HyperCore from another chain is a regular bridge transfer with `recipient: "hlevm:0x..."` and a non-empty `message` — see the inbound helper `buildHyperliquidTransferParams` in `@omni-bridge/core`. For outbound from HyperEVM (regular EVM source), use `@omni-bridge/evm` with `chain: ChainKind.HyperEvm`.

## Installation

```bash
npm install @omni-bridge/hypercore @omni-bridge/core viem
```

## Quick Start

```typescript
import { createHyperCoreBuilder, postExchangeAction, splitSignature } from "@omni-bridge/hypercore"
import { privateKeyToAccount } from "viem/accounts"

const builder = createHyperCoreBuilder({ network: "mainnet" })

// 1. Build the unsigned action. The SDK resolves the HlBridgeToken contract
//    and spot token id from Hyperliquid /info { type: "spotMeta" }.
const unsigned = await builder.buildTransfer({
  spotToken: "USDC",                  // Hyperliquid-native spot identifier
  amount: 1_00000000n,                // 1 USDC at 8 decimals (szDecimals + evmExtraWeiDecimals)
  recipient: "near:alice.near",       // any OmniAddress
  fee: 0n,
  message: "",
})

// 2. Sign the precomputed EIP-712 digest with the user's HyperCore wallet.
const account = privateKeyToAccount("0x...")
const signature = await account.sign({ hash: unsigned.typedData.digest })

// 3. Post to Hyperliquid /exchange.
await postExchangeAction({
  apiUrl: builder.apiUrl,
  action: unsigned.action,
  signature: splitSignature(signature),
})
```

Wallets that prefer the structured EIP-712 prompt can use `unsigned.typedData.domain`, `.types`, and `.message` with `walletClient.signTypedData(...)` instead of signing the raw digest.

## Action dispatch

The first byte of the `data` payload routes the on-chain call inside `HlBridgeToken`:

| Recipient chain | Action tag | Effect |
|---|---|---|
| `hlevm:0x...` | `0x00` `ACTION_TRANSFER` | Pool release from `HlBridgeToken._systemAddress` directly to the HyperEVM address. |
| Anything else (`near:`, `eth:`, `sol:`, ...) | `0x01` `ACTION_INIT_TRANSFER` | Calls `OmniBridge.initTransfer(fee, recipient, message)` to route via the bridge. |

`buildTransfer` picks the right action automatically based on the recipient OmniAddress.

## Skipping the `/info` lookup

`buildTransfer` calls `/info spotMeta` once per process (cached by api URL) to resolve `spotId`, `hlBridgeToken`, and `decimals`. Pre-supply all three to skip the network round-trip:

```typescript
const unsigned = await builder.buildTransfer({
  spotToken: "USDC",
  amount: 1_00000000n,
  recipient: "near:alice.near",
  spotId: "USDC:0x6d1e7cde53ba9467b783cb7c530ce054",
  hlBridgeToken: "0x1234567890123456789012345678901234567890",
  decimals: 8,
})
```

## API

### `createHyperCoreBuilder(config)`

```typescript
const builder = createHyperCoreBuilder({
  network: "mainnet" | "testnet",
  apiUrl?: string,             // override Hyperliquid REST base
  signatureChainId?: string,   // hex, defaults to "0x66eee" (Hyperliquid Python SDK convention)
  fetch?: typeof fetch,        // custom fetch (tests, proxies)
})
```

### `builder.buildTransfer(params)`

Returns `{ action, typedData: { domain, types, primaryType, message, digest }, hlBridgeToken }`.

### Helpers

- `postExchangeAction({ apiUrl, action, signature })` — POSTs to `/exchange`, throws on non-2xx or `status: "err"` response.
- `splitSignature(sig)` — splits a 65-byte hex signature into the `{ r, s, v }` envelope expected by `/exchange`.
- `resolveSpotToken(apiUrl, name)` / `resolveSpotTokenCached(...)` — direct access to the `/info spotMeta` resolver.
- `encodeTransferAction(address)` / `encodeInitTransferAction(fee, recipient, message)` — low-level `data` encoders.
- `formatAmount(amount, decimals)` — bigint → Hyperliquid decimal string.

### Constants

- `HYPERCORE_API_URL` — per-network `/info` + `/exchange` base.
- `HYPEREVM_CHAIN_ID` — `999` (mainnet) / `998` (testnet); used as `destinationChainId` in the action JSON.
- `DEFAULT_SIGNATURE_CHAIN_ID = "0x66eee"` — Arb-Sepolia; only used for cross-chain replay protection inside the EIP-712 domain. Not tied to Arbitrum execution.
- `DEFAULT_GAS_LIMIT_TRANSFER = 300_000` / `DEFAULT_GAS_LIMIT_INIT_TRANSFER = 800_000`.

## Decimals

The action JSON's `amount` is a decimal string. `formatAmount` converts a raw bigint using `szDecimals + evmExtraWeiDecimals` from `/info spotMeta` — the HyperEVM↔HyperCore linking invariant. If the bridge token's `decimals()` doesn't match this sum, formatted amounts won't line up with the user's Core spot balance precision.

## Confirmation

This package does **not** poll HyperEVM for the resulting `CoreReceived` log. After `/exchange` accepts the action, the system transaction lands on HyperEVM asynchronously; subscribe via your own RPC tooling if you need landing confirmation.

## License

MIT
