---
"omni-bridge-sdk": patch
---

Fix BigInt serialization by converting to strings before JSON.stringify. Revert buffer-based args from PR #339.
