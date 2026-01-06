# SDK Migration Tasks

This document contains tasks for completing the migration from `src/` to `packages/`. Each task is self-contained with enough context for an AI agent to complete independently.

---

## Overview

The SDK is being restructured from a monolithic `src/` directory to a multi-package `packages/` architecture. The new packages are:

- `@omni-bridge/core` - Types, validation, API client, config
- `@omni-bridge/evm` - EVM transaction builders and proofs
- `@omni-bridge/near` - NEAR transaction builders
- `@omni-bridge/solana` - Solana transaction builders
- `@omni-bridge/btc` - Bitcoin/UTXO operations
- `@omni-bridge/sdk` - Umbrella re-export package

**Key architectural change:** The new packages return **unsigned transactions** instead of executing them. Consumers sign and broadcast with their own tooling.

**Reference:** See `SPEC.md` for full architecture details.

---

## Task 1: Add EVM Event Parsing ✅ COMPLETE

### Status
Implemented in `packages/evm/src/events.ts`. The `parseInitTransferEvent()` function parses InitTransfer events from EVM transaction receipts. Tested in `e2e/eth-to-near.test.ts`.

### Context
When a transfer is initiated on an EVM chain, the bridge contract emits an `InitTransfer` event. This event contains critical data (nonce, amounts, recipient) needed for:
1. Building NEAR finalization transactions
2. Fast finalization by relayers
3. Tracking transfer status

The `packages/evm/` currently has proof generation (`getEvmProof`) but no event parsing.

### Reference Implementation
- `src/clients/evm.ts` - `getInitTransferEvent()` method (lines 410-459)
- `src/types/evm.ts` - `EvmInitTransferEvent` type (line 36)

### Requirements
1. Add `parseInitTransferLog()` function to `packages/evm/src/`
2. Add `EvmInitTransferEvent` type export
3. The function should parse a transaction receipt and extract the InitTransfer event data

### Expected Interface
```typescript
// packages/evm/src/events.ts

export interface EvmInitTransferEvent {
  sender: string
  tokenAddress: string
  originNonce: bigint
  amount: bigint
  fee: bigint
  nativeTokenFee: bigint
  recipient: string
  message: string
}

/**
 * Parse InitTransfer event from an EVM transaction receipt.
 * Works with both viem and ethers receipt formats.
 */
export function parseInitTransferEvent(
  logs: Array<{ topics: string[]; data: string }>
): EvmInitTransferEvent
```

### Implementation Notes
- Use viem's `decodeEventLog` or manual ABI decoding
- The event signature is: `InitTransfer(address indexed sender, address indexed tokenAddress, uint64 indexed originNonce, uint128 amount, uint128 fee, uint128 nativeTokenFee, string recipient, string message)`
- Export from `packages/evm/src/index.ts`

### Tests
- Add unit tests in `packages/evm/src/events.test.ts`
- Test with mock log data matching real transaction format

---

## Task 2: Add Zcash Support to BTC Package ✅ COMPLETE

### Status
Implemented in `packages/btc/`. The package now supports both Bitcoin and Zcash:
- `packages/btc/src/zcash.ts` - ZIP-317 fee calculation and address encoding
- `packages/btc/src/types.ts` - `BtcBuilderConfig` with `chain: "btc" | "zcash"` option
- `packages/btc/src/builder.ts` - Uses appropriate fee calculator based on chain
- Tests in `packages/btc/tests/zcash.test.ts`

### Context
The `packages/btc/` package currently only supports Bitcoin. Zcash is another UTXO chain supported by the bridge with different:
1. Fee calculation (ZIP-317 marginal fee model)
2. Address-to-script encoding

### Reference Implementation
- `src/services/zcash.ts` - ZcashService class
- `src/utils/zcash.ts` - `getZcashScript()` function

### Requirements
1. Add Zcash fee calculation to `packages/btc/`
2. Add Zcash address encoding
3. Update `BtcBuilderConfig` to accept `chain: "btc" | "zcash"`
4. Builder should use appropriate fee calculator based on chain

### Zcash Fee Calculation (ZIP-317)
```typescript
// From src/services/zcash.ts
function calculateZcashFee(inputs: number, outputs: number): bigint {
  const marginalFee = 5000 // zatoshis per logical action
  const graceActions = 2
  const logicalActions = Math.max(inputs, outputs)
  const fee = Math.max(
    marginalFee * Math.max(graceActions, logicalActions),
    marginalFee * graceActions,
  )
  return BigInt(fee)
}
```

### Zcash Address Encoding
```typescript
// From src/utils/zcash.ts - needs to be added
// Uses different encoding than Bitcoin addresses
export function getZcashScript(address: string): string
```

