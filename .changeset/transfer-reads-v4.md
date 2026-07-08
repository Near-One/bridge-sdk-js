---
"@omni-bridge/core": minor
---

BREAKING: `getTransfer`, `getTransferStatus`, and `findTransfers` now use the indexer's `/api/v4` endpoints and return the reworked transfer shape. All other methods (`getFee`, `getAllowlistedTokens`, UTXO helpers) stay on v3 and are unchanged.

Method signatures are unchanged — the three methods still return `Transfer[]` / `TransferStatus[]` (the v4 HTTP envelopes are unwrapped by the SDK) — but the element shapes changed:

- **`Transfer` is flat**: `transfer_message` / `utxo_transfer` nesting is gone. Read `transfer.sender`, `transfer.recipient`, `transfer.token_id`, `transfer.amount`, `transfer.fee`, `transfer.native_fee`, `transfer.msg` directly. UTXO metadata moved to `transfer.utxo_meta` (`transfer.utxo_transfer.btc_pending_id` → `transfer.utxo_meta?.pending_sign_id`).
- **Lifecycle stages are chain-agnostic `TransactionRef`s**: no more per-chain variants. `finalised.EVMLog.transaction_hash` / `finalised.Solana.signature` / etc. → `finalised?.transaction_hash`; chain-specific block data lives in `details` (a discriminated union on `type`).
- **`signed` is an array** (a transfer may be re-signed): `signed.NearReceipt.transaction_hash` → `signed.at(-1)?.transaction_hash`.
- **`transfer_id` replaces `id`**: a discriminated union on `type` — `{ type: "nonce", chain, nonce }` or `{ type: "utxo", chain, tx_hash, vout }`.
- **`Settled` replaces `Claimed`** as the terminal `TransferStatus`; v4 never returns `Claimed`. The status enum is open for extension — unrecognized values pass through as strings; treat them as non-terminal.
- **New fields**: embedded `status`, `source_chain`, `destination_chain`, `destination_nonce`, `verified` (NEAR-side settlement of UTXO withdrawals), `fee_updates` (was `updated_fee`), `utxo_signs`, `utxo_winning_tx_hash`, `tx_ids`.
- **New lookup**: transfers can be fetched by UTXO ref — `getTransfer({ utxoChain, utxoTxHash, utxoVout })` — for both deposits and payouts.
- `findOmniTransfers` (deprecated alias of `findTransfers`) returns the new shape too.
