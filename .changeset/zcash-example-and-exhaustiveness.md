---
"@omni-bridge/btc": patch
"@omni-bridge/near": patch
---

Require an explicit `rpcUrl` when constructing a `BtcBuilder` with `chain: "zcash"` — the previous silent fallback to the Bitcoin RPC default produced confusing downstream errors. Also tighten `parseOmniAddress` in the NEAR storage helper with an exhaustive switch over `ChainPrefix` so future chain additions fail at compile time.
