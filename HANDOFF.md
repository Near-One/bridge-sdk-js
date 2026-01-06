# SDK v2 Rewrite Handoff Document

## Prompt for Next Agent

```
I'm continuing work on an SDK v2 rewrite. Please read this handoff document completely, then continue with the remaining tasks.

The SPEC is at /home/ricky/bridge-sdk-js/SPEC.md
The AGENTS.md has repo-specific instructions at /home/ricky/bridge-sdk-js/AGENTS.md

Start by reading those files and the completed packages to understand the patterns.
```

---

## Project Overview

Rewriting `omni-bridge-sdk` from a monolithic package into a multi-package monorepo. The goal is to separate transaction **building** from transaction **signing/execution**, returning unsigned transactions that consumers can sign with their own tooling.

**Repository:** `/home/ricky/bridge-sdk-js`
**Branch:** `rewrite`

---

## What's Been Completed

### All 6 Packages - ✅ Complete

| Package | Status | Notes |
|---------|--------|-------|
| `@omni-bridge/core` | ✅ Complete | Types, config, validation, near-kit for contract queries |
| `@omni-bridge/evm` | ✅ Complete | Builder, ABIs, proof generation |
| `@omni-bridge/near` | ✅ Complete | Builder, shims, MPCSignature class |
| `@omni-bridge/solana` | ✅ Complete | Builder, Anchor IDL, PDA derivation |
| `@omni-bridge/btc` | ✅ Complete | UTXO selection, withdrawal planning, proofs |
| `@omni-bridge/sdk` | ✅ Complete | Re-exports all packages |

### E2E Tests - ✅ NEAR ↔ Solana Complete

| Test | Status | Notes |
|------|--------|-------|
| `e2e/near-to-sol.test.ts` | ✅ Passing | NEAR → Solana transfer |
| `e2e/sol-to-near.test.ts` | ✅ Passing | Solana → NEAR transfer |
| `e2e/eth-to-near.test.ts` | ⏳ Pending | EVM → NEAR (lower priority) |
| `e2e/near-to-eth.test.ts` | ⏳ Pending | NEAR → EVM (lower priority) |

---

## Bug Fixes Applied During E2E Testing

### 1. Core Package: Token Decimals Lookup

**Problem:** `validateTransfer()` was calling a non-existent API endpoint for token decimals. NEAR tokens store decimals under their foreign chain representations, not under the NEAR address.

**Fix:** Updated `packages/core/src/bridge.ts`:
- Added `near-kit` as a dependency
- Changed `getTokenDecimals()` and `getBridgedToken()` to query the NEAR bridge contract directly
- For NEAR → Foreign transfers: look up bridged token first, then query decimals using that address
- For Foreign → NEAR transfers: query decimals using the source token address

### 2. NEAR Package: Nonce Serialization

**Problem:** `buildSignTransfer()` was converting `origin_nonce` to a string, but the NEAR contract expects a u64 (number).

**Fix:** Updated `packages/near/src/builder.ts` line 339:
```typescript
// Before
origin_nonce: transferId.origin_nonce.toString(),
// After  
origin_nonce: Number(transferId.origin_nonce),
```

### 3. NEAR Package: MPCSignature Type

**Problem:** The `MPCSignature` interface had incorrect types. The actual contract returns:
```typescript
{ big_r: { affine_point: string }, s: { scalar: string }, recovery_id: number }
```
But the type defined it as:
```typescript
{ big_r: string, s: string, recovery_id: number }
```

**Fix:** Updated `packages/near/src/types.ts`:
- Changed `MPCSignature` from an interface to a class
- Added proper nested types (`AffinePoint`, `Scalar`)
- Added `toBytes()` method for Solana/EVM signature conversion
- Added `fromRaw()` static constructor

### 4. Package Versions

Updated `near-kit` to `^0.7.0` in both:
- `packages/core/package.json`
- `packages/near/package.json`

---

## Working E2E Test Patterns

### NEAR → Solana (Verified Working)

