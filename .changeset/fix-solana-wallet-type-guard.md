---
"omni-bridge-sdk": patch
---

Fix isSolWallet type guard to correctly identify Anchor Provider wallets by checking for connection and publicKey properties instead of send method
