---
"@omni-bridge/core": minor
"@omni-bridge/near": minor
---

Replace `postActions`/`extraMsg` with `safe_deposit` on `getUtxoDepositAddress`. NEAR builder now calls `safe_verify_deposit` when `safe_deposit` is provided.
