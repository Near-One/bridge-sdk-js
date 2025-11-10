# omni-bridge-sdk

## 0.20.7

### Patch Changes

- 1327296: chore(deps-dev): bump @types/bun from 1.3.1 to 1.3.2
- 9a4d836: Fix NEAR wallet selector args serialization to use Buffer instead of plain objects
- 26947aa: chore(deps-dev): bump msw from 2.12.0 to 2.12.1

## 0.20.6

### Patch Changes

- 7c25ddd: fix(deps): pin @near-js/signers to versions with InMemorySigner

## 0.20.5

### Patch Changes

- f24cd8c: chore(deps-dev): bump @biomejs/biome from 2.3.3 to 2.3.4
- 02820c9: chore(deps): bump @ethereumjs/mpt from 10.0.0 to 10.1.0
- eda8018: chore(deps): bump @ethereumjs/rlp from 10.0.0 to 10.1.0
- eda8018: chore(deps): bump @ethereumjs/util from 10.0.0 to 10.1.0
- 41d6f37: chore(deps-dev): bump knip from 5.67.1 to 5.68.0
- eda8018: chore(deps-dev): bump msw from 2.11.6 to 2.12.0
- d706cd4: chore(deps): bump @near-js/client from 2.5.0 to 2.5.1
- 8502fcd: chore(deps): bump @near-js/providers from 2.5.0 to 2.5.1
- eda8018: chore(deps): bump @near-js/types from 2.5.0 to 2.5.1
- eda8018: chore(deps-dev): bump vitest from 4.0.7 to 4.0.8

## 0.20.4

### Patch Changes

- 3f73d0f: chore(deps): bump @near-js/transactions from 2.4.0 to 2.5.0
- c324bcc: chore(deps-dev): bump vitest from 4.0.6 to 4.0.7
- 84ecd4a: chore(deps): bump @near-js/types from 2.4.0 to 2.5.0
- 7310850: chore(deps): bump @near-js/accounts from 2.4.0 to 2.5.0
- 12a4038: chore(deps-dev): bump knip from 5.65.0 to 5.67.1

## 0.20.3

### Patch Changes

- 159ca44: chore(deps): bump @near-js/providers from 2.4.0 to 2.5.0
- 0b9209d: fix: normalize Solana wrapped mint seeds
- df5b49a: chore(deps): bump @near-js/client from 2.3.3 to 2.5.0
- 422de95: chore(deps-dev): bump @biomejs/biome from 2.2.6 to 2.3.3
- 0977190: chore(deps-dev): bump msw from 2.11.5 to 2.11.6
- 1a725a8: chore(deps-dev): bump @types/node from 24.9.2 to 24.10.0

## 0.20.2

### Patch Changes

- f83708b: chore(deps-dev): bump lefthook from 1.13.6 to 2.0.2
- cfd25fd: chore(deps): bump @near-wallet-selector/core from 9.5.4 to 10.1.0
- b126a89: chore(deps): bump @wormhole-foundation/sdk from 3.8.7 to 3.10.0
- 4f0ee3f: chore(deps): bump @near-js/accounts from 2.3.3 to 2.3.4
- 4e6719c: chore(deps-dev): bump @types/bun from 1.3.0 to 1.3.1
- 63eba82: chore(deps-dev): bump vitest from 3.2.4 to 4.0.5
- 1313a01: chore(deps): bump @near-js/providers from 2.3.1 to 2.3.4
- 9174fe2: chore(deps): bump @near-js/transactions from 2.3.3 to 2.3.4
- 4b24147: chore(deps): bump @near-js/types from 2.3.3 to 2.3.4
- 000634f: chore(deps-dev): bump @types/node from 24.7.1 to 24.8.1

## 0.20.1

### Patch Changes

- cc4c220: Fix isSolWallet type guard to correctly identify Anchor Provider wallets by checking for connection and publicKey properties instead of send method

## 0.20.0

### Minor Changes

- 0810620: Add config override system with `setConfig()` and `resetConfig()` functions

### Patch Changes

- ad1550a: chore(deps): bump @wormhole-foundation/sdk from 3.8.5 to 3.8.7
- 8d53ca9: chore(deps-dev): bump @types/bun from 1.2.22 to 1.3.0
- 28cbf9a: chore(deps-dev): bump knip from 5.64.3 to 5.65.0
- a1592ff: chore(deps-dev): bump typescript from 5.9.2 to 5.9.3
- 0db0452: Update API client to match OpenAPI v2 specification with fee breakdown fields
- 54a0264: chore: update API snapshot for ZEC token address change

