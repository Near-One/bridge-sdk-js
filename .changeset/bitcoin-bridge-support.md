---
"omni-bridge-sdk": minor
---

Add comprehensive Bitcoin bridge support to Omni Bridge SDK

This release introduces full Bitcoin ↔ NEAR bridge functionality, enabling seamless transfers between Bitcoin and NEAR Protocol.

**New Features:**
- **Bitcoin Service**: Complete Bitcoin transaction handling with UTXO management and network communication
- **Bidirectional Transfers**: Support for both BTC → NEAR deposits and NEAR → BTC withdrawals  
- **Simple API**: One-line withdrawal with `executeBitcoinWithdrawal()` method
- **Manual Control**: Step-by-step methods for advanced use cases
- **Type Safety**: Complete TypeScript definitions for Bitcoin operations

**Transfer Flows:**
- **BTC → NEAR**: Two-step deposit process with address generation and finalization
- **NEAR → BTC**: Automated withdrawal with MPC signing and transaction broadcasting

**Developer Experience:**
- Ready-to-run examples for deposits and withdrawals
- Comprehensive documentation and API reference
- Clear error handling and validation
- Support for both testnet and mainnet networks

**Usage:**
```typescript
// Simple withdrawal
const txHash = await bridgeClient.executeBitcoinWithdrawal(
  "bc1qaddress...", 
  BigInt(100000)
)

// Deposit flow  
const { depositAddress } = await bridgeClient.getBitcoinDepositAddress("user.near")
// Send Bitcoin to depositAddress, then:
await bridgeClient.finalizeBitcoinDeposit(txHash, vout, depositArgs)
```

**Technical Details:**
- Added `@scure/btc-signer` dependency for Bitcoin transaction handling
- Extended `NearBridgeClient` with 8 new Bitcoin bridge methods
- 2,500+ lines of comprehensive test coverage
- Complete Bitcoin bridge guide and examples