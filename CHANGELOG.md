# omni-bridge-sdk

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