Look at `src/utils/zcash.ts` for the full implementation.

### Config Changes
```typescript
// packages/btc/src/types.ts
export interface BtcBuilderConfig {
  network: "mainnet" | "testnet"
  chain?: "btc" | "zcash"  // Add this, default to "btc"
  apiUrl?: string
  rpcUrl?: string
  rpcHeaders?: Record<string, string>  // For Zcash API key auth
}
```

### Implementation Notes
- The UTXO selection logic is shared between BTC and Zcash
- Only fee calculation and address encoding differ
- Zcash RPC requires API key authentication via headers

### Tests
- Add Zcash fee calculation tests
- Add Zcash address encoding tests
- Ensure existing BTC tests still pass

---

## Task 3: Add Wormhole VAA Fetching ✅ COMPLETE

### Status
Implemented in `packages/core/src/wormhole.ts` (chose Option C - core package).
- `getWormholeVaa()` function exported from `@omni-bridge/core`
- Handles 120-second timeout for VAA availability
- Returns hex-encoded VAA string for NEAR consumption

### Context
For Solana transfers, the bridge uses Wormhole for cross-chain messaging. After a transfer is initiated on Solana, a Verifiable Action Approval (VAA) must be fetched from the Wormhole guardians. This VAA is then used to finalize the transfer on NEAR.

### Reference Implementation
- `src/proofs/wormhole.ts` - `getVaa()` function

### Current Implementation
```typescript
// src/proofs/wormhole.ts
import { hex } from "@scure/base"
import { serialize, wormhole } from "@wormhole-foundation/sdk"
import evm from "@wormhole-foundation/sdk/evm"
import solana from "@wormhole-foundation/sdk/solana"

export async function getVaa(txHash: string, network: "Mainnet" | "Testnet" | "Devnet") {
  const wh = await wormhole(network, [evm, solana])
  const result = await wh.getVaa(txHash, "Uint8Array", 120_000)
  if (!result) {
    throw new Error("No VAA found")
  }
  const serialized = serialize(result)
  return hex.encode(serialized)
}
```

### Decision Needed: Where Should This Live?

**Option A: `packages/solana/`**
- VAAs are primarily for Solana transfers
- Keeps Solana-related proofs together

**Option B: New `packages/wormhole/`**
- Wormhole is chain-agnostic
- Could be used for future chains

**Option C: `packages/core/`**
- It's a cross-chain concern
- Other packages can import from core

### Recommendation
Add to `packages/solana/` for now since it's the primary use case. Can be extracted later if needed.

### Requirements
1. Add `getWormholeVaa()` function to `packages/solana/`
2. Handle the 120-second timeout for VAA availability
3. Return hex-encoded VAA string for NEAR consumption

### Expected Interface
```typescript
// packages/solana/src/vaa.ts

export type WormholeNetwork = "Mainnet" | "Testnet" | "Devnet"

/**
 * Fetch Wormhole VAA for a Solana transaction.
 * Waits up to 2 minutes for guardians to sign.
 * 
 * @param txSignature - Solana transaction signature
 * @param network - Wormhole network
 * @returns Hex-encoded VAA
 */
export async function getWormholeVaa(
  txSignature: string,
  network: WormholeNetwork
): Promise<string>
```

### Dependencies
- `@wormhole-foundation/sdk`
- `@wormhole-foundation/sdk/solana`
- `@scure/base` (for hex encoding)

### Tests
- Unit test with mocked Wormhole SDK
- Integration test against devnet (optional, slow)

---

## Task 4: Add UTXO Deposit Address Helper ✅ COMPLETE

### Status
Implemented in multiple locations:
- `packages/core/src/bridge.ts` - `Bridge.getUtxoDepositAddress()` for getting deposit addresses
- `packages/core/src/api.ts` - `BridgeAPI.getUtxoDepositAddress()` REST API integration
- `packages/near/src/builder.ts` - UTXO finalization methods:
  - `buildUtxoDepositFinalization()` - builds `verify_deposit` transaction
  - `buildUtxoWithdrawalInit()` - builds `ft_transfer_call` to initiate withdrawal
  - `buildUtxoWithdrawalVerify()` - builds `btc_verify_withdraw` transaction
  - `getUtxoConnectorAddress()` / `getUtxoTokenAddress()` - address helpers
  - `getUtxoConnectorConfig()` - fetch connector configuration
- Tests in `packages/near/tests/utxo.test.ts`

### Context
To deposit BTC/Zcash into the bridge, users send to a deterministic address derived from their recipient info. This address is computed by the NEAR bridge connector contract.

Currently this lives in `src/clients/near-kit.ts` as `getUtxoDepositAddress()`. It needs to be exposed in the new packages.

