---
"omni-bridge-sdk": minor
---

Add alternative Bitcoin transfer flow with `submitBitcoinTransfer` method and update Bitcoin connector configuration.

**New Features:**

- Added `submitBitcoinTransfer` method to `NearBridgeClient` as alternative NEAR→BTC transfer flow
  - Enables transfers initiated via `initTransfer` followed by `submitBitcoinTransfer`
  - Automatically handles UTXO selection and withdrawal planning
  - Extracts recipient address, amount, and max gas fee from `InitTransferEvent`
- Added `max_gas_fee` optional parameter to `InitBtcTransferMsg.Withdraw` for gas fee control
- Added `SUBMIT_BTC_TRANSFER` gas constant (300 TGas)

**Configuration Updates:**

- Updated Bitcoin connector address to `btc-connector.n-bridge.testnet` for testnet
