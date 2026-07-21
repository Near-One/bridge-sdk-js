# @omni-bridge/core

## 0.15.0

## 0.14.0

### Minor Changes

- b120987: BREAKING: rename `source_chain` to `origin_chain` in the v4 transfer shape, matching the `originChain` lookup param and protocol vocabulary. Requires an indexer deployment that serves the renamed field.

## 0.13.0

### Minor Changes

- b1a4547: BREAKING: unify the v4 transfer shape to British spelling, matching the rest of the fields — the `initialized` field is now `initialised`, and the `"Initialized"` status is now `"Initialised"` (alongside `finalised`, `FastFinalisedOnNear`, etc.). Requires an indexer deployment that serves the renamed field.

## 0.12.0

### Minor Changes

- fa7238c: BREAKING: `getTransfer`, `getTransferStatus`, and `findTransfers` now use the indexer's `/api/v4` endpoints and return the reworked transfer shape. All other methods (`getFee`, `getAllowlistedTokens`, UTXO helpers) stay on v3 and are unchanged.

  Method signatures are unchanged — the three methods still return `Transfer[]` / `TransferStatus[]` (the v4 HTTP envelopes are unwrapped by the SDK) — but the element shapes changed:

  - **`Transfer` is flat**: `transfer_message` / `utxo_transfer` nesting is gone. Read `transfer.sender`, `transfer.recipient`, `transfer.token_id`, `transfer.amount`, `transfer.fee`, `transfer.native_fee`, `transfer.msg` directly. UTXO metadata moved to `transfer.utxo_meta` (`transfer.utxo_transfer.btc_pending_id` → `transfer.utxo_meta?.pending_sign_id`).
  - **Lifecycle stages are chain-agnostic `TransactionRef`s**: no more per-chain variants. `finalised.EVMLog.transaction_hash` / `finalised.Solana.signature` / etc. → `finalised?.transaction_hash`; chain-specific block data lives in `details` (a discriminated union on `type`).
  - **`signed` is an array** (a transfer may be re-signed): `signed.NearReceipt.transaction_hash` → `signed.at(-1)?.transaction_hash`.
  - **`transfer_id` replaces `id`**: a discriminated union on `type` — `{ type: "nonce", chain, nonce }` or `{ type: "utxo", chain, tx_hash, vout }`.
  - **`Settled` replaces `Claimed`** as the terminal `TransferStatus`; v4 never returns `Claimed`. The status enum is open for extension — unrecognized values pass through as strings; treat them as non-terminal.
  - **New fields**: embedded `status`, `source_chain`, `destination_chain`, `destination_nonce`, `verified` (NEAR-side settlement of UTXO withdrawals), `fee_updates` (was `updated_fee`), `utxo_signs`, `utxo_winning_tx_hash`, `tx_ids`.
  - **New lookup**: transfers can be fetched by UTXO ref — `getTransfer({ utxoChain, utxoTxHash, utxoVout })` — for both deposits and payouts.
  - `findOmniTransfers` (deprecated alias of `findTransfers`) returns the new shape too.

## 0.11.0

## 0.10.0

### Minor Changes

- e6574bb: support transfers from HyperEVM and HyperCore

## 0.9.1

### Patch Changes

- f432983: chore: update sol.omdep.near to sol.omft.near for Solana migration
- 1d355dc: Add destination memo typing and validation for Zcash memo handoff.

## 0.9.0

### Minor Changes

- 3e7892b: support for fogo chain

## 0.8.1

## 0.8.0

### Minor Changes

- 7b89281: align `ChainKind` declaration order with the Rust `omni_types::ChainKind` enum. Adds `HyperEvm = 9` and moves `Abs` to `11`. The previous order caused `b.nativeEnum(ChainKind)` (used in `FinTransferArgs`, `DeployTokenArgs`, and `BindTokenArgs`) to write the wrong borsh discriminant for Abstract — `fin_transfer`/`deploy_token`/`bind_token` payloads were decoded by the contract as `HyperEvm` instead. `Strk` (=10) was already correct and is unchanged.

  Numeric values of `ChainKind` members are part of the public surface, so this is a minor bump.

### Patch Changes

- bd2c317: fix Zcash OmniAddress prefix from `zec:` to `zcash:` so addresses match what the bridge API and contracts expect

## 0.7.0

### Minor Changes

- 5cf6866: added `skip_tx` flag in utxo deposit address api

## 0.6.1

### Patch Changes

- 3629f48: chore: revert sol.omft.near back to sol.omdep.near (Solana not yet migrated)

## 0.6.0

### Minor Changes

- 7890c93: added refund_address in api

## 0.5.0

## 0.4.0

### Minor Changes

- c804103: Replace `postActions`/`extraMsg` with `safe_deposit` on `getUtxoDepositAddress`. NEAR builder now calls `safe_verify_deposit` when `safe_deposit` is provided.

## 0.3.0

### Minor Changes

- d22ee53: Add Abstract (Abs) and Starknet (Strk) chain support with builder configs,
  address mappings, and the new `@omni-bridge/starknet` transaction builder package.

### Patch Changes

- 0009f08: Add `buildUtxoWithdrawalSubmit()` and `buildUtxoWithdrawalSign()` for manually unsticking BTC/Zcash withdrawals. Revert Zcash mainnet token address to `nzec.bridge.near` since the `zec.omft.near` migration never happened.
- c8f7495: chore: update sol.omdep.near to sol.omft.near for Solana migration
- 18c8d3c: Add support for the new `HlEvm` and `Strk` transfer API chain enums and parse
  the new `Starknet` transaction variant in transfer responses.

## 0.2.3

### Patch Changes

- d0b6b71: Remove deprecated `nzec.bridge.near` from token utilities

## 0.2.2

### Patch Changes

- ede2319: Replace deprecated `nzec.bridge.near` with `zec.omft.near` for mainnet Zcash token

## 0.2.1

### Patch Changes

- 816c551: Add `isBridgeToken` and `parseOriginChain` token utility functions for offline validation and parsing of NEAR bridge token addresses
- f9d8909: Fix custom RPC URL support in createBridge and createNearBuilder

  The `rpcUrls` config option in `createBridge()` was defined but never used. This fix:

  - Uses the custom NEAR RPC URL from `rpcUrls[ChainKind.Near]` when creating the internal Near client in `createBridge()`
  - Adds `rpcUrl` option to `NearBuilderConfig` for `createNearBuilder()`

  This allows users to specify custom RPC endpoints to avoid rate limiting on default public RPCs.

## 0.2.0

## 0.1.0

## 0.0.4

### Patch Changes

- 500e399: Add default condition to package exports for CommonJS compatibility

## 0.0.3

### Patch Changes

- Fix npm installation by resolving workspace:\* references at publish time

## 0.0.2

### Patch Changes

- 9474f18: Update dependencies to latest versions
