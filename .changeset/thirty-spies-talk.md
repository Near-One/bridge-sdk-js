---
"omni-bridge-sdk": minor
---

feat(near): Implement end-to-end transfer signing flow

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
