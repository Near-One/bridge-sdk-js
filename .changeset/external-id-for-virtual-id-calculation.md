---
"@omni-bridge/near": minor
---

`calculateStorageAccountId` accepts an optional second `externalId` argument, mixed into the hash so otherwise-identical transfers can derive distinct storage accounts. Limited to 64 UTF-8 bytes, matching the Rust `MAX_EXTERNAL_ID_LEN`; longer values throw.
