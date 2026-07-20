# @omni-bridge/near

## 0.15.0

### Minor Changes

- 29536e6: `calculateStorageAccountId` accepts an optional second `externalId` argument, mixed into the hash so otherwise-identical transfers can derive distinct storage accounts. Limited to 64 UTF-8 bytes, matching the Rust `MAX_EXTERNAL_ID_LEN`; longer values throw.

### Patch Changes

- @omni-bridge/core@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [b120987]
  - @omni-bridge/core@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [b1a4547]
  - @omni-bridge/core@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [fa7238c]
  - @omni-bridge/core@0.12.0

## 0.11.0

### Minor Changes

- 399059b: Migrate UTXO (BTC/Zcash) verification to the connector's v2 methods.

  The connector contract paused the legacy `verify_deposit`/`safe_verify_deposit`/`verify_withdraw` methods and replaced them with `verify_deposit_v2` and `verify_withdraw_v2`, which take a nested `proof` object that includes a coinbase merkle proof.

  - `buildUtxoDepositFinalization` now calls `verify_deposit_v2`, nests the inclusion proof, and base64-encodes `tx_bytes`. The safe-vs-standard path is selected by the contract from `depositMsg.safe_deposit`; only the attached deposit differs. `UtxoDepositFinalizationParams` gains required `coinbaseTxId` and `coinbaseMerkleProof` fields.
  - `buildUtxoWithdrawalVerify` now calls `verify_withdraw_v2` with `{ tx_id, proof }` (it previously called a nonexistent `btc_verify_withdraw` method). `UtxoWithdrawalVerifyParams` is reshaped to `txId` + inclusion proof fields; gas is raised to 300 Tgas and no deposit is attached.
  - `BtcBuilder.getDepositProof` now returns `coinbase_tx_id`/`coinbase_merkle_proof`, and a new `BtcBuilder.getWithdrawProof` returns the inclusion proof for withdrawal verification.

### Patch Changes

- @omni-bridge/core@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [e6574bb]
  - @omni-bridge/core@0.10.0

## 0.9.1

### Patch Changes

- Updated dependencies [f432983]
- Updated dependencies [1d355dc]
  - @omni-bridge/core@0.9.1

## 0.9.0

### Minor Changes

- 3e7892b: support for fogo chain

### Patch Changes

- Updated dependencies [3e7892b]
  - @omni-bridge/core@0.9.0

## 0.8.1

### Patch Changes

- 5fd7424: Require an explicit `rpcUrl` when constructing a `BtcBuilder` with `chain: "zcash"` — the previous silent fallback to the Bitcoin RPC default produced confusing downstream errors. Also tighten `parseOmniAddress` in the NEAR storage helper with an exhaustive switch over `ChainPrefix` so future chain additions fail at compile time.
  - @omni-bridge/core@0.8.1

## 0.8.0

### Patch Changes

- 03e0c36: fix `calculateStorageAccountId` borsh schema to include the `HyperEvm`, `Strk`, and `Abs` `OmniAddress` variants. Without these, Starknet (and Abstract / HyperEVM) transfers fail to compute the correct NEAR storage account ID.
- Updated dependencies [7b89281]
- Updated dependencies [bd2c317]
  - @omni-bridge/core@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [5cf6866]
  - @omni-bridge/core@0.7.0

## 0.6.1

### Patch Changes

- Updated dependencies [3629f48]
  - @omni-bridge/core@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [7890c93]
  - @omni-bridge/core@0.6.0

## 0.5.0

### Minor Changes

- 9d0a4c9: added refund address in DepositMsg

### Patch Changes

- @omni-bridge/core@0.5.0

## 0.4.0

### Minor Changes

- c804103: Replace `postActions`/`extraMsg` with `safe_deposit` on `getUtxoDepositAddress`. NEAR builder now calls `safe_verify_deposit` when `safe_deposit` is provided.

### Patch Changes

- Updated dependencies [c804103]
  - @omni-bridge/core@0.4.0

## 0.3.0

### Minor Changes

- 0009f08: Add `buildUtxoWithdrawalSubmit()` and `buildUtxoWithdrawalSign()` for manually unsticking BTC/Zcash withdrawals. Revert Zcash mainnet token address to `nzec.bridge.near` since the `zec.omft.near` migration never happened.

### Patch Changes

- Updated dependencies [d22ee53]
- Updated dependencies [0009f08]
- Updated dependencies [c8f7495]
- Updated dependencies [18c8d3c]
  - @omni-bridge/core@0.3.0

## 0.2.3

### Patch Changes

- Updated dependencies [d0b6b71]
  - @omni-bridge/core@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies [ede2319]
  - @omni-bridge/core@0.2.2

## 0.2.1

### Patch Changes

- f9d8909: Fix custom RPC URL support in createBridge and createNearBuilder

  The `rpcUrls` config option in `createBridge()` was defined but never used. This fix:

  - Uses the custom NEAR RPC URL from `rpcUrls[ChainKind.Near]` when creating the internal Near client in `createBridge()`
  - Adds `rpcUrl` option to `NearBuilderConfig` for `createNearBuilder()`

  This allows users to specify custom RPC endpoints to avoid rate limiting on default public RPCs.

- Updated dependencies [816c551]
- Updated dependencies [f9d8909]
  - @omni-bridge/core@0.2.1

## 0.2.0

### Minor Changes

- ecb9917: Remove @near-js/accounts and @near-js/transactions dependencies

  The NAJ shims now return plain objects instead of class instances. These plain objects
  serialize identically to NAJ's Action classes via Borsh, so they work directly with
  `Account.signAndSendTransaction()`. Users just need to cast to `Action[]` for TypeScript.

  Breaking changes:

  - `sendWithNearApiJs()` helper removed - use `account.signAndSendTransaction()` directly
  - `toNearApiJsActions()` now returns `NearApiJsAction[]` (plain objects) instead of `Action[]`

### Patch Changes

- @omni-bridge/core@0.2.0

## 0.1.0

### Patch Changes

- @omni-bridge/core@0.1.0

## 0.0.4

### Patch Changes

- 500e399: Add default condition to package exports for CommonJS compatibility
- Updated dependencies [500e399]
  - @omni-bridge/core@0.0.4

## 0.0.3

### Patch Changes

- Fix npm installation by resolving workspace:\* references at publish time
- Updated dependencies
  - @omni-bridge/core@0.0.3

## 0.0.2

### Patch Changes

- 9474f18: Update dependencies to latest versions
- Updated dependencies [9474f18]
  - @omni-bridge/core@0.0.2
