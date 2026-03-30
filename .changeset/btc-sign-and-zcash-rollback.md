---
"@omni-bridge/near": minor
"@omni-bridge/core": patch
---

Add `buildUtxoWithdrawalSign()` for manually triggering MPC signing on stuck BTC/Zcash withdrawals. Revert Zcash mainnet token address to `nzec.bridge.near` since the `zec.omft.near` migration never happened.
