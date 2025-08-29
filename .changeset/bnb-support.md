---
"omni-bridge-sdk": minor
---

Add BNB Chain support as EVM-compatible blockchain

- Add ChainKind.Bnb enum value and BNB chain configuration
- Support bnb: OmniAddress format with mainnet/testnet contract addresses
- Enable BNB transfers through existing EvmBridgeClient with proper gas limits
- Add BNB token pattern recognition for NEAR bridge tokens
- Include comprehensive test coverage for BNB chain utilities and types