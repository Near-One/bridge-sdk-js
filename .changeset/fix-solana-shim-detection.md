---
"omni-bridge-sdk": patch
---

fix: remove legacy Solana code and always use shim-based methods

On-chain programs (testnet and mainnet) are running v0.2.5 which requires wormhole shim accounts. Removed legacy v0.2.4 code and version detection to fix InvalidProgramId errors during initTransfer.
