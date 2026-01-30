# @omni-bridge/core

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