## 0.19.5

### Patch Changes

- e8d6715: chore(deps): bump @coral-xyz/anchor from 0.31.1 to 0.32.1
- a6fe34f: chore(deps-dev): bump knip from 5.64.2 to 5.64.3
- bd1fc37: chore(deps): bump @near-js/client from 2.3.1 to 2.3.3
- 8e3de52: chore(deps): bump @near-js/types from 2.3.1 to 2.3.3

## 0.19.4

### Patch Changes

- 489ab3d: chore(deps): bump @noble/curves from 2.0.0 to 2.0.1
- 3b0512f: chore(deps-dev): bump @types/node from 24.7.0 to 24.7.1
- 0964d8b: chore(deps-dev): bump msw from 2.11.2 to 2.11.5
- 6badfe1: chore(deps): bump zod from 4.1.9 to 4.1.12

## 0.19.3

### Patch Changes

- 9629b36: Fix getTokenDecimals typing to handle null returns from NEAR contract

## 0.19.2

### Patch Changes

- 6295b3d: chore(deps): bump @scure/base from 1.2.6 to 2.0.0
- 9fc11a4: fix: remove legacy Solana code and always use shim-based methods

  On-chain programs (testnet and mainnet) are running v0.2.5 which requires wormhole shim accounts. Removed legacy v0.2.4 code and version detection to fix InvalidProgramId errors during initTransfer.

- 67e4815: chore(deps): bump @noble/hashes from 2.0.0 to 2.0.1
- ec2a169: chore(deps): bump @near-js/accounts from 2.3.1 to 2.3.3
- 54797fb: chore(deps): bump @near-js/transactions from 2.3.1 to 2.3.3

## 0.19.1

### Patch Changes

- dd7cb45: chore(deps): bump @solana/web3.js from 1.98.2 to 1.98.4

## 0.19.0

### Minor Changes

- 2898e59: Refactor UTXO chain handling to support both Bitcoin and Zcash through unified interface using ChainKind enum differentiation. This introduces breaking changes to method names and signatures for Bitcoin operations.

  **Breaking Changes:**

  - Renamed Bitcoin-specific methods to generic UTXO equivalents:
    - `getBitcoinDepositAddress` → `getUtxoDepositAddress(chain, ...)`
    - `finalizeBitcoinDeposit` → `finalizeUtxoDeposit(chain, ...)`
    - `executeBitcoinWithdrawal` → `executeUtxoWithdrawal(chain, ...)`
    - `initBitcoinWithdrawal` → `initUtxoWithdrawal(chain, ...)`
    - `waitForBitcoinTransactionSigning` → `waitForUtxoTransactionSigning(chain, ...)`
    - `finalizeBitcoinWithdrawal` → `finalizeUtxoWithdrawal(chain, ...)`
    - `getBitcoinBridgeConfig` → `getUtxoBridgeConfig(chain)`
  - All UTXO methods now require `chain: UtxoChain` as first parameter (e.g., `ChainKind.Btc` or `ChainKind.Zcash`)
  - Zcash support requires passing `zcashApiKey` option to `NearBridgeClient` constructor

  **New Features:**

  - Added Zcash support through unified UTXO interface
  - Introduced `UtxoChainService` abstraction with `BitcoinService` and `ZcashService` implementations
  - Added `UTXO_CHAIN_LABELS` for user-facing chain names

### Patch Changes

- 6bd2184: chore(deps): bump @solana/spl-token from 0.4.13 to 0.4.14
- f46831c: chore(deps): bump @wormhole-foundation/sdk from 3.4.6 to 3.8.5
- e2a27bf: chore(deps-dev): bump lefthook from 1.13.0 to 1.13.6
- c6c293d: chore(deps-dev): bump knip from 5.63.1 to 5.64.2
- 08bd9b4: chore(deps-dev): bump @types/node from 24.5.1 to 24.7.0
- 6a992c9: chore(deps): bump @near-wallet-selector/core from 9.0.3 to 9.5.4

## 0.18.0

### Minor Changes

- f09278d: feat: update API tests

### Patch Changes

- ab46689: fix: change `calculateStorageAccountId` function to use borsh
- 2f7ea99: docs: clarify token deployment proof steps

