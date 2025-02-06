---
"omni-bridge-sdk": minor
---

Add centralized network address configuration:

- Add new `config.ts` module with mainnet/testnet addresses
- Add `setNetwork()` function for network selection
- Remove environment variable dependencies for addresses
- Update all clients to use centralized config
