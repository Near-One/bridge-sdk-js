# @omni-bridge/near

## 0.2.4

### Patch Changes

- Updated dependencies [c8f7495]
  - @omni-bridge/core@0.2.4

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
