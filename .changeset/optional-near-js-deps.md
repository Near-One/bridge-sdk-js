---
"@omni-bridge/near": minor
---

Remove @near-js/accounts and @near-js/transactions dependencies

The NAJ shims now return plain objects instead of class instances. These plain objects
serialize identically to NAJ's Action classes via Borsh, so they work directly with
`Account.signAndSendTransaction()`. Users just need to cast to `Action[]` for TypeScript.

Breaking changes:
- `sendWithNearApiJs()` helper removed - use `account.signAndSendTransaction()` directly
- `toNearApiJsActions()` now returns `NearApiJsAction[]` (plain objects) instead of `Action[]`
