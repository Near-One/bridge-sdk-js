---
"@omni-bridge/core": minor
---

BREAKING: unify the v4 transfer shape to British spelling, matching the rest of the fields — the `initialized` field is now `initialised`, and the `"Initialized"` status is now `"Initialised"` (alongside `finalised`, `FastFinalisedOnNear`, etc.). Requires an indexer deployment that serves the renamed field.
