---
"omni-bridge-sdk": patch
---

Migrate NEAR client implementation from near-js to near-kit library. This change is fully backwards compatible and unifies client implementations, eliminating the need for separate wallet selector clients. It also fixes borsh-serialization issues that users experienced with wallet selector integrations. The new implementation provides a more modern, type-safe API with human-readable gas and deposit units for better developer experience.