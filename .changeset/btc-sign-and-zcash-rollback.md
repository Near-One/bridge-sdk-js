---
"@omni-bridge/near": minor
"@omni-bridge/core": patch
---

Add `buildUtxoWithdrawalSubmit()` and `buildUtxoWithdrawalSign()` for manually unsticking BTC/Zcash withdrawals. Revert Zcash mainnet token address to `nzec.bridge.near` since the `zec.omft.near` migration never happened.
