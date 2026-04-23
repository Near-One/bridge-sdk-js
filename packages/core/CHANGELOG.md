# @omni-bridge/core

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
