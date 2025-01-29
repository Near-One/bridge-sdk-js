---
"omni-bridge-sdk": minor
---

Add cross-chain proof infrastructure and enhance NEAR client operations

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
