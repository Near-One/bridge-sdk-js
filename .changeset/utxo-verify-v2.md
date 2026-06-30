---
"@omni-bridge/near": minor
"@omni-bridge/btc": minor
---

Migrate UTXO (BTC/Zcash) verification to the connector's v2 methods.

The connector contract paused the legacy `verify_deposit`/`safe_verify_deposit`/`verify_withdraw` methods and replaced them with `verify_deposit_v2` and `verify_withdraw_v2`, which take a nested `proof` object that includes a coinbase merkle proof.

- `buildUtxoDepositFinalization` now calls `verify_deposit_v2`, nests the inclusion proof, and base64-encodes `tx_bytes`. The safe-vs-standard path is selected by the contract from `depositMsg.safe_deposit`; only the attached deposit differs. `UtxoDepositFinalizationParams` gains required `coinbaseTxId` and `coinbaseMerkleProof` fields.
- `buildUtxoWithdrawalVerify` now calls `verify_withdraw_v2` with `{ tx_id, proof }` (it previously called a nonexistent `btc_verify_withdraw` method). `UtxoWithdrawalVerifyParams` is reshaped to `txId` + inclusion proof fields; gas is raised to 300 Tgas and no deposit is attached.
- `BtcBuilder.getDepositProof` now returns `coinbase_tx_id`/`coinbase_merkle_proof`, and a new `BtcBuilder.getWithdrawProof` returns the inclusion proof for withdrawal verification.
