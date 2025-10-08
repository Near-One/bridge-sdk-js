---
"omni-bridge-sdk": minor
---

Refactor UTXO chain handling to support both Bitcoin and Zcash through unified interface using ChainKind enum differentiation. This introduces breaking changes to method names and signatures for Bitcoin operations.

**Breaking Changes:**

- Renamed Bitcoin-specific methods to generic UTXO equivalents:
  - `getBitcoinDepositAddress` → `getUtxoDepositAddress(chain, ...)`
  - `finalizeBitcoinDeposit` → `finalizeUtxoDeposit(chain, ...)`
  - `executeBitcoinWithdrawal` → `executeUtxoWithdrawal(chain, ...)`
  - `initBitcoinWithdrawal` → `initUtxoWithdrawal(chain, ...)`
  - `waitForBitcoinTransactionSigning` → `waitForUtxoTransactionSigning(chain, ...)`
  - `finalizeBitcoinWithdrawal` → `finalizeUtxoWithdrawal(chain, ...)`
  - `getBitcoinBridgeConfig` → `getUtxoBridgeConfig(chain)`
- All UTXO methods now require `chain: UtxoChain` as first parameter (e.g., `ChainKind.Btc` or `ChainKind.Zcash`)
- Zcash support requires passing `zcashApiKey` option to `NearBridgeClient` constructor

**New Features:**

- Added Zcash support through unified UTXO interface
- Introduced `UtxoChainService` abstraction with `BitcoinService` and `ZcashService` implementations
- Added `UTXO_CHAIN_LABELS` for user-facing chain names
