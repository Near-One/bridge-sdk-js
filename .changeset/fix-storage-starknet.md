---
"@omni-bridge/near": patch
---

fix `calculateStorageAccountId` borsh schema to include the `HyperEvm`, `Strk`, and `Abs` `OmniAddress` variants. Without these, Starknet (and Abstract / HyperEVM) transfers fail to compute the correct NEAR storage account ID.