## 0.17.5

### Patch Changes

- de1ab17: chore: bump merkletreejs from 0.5.2 to 0.6.0
- e15e571: chore: bump @near-js/accounts from 2.1.0 to 2.3.1
- 937fc4d: chore: bump @types/node from 24.5.0 to 24.5.1
- 6c51fb6: chore: bump zod from 4.1.5 to 4.1.9

## 0.17.4

### Patch Changes

- bbc68ca: chore(deps): bump @near-js/transactions from 2.1.0 to 2.3.1
- 4416853: chore(deps-dev): bump @changesets/cli from 2.29.5 to 2.29.7
- 7f38e66: chore(deps-dev): bump @types/bun from 1.2.21 to 1.2.22
- 3fb68ad: chore(deps-dev): bump @types/node from 24.4.0 to 24.5.0

## 0.17.3

### Patch Changes

- 6246393: chore(deps): bump @noble/curves from 1.9.2 to 2.0.0
- 2799d47: chore(deps-dev): bump lefthook from 1.11.14 to 1.13.0
- 7244225: chore(deps-dev): bump @biomejs/biome from 2.2.3 to 2.2.4
- f412868: chore(deps-dev): bump @types/node from 24.3.1 to 24.4.0

## 0.17.2

### Patch Changes

- 6948baa: chore(deps): bump @scure/btc-signer from 1.8.1 to 2.0.1
- 5f82b42: chore(deps): bump @near-js/types from 2.3.0 to 2.3.1
- 1e98a86: chore(deps-dev): bump @types/bun from 1.2.17 to 1.2.21

## 0.17.1

### Patch Changes

- fc66918: chore(deps): bump ethers from 6.14.4 to 6.15.0
- 8880c0d: chore(deps-dev): bump msw from 2.10.2 to 2.11.2
- 202ac90: chore(deps): bump @near-js/client from 2.1.0 to 2.3.1
- a8e7157: chore(deps): bump zod from 3.25.67 to 4.1.5

## 0.17.0

### Minor Changes

- 7c73802: Add calculateStorageAccountId function for computing NEAR storage account IDs from transfer messages

### Patch Changes

- 28b7906: chore(deps): bump @near-js/types from 2.1.0 to 2.3.0
- e0087e9: chore(deps-dev): bump @biomejs/biome from 2.0.5 to 2.2.3
- eb65bdc: chore(deps-dev): bump typescript from 5.8.3 to 5.9.2
- 993aae6: chore(deps-dev): bump knip from 5.61.2 to 5.63.1
- 5f4e82a: chore(deps): bump @noble/hashes from 1.8.0 to 2.0.0
- 4f9f686: chore(deps): bump @wormhole-foundation/sdk from 2.1.0 to 3.4.6
- 33ea7f8: chore(deps): bump @near-js/providers from 2.1.0 to 2.3.0
- 20a3925: chore(deps-dev): bump @types/node from 24.0.4 to 24.3.1

## 0.16.0

### Minor Changes

- 8ff525f: Add comprehensive Bitcoin bridge support to Omni Bridge SDK

  This release introduces full Bitcoin ↔ NEAR bridge functionality, enabling seamless transfers between Bitcoin and NEAR Protocol.

  **New Features:**

  - **Bitcoin Service**: Complete Bitcoin transaction handling with UTXO management and network communication
  - **Bidirectional Transfers**: Support for both BTC → NEAR deposits and NEAR → BTC withdrawals
  - **Simple API**: One-line withdrawal with `executeBitcoinWithdrawal()` method
  - **Manual Control**: Step-by-step methods for advanced use cases
  - **Type Safety**: Complete TypeScript definitions for Bitcoin operations

  **Transfer Flows:**

  - **BTC → NEAR**: Two-step deposit process with address generation and finalization
  - **NEAR → BTC**: Automated withdrawal with MPC signing and transaction broadcasting

  **Developer Experience:**

  - Ready-to-run examples for deposits and withdrawals
  - Comprehensive documentation and API reference
  - Clear error handling and validation
  - Support for both testnet and mainnet networks

  **Usage:**

  ```typescript
  // Simple withdrawal
  const txHash = await bridgeClient.executeBitcoinWithdrawal(
    "bc1qaddress...",
    BigInt(100000)
  );

  // Deposit flow
  const { depositAddress } = await bridgeClient.getBitcoinDepositAddress(
    "user.near"
  );
  // Send Bitcoin to depositAddress, then:
  await bridgeClient.finalizeBitcoinDeposit(txHash, vout, depositArgs);
  ```

  **Technical Details:**

  - Added `@scure/btc-signer` dependency for Bitcoin transaction handling
  - Extended `NearBridgeClient` with 8 new Bitcoin bridge methods
  - 2,500+ lines of comprehensive test coverage
  - Complete Bitcoin bridge guide and examples

