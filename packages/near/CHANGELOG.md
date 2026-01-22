# @omni-bridge/near

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