### Reference Implementation
- `src/clients/near-kit.ts` - `getUtxoDepositAddress()` method (lines 700-746)

### Current Implementation
```typescript
async getUtxoDepositAddress(
  chain: UtxoChain,  // ChainKind.Btc or ChainKind.Zcash
  recipientId: string,
  signerId?: string,
  amount?: bigint,
  fee?: bigint,
): Promise<{ depositAddress: string; depositArgs: BtcDepositArgs }>
```

The method:
1. Constructs a deposit message based on recipient type
2. Calls NEAR contract view `get_user_deposit_address`
3. Returns the BTC/Zcash address to send funds to

### Decision: Where Should This Live?

**Recommended: `packages/core/` Bridge interface**

Since it's a cross-chain operation (NEAR contract returning UTXO address), it fits the Bridge abstraction:

```typescript
// packages/core/src/bridge.ts
interface Bridge {
  // ... existing methods ...
  
  /**
   * Get deposit address for UTXO chain deposits
   */
  getUtxoDepositAddress(
    chain: "btc" | "zcash",
    recipient: string,
    options?: {
      amount?: bigint
      fee?: bigint
    }
  ): Promise<{ address: string; depositArgs: unknown }>
}
```

### Alternative: `packages/near/` NearBuilder

Could also add to NearBuilder since it's a NEAR view call:

```typescript
// packages/near/src/builder.ts
interface NearBuilder {
  // ... existing methods ...
  
  getUtxoDepositAddress(
    chain: "btc" | "zcash",
    recipient: string
  ): Promise<string>
}
```

### Requirements
1. Add method to core Bridge or NEAR builder
2. Handle both direct NEAR recipients and cross-chain (OmniAddress) recipients
3. Return deposit args needed for `finalizeUtxoDeposit`

### Implementation Notes
- For NEAR recipients: simple `{ recipient_id: "account.near" }`
- For cross-chain: includes `post_actions` for automatic bridging after deposit
- Uses `near-kit` for view calls (already a dependency)

---

## Task 5: Add Storage Account ID Utility (Low Priority)

### Context
NEAR uses deterministic storage accounts for pending transfers. The account ID is computed by hashing the transfer message with Borsh serialization. This is used by relayers to look up transfer state.

### Reference Implementation
- `src/utils/storage.ts` - `calculateStorageAccountId()` function

### Current Implementation
```typescript
export function calculateStorageAccountId(transferMessage: TransferMessageForStorage): AccountId {
  // 1. Serialize transfer message with Borsh
  // 2. SHA256 hash
  // 3. Return hex string as implicit account ID
}
```

### Requirements
1. Add to `packages/near/src/utils/storage.ts`
2. Export from `packages/near/src/index.ts`
3. Preserve exact Borsh schema to match on-chain computation

### Implementation Notes
- Uses `@zorsh/zorsh` for Borsh serialization (already in near package)
- Uses `@noble/hashes/sha2` for SHA256
- Schema must match `TransferMessageStorageAccountSchema` exactly

### Tests
- Copy tests from `tests/utils/storage.test.ts`

---

## Task 6: Verify Type Completeness

### Context
The old `src/types/` directory has many type definitions. Need to verify all necessary types are exported from the new packages.

### Files to Check
Old types:
- `src/types/bitcoin.ts` - UTXO types, merkle proof types
- `src/types/chain.ts` - ChainKind enum
- `src/types/common.ts` - OmniAddress, basic types
- `src/types/events.ts` - Event types (InitTransfer, SignTransfer, etc.)
- `src/types/evm.ts` - EVM-specific types
- `src/types/locker.ts` - NEAR locker contract args
- `src/types/mpc.ts` - MPC signature types
- `src/types/omni.ts` - Transfer message types
- `src/types/prover.ts` - Proof types and schemas
- `src/types/sol.ts` - Solana-specific types

### Requirements
Create a checklist comparing old types to new package exports:

| Old Type | New Location | Status |
|----------|--------------|--------|
| ChainKind | @omni-bridge/core | ✅ |
| OmniAddress | @omni-bridge/core | ✅ |
| ... | ... | ... |

### Key Types to Verify
1. All types used in e2e tests
2. All types in public API signatures
3. Borsh schemas for NEAR contract interaction

---

## ~~Task 7: Add Token Utility Functions~~ (REMOVED)

**Status:** Not needed.

- `getBridgedToken()` - Already in `packages/core/src/bridge.ts` ✅
- `isBridgeToken()` - Zero usage in codebase, remove
- `parseOriginChain()` - Zero usage in codebase, remove

These were convenience functions that nobody actually uses. If consumers need offline token address parsing, they can build it themselves or request it as a feature.

---

## Task 7: Update E2E Tests for New SDK ✅ COMPLETE

