# omni-bridge-sdk

## 0.10.4

### Patch Changes

- 517ca08: feat: add message field to init transfer

## 0.10.3

### Patch Changes

- ff38df2: fix(near): Dynamic deposit amounts

## 0.10.2

### Patch Changes

- f8370d3: chore(deps-dev): bump @types/node from 22.13.8 to 22.13.9
- e090c22: chore(deps): bump @solana/spl-token from 0.4.12 to 0.4.13
- f235b34: chore(deps): bump @near-js/client from 0.0.2 to 0.0.3
- 061c1b4: chore(deps): bump @wormhole-foundation/sdk from 1.11.0 to 1.13.1
- 50e0926: fix(api): Match new API schema
- 7409fdf: chore: Updated block header for EVM proof

## 0.10.1

### Patch Changes

- 298c40a: feat(token): Improve token resolution, helpful error messages

## 0.10.0

### Minor Changes

- e1283c4: feat(sol): support Token-2022 standard

### Patch Changes

- 4075951: refactor(serialization): replace borsher with @zorsh/zorsh for improved type safety

## 0.9.3

### Patch Changes

- d540745: chore(deps): bump @wormhole-foundation/sdk from 1.9.0 to 1.10.0
- b5b807c: chore(deps-dev): bump lefthook from 1.10.10 to 1.11.1
- 626c190: chore(deps-dev): bump msw from 2.7.0 to 2.7.3
- 055a5bb: chore(deps-dev): bump @types/node from 22.13.4 to 22.13.5
- 1ae7845: chore(deps-dev): bump vitest from 3.0.5 to 3.0.6
- 60d458a: chore(deps-dev): bump @arethetypeswrong/cli from 0.17.3 to 0.17.4
- 71880ff: Improve test performance
- 55c2674: chore(deps-dev): bump @changesets/cli from 2.28.0 to 2.28.1

## 0.9.2

### Patch Changes

- 033c137: Fix: Resolve `@near-js/client` to CJS in Vitest config to fix ESM import errors during testing. This prevents test failures caused by a broken ESM build in the `@near-js/client` library.
- 2424970: Update NEAR testnet address

## 0.9.1

### Patch Changes

- 5ca8e9f: Bump @changesets/cli from 2.27.12 to 2.28.0
- cabc157: feat: implement cross-chain token address resolution and transfer validation

## 0.9.0

### Minor Changes

- c93223d: feat: add decimal normalization checks to prevent dust amounts in cross-chain transfers

## 0.8.2

### Patch Changes

- aa50e97: Bump @types/node from 22.13.1 to 22.13.4
- 86c9e02: Bump @wormhole-foundation/sdk from 1.6.0 to 1.9.0
- 948a648: Bump zod from 3.24.1 to 3.24.2

## 0.8.1

### Patch Changes

- fe97b45: feat: support transaction injection in bridge clients

## 0.8.0

### Minor Changes

- bcf4226: fix(config): update testnet addresses for multiple networks

### Patch Changes

- d8fc52f: test(config): fix broken tests

## 0.7.3

### Patch Changes

- 9bc3197: fix(api): use correct mainnet API base URL with 'mainnet' subdomain
- 039266c: Bump @near-wallet-selector/core from 8.9.16 to 8.10.0
- 718936d: Bump @wormhole-foundation/sdk from 1.5.2 to 1.6.0

## 0.7.2

### Patch Changes

- a10c1ab: feat: improve bigint parsing to handle scientific notation and preserve precision

## 0.7.1

### Patch Changes

- 08db6b7: fix(api): Export type definitions

## 0.7.0

### Minor Changes

- cebedb7: refactor(chains): convert ChainKind from tagged union to enum for simpler type system
- e47c3d6: Migrate to Zod for runtime validation, improve error handling, and add comprehensive testing

### Patch Changes

- 837544c: improve: add type safety to bridge client factory with proper generics and overloads

## 0.6.2

### Patch Changes

- 8cfd726: Update API methods

## 0.6.1

### Patch Changes

- 83f1e31: refactor(near): update VAA encoding and ProofKind types for transfer finalization

## 0.6.0

### Minor Changes

- 2ccf03e: feat(solana): update bridge implementation with message support, pause functionality, new admin roles, and updated testnet contract address

### Patch Changes

- 2ccf03e: fix(near): include native fee in storage deposit calculations

## 0.5.0

### Minor Changes

- 2f51e11: Add centralized network address configuration:

  - Add new `config.ts` module with mainnet/testnet addresses
  - Add `setNetwork()` function for network selection
  - Remove environment variable dependencies for addresses
  - Update all clients to use centralized config

## 0.4.0

### Minor Changes

- 1279166: feat: batch storage deposit with transfer for NEAR transactions

### Patch Changes

- 1279166: fix: update Solana Provider type and add type guards

## 0.3.1

### Patch Changes

- 9fbdcb0: Add type definitions for NEAR Wallet Selector

## 0.3.0

### Minor Changes

- fb50236: Add support for NEAR Wallet Selector as an alternative to near-api-js for NEAR chain interactions.

### Patch Changes

- 1b8aace: Bump @types/node from 22.12.0 to 22.13.0

## 0.2.2

### Patch Changes

- 9c4a4f0: Bump @wormhole-foundation/sdk from 1.5.1 to 1.5.2
- d296686: Bump @wormhole-foundation/sdk from 1.5.0 to 1.5.1
- d3279df: Bump @solana/spl-token from 0.4.11 to 0.4.12

## 0.2.1

### Patch Changes

- ae4fd88: Support automatic deployments

## 0.2.0

### Minor Changes

- 0e1307d: Add cross-chain proof infrastructure and enhance NEAR client operations

  ### Features

  - **EVM Proof Generation**: Implemented Merkle proof generation for EVM transactions using EthereumJS utilities
    - Supports legacy/dynamic transaction types (pre-Shapella, post-Dencun)
    - Includes receipt, log entry, and header proofs in RLP-encoded format
  - **Wormhole Integration**: Added VAA (Verified Action Approval) retrieval for cross-chain message verification
  - **NEAR Enhancements**:
    - Automatic mainnet/testnet detection for locker contracts
    - Transaction polling with 60s timeout for `logMetadata`
    - Structured event parsing from NEAR transaction logs

  ### Improvements

  - Added network-aware RPC configuration for EVM chains (Eth/Mainnet, Base, Arb)
  - Extended NEAR client return types to include MPC signatures and parsed events
  - Added comprehensive test suite for EVM proof generation with snapshot verification

  ### Dependencies

  - Added @ethereumjs/mpt@7.0.0-alpha.1
  - Added @ethereumjs/util@9.1.0
  - Added @wormhole-foundation/sdk@1.5.0

- ecbbe1d: feat(near): Implement end-to-end transfer signing flow

  ### Added

  - `signTransfer` method in NearBridgeClient to authorize transfers after initialization
  - New event types (`InitTransferEvent`, `SignTransferEvent`) for tracking NEAR transfer lifecycle
  - Automatic storage deposit handling for token contracts interacting with the locker

  ### Changed

  - `initTransfer` on NEAR now returns structured event data instead of raw tx hash
  - Updated transfer flow documentation with NEAR-specific examples
  - Unified BigInt handling across EVM/Solana clients for consistency

  ### Breaking Changes

  - NEAR `initTransfer` return type changed from `string` to `InitTransferEvent`
  - NEAR transfers now require explicit `signTransfer` call after initialization

### Patch Changes

- 7410e28: Bump @solana/spl-token from 0.4.9 to 0.4.11

## 0.1.1

### Patch Changes

- fe50b67: Add automatic deployments