### Patch Changes

- 6ffabdc: zcash support

## 0.15.1

### Patch Changes

- 745001d: fix: `omniTransfer` for `EVM` transfers other than `Eth`

## 0.15.0

### Minor Changes

- 756e513: Add BNB Chain support as EVM-compatible blockchain

  - Add ChainKind.Bnb enum value and BNB chain configuration
  - Support bnb: OmniAddress format with mainnet/testnet contract addresses
  - Enable BNB transfers through existing EvmBridgeClient with proper gas limits
  - Add BNB token pattern recognition for NEAR bridge tokens
  - Include comprehensive test coverage for BNB chain utilities and types

- b5bddb6: Add comprehensive E2E test infrastructure with manual cross-chain transfer flows

  - Add end-to-end test suite covering ETH↔NEAR, SOL↔NEAR transfers
  - Implement manual transfer flow: initiate → sign → finalize
  - Add automatic ERC20 token approval to EvmBridgeClient
  - Add separate CI workflow for E2E tests with configurable full/quick modes
  - Support both proof generation tests (~2min) and full light client tests (~30min)
  - Add test fixtures, assertions, and shared setup utilities
  - Include failure scenario testing (SOL→NEAR refund panic)

## 0.14.0

### Minor Changes

- 55fb5d9: Migrate API client to v2 endpoints with enhanced functionality

  - All endpoints migrated from /api/v1/ to /api/v2/
  - Add support for transaction hash lookups in getTransfer() and getTransferStatus()
  - Methods now return arrays to support batch transfers
  - Add getBtcUserDepositAddress() method for BTC deposit addresses
  - Add utxo_transfer field to Transfer schema for Bitcoin support
  - Add Bnb chain support
  - Enhanced error handling and validation

- bcc53b6: feat: add wormhole post message shim support

### Patch Changes

- da9e097: feat: loosen restrictions on omni token validation
- a6c1a9c: feat: add isValidOmniAddress validation function

## 0.13.1

### Patch Changes

- 0ac839a: fix: import BN directly from bn.js instead of @coral-xyz/anchor

## 0.13.0

### Minor Changes

- 18ab405: Add getAllowlistedTokens endpoint to fetch mapping of NEAR token contract IDs to OmniAddresses

### Patch Changes

- 9f18f2c: feat: add parseOriginChain function for offline NEAR token address parsing

## 0.12.3

### Patch Changes

- 9cb5d81: feat: add EVM proof support to NEAR deployToken method
- f4104d1: improve: return actual API response text in error messages

## 0.12.2

### Patch Changes

- 0383cff: 🐛 Fix isSolWallet check logic
- 8d074c0: fix: invalid proof kind
- 1122a8b: feat: added `fast-finalised` variants

## 0.12.1

### Patch Changes

- 6eb945e: fix: ETH address on mainnet
- 709a86a: fix: ETH ABI

## 0.12.0

### Minor Changes

- 2073ec4: Add fast transfer functionality for EVM to NEAR cross-chain transfers

  - Add `fastFinTransfer` method to NearBridgeClient for relayer-based instant transfers
  - Add `nearFastTransfer` orchestration method for end-to-end fast transfer processing
  - Add `getInitTransferEvent` method to EvmBridgeClient for EVM transaction parsing
  - Add `EvmInitTransferEvent` and `FastFinTransferArgs` types
  - Add `isEvmChain` and `EVMChainKind` utilities for EVM chain validation

  Fast transfers enable relayers to provide tokens to users immediately upon detecting EVM InitTransfer events, without waiting for full cryptographic finality. The relayer is later reimbursed when the slow proof process completes.

### Patch Changes

- edca992: feat: support NEAR decimal lookup based on foreign chain context

## 0.11.1

### Patch Changes

- ce231f3: fix: CI release

## 0.11.0

### Minor Changes

- 8404d01: feat: Switch to bun, latest NAJ, refactor

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
