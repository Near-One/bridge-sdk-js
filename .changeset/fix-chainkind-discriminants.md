---
"@omni-bridge/core": minor
---

align `ChainKind` declaration order with the Rust `omni_types::ChainKind` enum. Adds `HyperEvm = 9` and moves `Abs` to `11`. The previous order caused `b.nativeEnum(ChainKind)` (used in `FinTransferArgs`, `DeployTokenArgs`, and `BindTokenArgs`) to write the wrong borsh discriminant for Abstract — `fin_transfer`/`deploy_token`/`bind_token` payloads were decoded by the contract as `HyperEvm` instead. `Strk` (=10) was already correct and is unchanged.

Numeric values of `ChainKind` members are part of the public surface, so this is a minor bump.
