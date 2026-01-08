---
"omni-bridge-sdk": patch
---

Fix UTXO withdrawal fee handling to treat amount as total instead of adding fees on top. Fees are now subtracted from the specified amount, and validation checks the net amount after fees.