```typescript
import { ChainKind, createBridge } from "@omni-bridge/core"
import { createNearBuilder, MPCSignature, toNearKitTransaction } from "@omni-bridge/near"
import { createSolanaBuilder } from "@omni-bridge/solana"

// 1. Create builders
const bridge = createBridge({ network: "testnet" })
const nearBuilder = createNearBuilder({ network: "testnet" })
const solBuilder = createSolanaBuilder({ network: "testnet", connection })

// 2. Validate transfer
const validated = await bridge.validateTransfer({
  token: "near:wrap.testnet",
  amount: BigInt("1000000000000000000"),
  fee: 0n,
  nativeFee: 0n,
  sender: `near:${signerId}`,
  recipient: `sol:${solanaPublicKey}`,
})

// 3. Init transfer on NEAR
const initTx = nearBuilder.buildTransfer(validated, signerId)
const initResult = await toNearKitTransaction(near, initTx).send()

// 4. Parse InitTransferEvent from logs
const initEventLog = initResult.receipts_outcome
  .flatMap((receipt) => receipt.outcome.logs)
  .find((log) => log.includes("InitTransferEvent"))
const initEvent = JSON.parse(initEventLog).InitTransferEvent

// 5. Sign transfer on NEAR
const signTx = nearBuilder.buildSignTransfer(
  { origin_chain: ChainKind.Near, origin_nonce: BigInt(initEvent.transfer_message.origin_nonce) },
  feeRecipient,
  { fee: initEvent.transfer_message.fee.fee, native_fee: initEvent.transfer_message.fee.native_fee },
  signerId,
)
const signResult = await toNearKitTransaction(near, signTx).send({ waitUntil: "FINAL" })

// 6. Parse SignTransferEvent
const signEventLog = signResult.receipts_outcome
  .flatMap((receipt) => receipt.outcome.logs)
  .find((log) => log.includes("SignTransferEvent"))
const signEvent = JSON.parse(signEventLog).SignTransferEvent

// 7. Convert signature and finalize on Solana
const mpcSignature = MPCSignature.fromRaw(signEvent.signature)
const finalizeInstructions = await solBuilder.buildFinalization(
  signEvent.message_payload,
  mpcSignature,
  keypair.publicKey,
)

const { blockhash } = await connection.getLatestBlockhash()
const solTx = new Transaction({ recentBlockhash: blockhash, feePayer: keypair.publicKey })
solTx.add(...finalizeInstructions)
await sendAndConfirmTransaction(connection, solTx, [keypair])
```

### Solana → NEAR (Verified Working)

```typescript
import { ChainKind, createBridge } from "@omni-bridge/core"
import { createNearBuilder, toNearKitTransaction } from "@omni-bridge/near"
import { createSolanaBuilder } from "@omni-bridge/solana"
import { getVaa } from "../src/proofs/wormhole.js"

// 1. Create builders
const bridge = createBridge({ network: "testnet" })
const nearBuilder = createNearBuilder({ network: "testnet" })
const solBuilder = createSolanaBuilder({ network: "testnet", connection })

// 2. Validate transfer
const validated = await bridge.validateTransfer({
  token: "sol:TokenMintAddress",
  amount: BigInt("10"),
  fee: 0n,
  nativeFee: 0n,
  sender: `sol:${keypair.publicKey.toString()}`,
  recipient: `near:${recipientAccountId}`,
})

// 3. Init transfer on Solana
const initInstructions = await solBuilder.buildTransfer(validated, keypair.publicKey)
const { blockhash } = await connection.getLatestBlockhash()
const solTx = new Transaction({ recentBlockhash: blockhash, feePayer: keypair.publicKey })
solTx.add(...initInstructions)
const txHash = await sendAndConfirmTransaction(connection, solTx, [keypair])

// 4. Get Wormhole VAA
const vaa = await getVaa(txHash, "Testnet")

// 5. Get bridged token on NEAR for storage deposit
const nearTokenAddress = await bridge.getBridgedToken(validated.params.token, ChainKind.Near)
const tokenAccountId = nearTokenAddress.split(":")[1]

// 6. Finalize on NEAR with storage deposit
const finalizeTx = nearBuilder.buildFinalization({
  sourceChain: ChainKind.Sol,
  signerId,
  vaa,
  storageDepositActions: [
    { token_id: tokenAccountId, account_id: signerId, storage_deposit_amount: null },
  ],
})
await toNearKitTransaction(near, finalizeTx).send()
```

---

## What Remains

### Lower Priority E2E Tests

1. **`e2e/eth-to-near.test.ts`** - EVM → NEAR transfer
2. **`e2e/near-to-eth.test.ts`** - NEAR → EVM transfer

These should follow similar patterns to the Solana tests but use:
- `@omni-bridge/evm` package for EVM builders
- EVM proofs instead of Wormhole VAAs

### Potential Improvements

1. **Storage deposit helper**: The NEAR builder could expose a method to check required storage deposits
2. **Event parsing helpers**: Could add helpers to parse `InitTransferEvent` and `SignTransferEvent` from transaction results
3. **Unit tests**: The new packages could use more unit test coverage

---

## Running Tests

```bash
# Use bun directly for e2e tests (they use bun:test)
bun test e2e/near-to-sol.test.ts
bun test e2e/sol-to-near.test.ts

# Use vitest for unit tests
bun run test tests/

# Build and lint
bun run build
bun run lint
bun run typecheck
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `packages/core/src/bridge.ts` | Bridge validation, NEAR contract queries |
| `packages/near/src/builder.ts` | NEAR transaction builders |
| `packages/near/src/types.ts` | NEAR types including MPCSignature class |
| `packages/near/src/shims.ts` | near-kit and near-api-js adapters |
| `packages/solana/src/builder.ts` | Solana transaction builders |
| `e2e/near-to-sol.test.ts` | Working NEAR → Solana test |
| `e2e/sol-to-near.test.ts` | Working Solana → NEAR test |
| `e2e/shared/fixtures.ts` | Test token and route configuration |

---

## Commit Style

Use Conventional Commits, one-line messages:

```
test(e2e): update near-to-sol test to use new SDK packages
fix(core): query NEAR contract for bridged tokens and decimals
fix(near): correct MPCSignature type to match contract output
```
