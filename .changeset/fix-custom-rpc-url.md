---
"@omni-bridge/core": patch
"@omni-bridge/near": patch
---

Fix custom RPC URL support in createBridge and createNearBuilder

The `rpcUrls` config option in `createBridge()` was defined but never used. This fix:

- Uses the custom NEAR RPC URL from `rpcUrls[ChainKind.Near]` when creating the internal Near client in `createBridge()`
- Adds `rpcUrl` option to `NearBuilderConfig` for `createNearBuilder()`

This allows users to specify custom RPC endpoints to avoid rate limiting on default public RPCs.
