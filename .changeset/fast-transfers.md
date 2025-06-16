---
"omni-bridge-sdk": minor
---

Add fast transfer functionality for EVM to NEAR cross-chain transfers

- Add `fastFinTransfer` method to NearBridgeClient for relayer-based instant transfers
- Add `nearFastTransfer` orchestration method for end-to-end fast transfer processing
- Add `parseInitTransferEvent` method to EvmBridgeClient for EVM transaction parsing
- Add `EvmInitTransferEvent` and `FastFinTransferArgs` types
- Add `isEvmChain` and `EVMChainKind` utilities for EVM chain validation

Fast transfers enable relayers to provide tokens to users immediately upon detecting EVM InitTransfer events, without waiting for full cryptographic finality. The relayer is later reimbursed when the slow proof process completes.