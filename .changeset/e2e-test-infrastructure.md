---
"@near-js/bridge-sdk": minor
---

Add comprehensive E2E test infrastructure with manual cross-chain transfer flows

- Add end-to-end test suite covering ETH↔NEAR, SOL↔NEAR transfers
- Implement manual transfer flow: initiate → sign → finalize
- Add automatic ERC20 token approval to EvmBridgeClient
- Add separate CI workflow for E2E tests with configurable full/quick modes
- Support both proof generation tests (~2min) and full light client tests (~30min)
- Add test fixtures, assertions, and shared setup utilities
- Include failure scenario testing (SOL→NEAR refund panic)