### Status
All four e2e tests have been updated to use the new SDK packages:
- `e2e/eth-to-near.test.ts` - Updated, uses viem + new packages
- `e2e/near-to-eth.test.ts` - Updated, uses viem + new packages  
- `e2e/near-to-sol.test.ts` - Updated, uses new packages
- `e2e/sol-to-near.test.ts` - Updated, uses new packages

All tests passing on testnet.

### Context
The `e2e/` directory has end-to-end tests using the old SDK. These need to be updated to use the new packages.

### Files to Update
- `e2e/eth-to-near.test.ts`
- `e2e/near-to-eth.test.ts`
- `e2e/near-to-sol.test.ts`
- `e2e/sol-to-near.test.ts`
- `e2e/shared/setup.ts`

### Pattern Change
Old pattern:
```typescript
const ethClient = new EvmBridgeClient(wallet, ChainKind.Eth)
const txHash = await ethClient.initTransfer(transferMessage)
```

New pattern:
```typescript
const bridge = createBridge({ network: "testnet" })
const evm = createEvmBuilder({ network: "testnet" })

const validated = await bridge.validateTransfer(params)
const unsignedTx = evm.buildTransfer(validated)
const txHash = await walletClient.sendTransaction(unsignedTx)
```

### Requirements
1. Update imports to use new packages
2. Change from ethers to viem for EVM tests
3. Use near-kit shim for NEAR tests
4. All tests should pass on testnet

### Test Credentials
- ETH: `ETH_PRIVATE_KEY` env var (Sepolia testnet)
- NEAR: `~/.near-credentials/testnet/omni-sdk-test.testnet.json`
- Solana: `SOL_PRIVATE_KEY` env var (devnet)

---

## Task 9: Document Package Dependencies

### Context
Each package should have minimal dependencies. Need to audit and document.

### Expected Dependencies

**@omni-bridge/core**
- `zod` - API validation
- `near-kit` - NEAR view calls

**@omni-bridge/evm**
- `@omni-bridge/core`
- `viem` - ABI encoding
- `@ethereumjs/mpt` - Merkle proofs
- `@ethereumjs/rlp` - RLP encoding

**@omni-bridge/near**
- `@omni-bridge/core`
- `@zorsh/zorsh` - Borsh serialization
- `near-kit` - Shims and view calls

**@omni-bridge/solana**
- `@omni-bridge/core`
- `@coral-xyz/anchor` - IDL encoding
- `@solana/web3.js`
- `@solana/spl-token`

**@omni-bridge/btc**
- `@omni-bridge/core`
- `@scure/btc-signer` - Bitcoin utilities
- `@scure/base` - Encoding

### Requirements
1. Audit each package.json
2. Remove unused dependencies
3. Ensure peer dependencies are correct
4. Document in each package's README

---

## Task 10: Add Missing Exports to Umbrella Package

### Context
`packages/sdk/` re-exports all other packages. Need to verify completeness.

### Current State
```typescript
// packages/sdk/src/index.ts
export * from "@omni-bridge/btc"
export * from "@omni-bridge/core"
export * from "@omni-bridge/evm"
export * from "@omni-bridge/near"
export * from "@omni-bridge/solana"
```

### Requirements
1. Verify all public APIs are accessible via `@omni-bridge/sdk`
2. Check for naming conflicts between packages
3. Add selective re-exports if conflicts exist

---

## Priority Order

1. **Task 1: EVM Event Parsing** - ✅ COMPLETE
2. **Task 2: Zcash Support** - ✅ COMPLETE
3. **Task 3: Wormhole VAA** - ✅ COMPLETE
4. **Task 4: UTXO Deposit Address** - ✅ COMPLETE
5. **Task 7: E2E Tests** - ✅ COMPLETE
6. **Task 6: Type Completeness** - Ensures nothing missing
7. **Task 5: Storage Account ID** - ✅ COMPLETE (in `packages/near/src/storage.ts`)
8. **Task 8: Dependencies** - Cleanup
9. **Task 9: Umbrella Exports** - Final verification

~~Task 7 (Token Utilities)~~ - Removed, not needed

---

## Running Tests

```bash
# Build all packages
bun run build

# Type check
bun run typecheck

# Lint
bun run lint

# Unit tests
bun run test tests/

# E2E tests (requires testnet credentials)
bun run test e2e/
```

---

## Notes for Agents

1. **Read SPEC.md first** - Contains full architectural context
2. **Check existing implementations** - `src/` has working code to reference
3. **Match patterns** - Follow existing code style in `packages/`
4. **Run tests** - Verify changes don't break existing functionality
5. **Keep packages minimal** - Only add what's necessary
6. **Use Biome** - `bun run lint` for formatting
