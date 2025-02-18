---
"omni-bridge-sdk": patch
---

Fix: Resolve `@near-js/client` to CJS in Vitest config to fix ESM import errors during testing. This prevents test failures caused by a broken ESM build in the `@near-js/client` library.
