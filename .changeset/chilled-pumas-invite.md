---
"@omni-bridge/core": minor
---

Add `related_txs` to `Transfer`: steps of the transfer that have no field of their own — the HyperCore side of a transfer through HyperEVM, and HyperEVM's second init transaction. Adds the `hyper_core` transaction details variant and exports `RelatedTx` / `RelatedTxKind`.
