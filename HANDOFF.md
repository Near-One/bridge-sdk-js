# SDK v2 Rewrite Handoff Document

## Prompt for Next Agent

```
I'm continuing work on an SDK v2 rewrite. Please read this handoff document completely, then continue implementing the e2e tests using the new SDK packages.

The SPEC is at /home/ricky/bridge-sdk-js/SPEC.md
The AGENTS.md has repo-specific instructions at /home/ricky/bridge-sdk-js/AGENTS.md

Start by reading those files and the completed packages to understand the patterns, then update the e2e tests to use the new SDK. Focus on NEAR ↔ Solana flows first.
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
| `@omni-bridge/core` | ✅ Complete | Types, config, API, validation |
| `@omni-bridge/evm` | ✅ Complete | Builder, ABIs, proof generation |
| `@omni-bridge/near` | ✅ Complete | Builder, shims for near-kit/near-api-js |
| `@omni-bridge/solana` | ✅ Complete | Builder, Anchor IDL, PDA derivation |
| `@omni-bridge/btc` | ✅ Complete | UTXO selection, withdrawal planning, proofs |
| `@omni-bridge/sdk` | ✅ Complete | Re-exports all packages |

---

## What Remains: E2E Test Updates

### Goal

Update the existing e2e tests to use the new SDK v2 packages instead of the old monolithic SDK. This validates that the new architecture works end-to-end and provides working examples for consumers.

### Priority: NEAR ↔ Solana Flows

Focus on these two tests first:

1. **`e2e/near-to-sol.test.ts`** - NEAR → Solana transfer
2. **`e2e/sol-to-near.test.ts`** - Solana → NEAR transfer

These flows exercise:
- Transaction building with new SDK
- Signing with near-kit and @solana/web3.js
- Wormhole VAA for cross-chain proofs
- Finalization on destination chain

### Current vs New Flow Comparison

#### NEAR → Solana (Old SDK)

```typescript
// OLD: SDK handles everything internally
const nearClient = new NearBridgeClient(nearKitInstance, ...)
const initResult = await nearClient.initTransfer(transferMessage)
const signResult = await nearClient.signTransfer(initResult, sender)
const finalizeResult = await solanaClient.finalizeTransfer(signResult.message_payload, signResult.signature)
```

#### NEAR → Solana (New SDK)

```typescript
import { createBridge } from "@omni-bridge/core"
import { createNearBuilder, toNearKitTransaction } from "@omni-bridge/near"
import { createSolanaBuilder } from "@omni-bridge/solana"

// 1. Create builders
const bridge = createBridge({ network: "testnet" })
const nearBuilder = createNearBuilder({ network: "testnet" })
const solBuilder = createSolanaBuilder({ network: "testnet", connection })

// 2. Validate transfer params
const validated = await bridge.validateTransfer({
  token: "near:wrap.testnet",
  amount: 1000000000000000000000000n,
  fee: 0n,
  nativeFee: 0n,
  sender: "near:alice.testnet",
  recipient: "sol:SolanaPublicKeyHere",
})

// 3. Build unsigned NEAR transaction
const unsignedTx = nearBuilder.buildTransfer(validated, "alice.testnet")

// 4. Convert to near-kit and send
const tx = toNearKitTransaction(near, unsignedTx)
const initResult = await tx.send()

// 5. Build sign transfer transaction
const signTx = nearBuilder.buildSignTransfer(
  { origin_chain: ChainKind.Near, origin_nonce: initResult.origin_nonce },
  feeRecipient,
  { fee: "0", native_fee: "0" },
  "alice.testnet"
)
const signResult = await toNearKitTransaction(near, signTx).send()

// 6. Build finalization on Solana
const instructions = await solBuilder.buildFinalization(
  signResult.message_payload,
  signResult.signature,
  payer
)

// 7. Build and send Solana transaction
const { blockhash } = await connection.getLatestBlockhash()
const solTx = new Transaction({ recentBlockhash: blockhash, feePayer: payer })
solTx.add(...instructions)
const finalizeResult = await sendAndConfirmTransaction(connection, solTx, [keypair])
```

#### Solana → NEAR (Old SDK)

```typescript
// OLD: SDK handles everything internally
const solanaClient = new SolanaBridgeClient(provider)
const txHash = await solanaClient.initTransfer(transferMessage)
const vaa = await getVaa(txHash, "Testnet")
const result = await nearClient.finalizeTransfer(tokenId, recipient, amount, ChainKind.Sol, signerId, vaa, undefined, ProofKind.InitTransfer)
```

#### Solana → NEAR (New SDK)

```typescript
import { createBridge } from "@omni-bridge/core"
import { createNearBuilder, toNearKitTransaction } from "@omni-bridge/near"
import { createSolanaBuilder } from "@omni-bridge/solana"

// 1. Create builders
const bridge = createBridge({ network: "testnet" })
const nearBuilder = createNearBuilder({ network: "testnet" })
const solBuilder = createSolanaBuilder({ network: "testnet", connection })

// 2. Validate transfer params
const validated = await bridge.validateTransfer({
  token: "sol:TokenMintAddress",
  amount: 1000000n,
  fee: 0n,
  nativeFee: 0n,
  sender: "sol:SolanaPublicKey",
  recipient: "near:alice.testnet",
})

// 3. Build Solana init transfer instructions
const instructions = await solBuilder.buildTransfer(validated, payer)

// 4. Build and send Solana transaction
const { blockhash } = await connection.getLatestBlockhash()
const solTx = new Transaction({ recentBlockhash: blockhash, feePayer: payer })
solTx.add(...instructions)
const txHash = await sendAndConfirmTransaction(connection, solTx, [keypair])

// 5. Get Wormhole VAA (same as before)
const vaa = await getVaa(txHash, "Testnet")

// 6. Build NEAR finalization
const finalizeTx = nearBuilder.buildFinalization({
  sourceChain: ChainKind.Sol,
  signerId: "alice.testnet",
  vaa: vaa,
  storageDepositActions: [],
})

// 7. Send via near-kit
const result = await toNearKitTransaction(near, finalizeTx).send()
```

---

## Key Files to Modify

### E2E Tests (Priority Order)

1. **`e2e/near-to-sol.test.ts`** - NEAR → Solana manual flow
2. **`e2e/sol-to-near.test.ts`** - Solana → NEAR manual flow
3. **`e2e/shared/setup.ts`** - Test account setup (may need adjustments)
4. **`e2e/eth-to-near.test.ts`** - EVM → NEAR (lower priority)
5. **`e2e/near-to-eth.test.ts`** - NEAR → EVM (lower priority)

### New Package Locations

- `packages/core/src/` - Core types, validation, API
- `packages/near/src/` - NEAR builder and shims
- `packages/solana/src/` - Solana builder
- `packages/evm/src/` - EVM builder
- `packages/btc/src/` - Bitcoin builder

---

## Flow Details

### NEAR → Solana Flow Steps

1. **Validate** - `bridge.validateTransfer()` validates params, normalizes decimals
2. **Init Transfer** - `nearBuilder.buildTransfer()` → send via near-kit → get `origin_nonce`
3. **Sign Transfer** - `nearBuilder.buildSignTransfer()` → send via near-kit → get `signature` + `message_payload`
4. **Finalize** - `solBuilder.buildFinalization()` → send via @solana/web3.js

### Solana → NEAR Flow Steps

1. **Validate** - `bridge.validateTransfer()` validates params, normalizes decimals
2. **Init Transfer** - `solBuilder.buildTransfer()` → send via @solana/web3.js → get tx hash
3. **Get VAA** - `getVaa(txHash, network)` → wait for Wormhole guardian signatures
4. **Finalize** - `nearBuilder.buildFinalization()` → send via near-kit

---

## Key Patterns

### Transaction Building vs Signing

The new SDK **only builds** transactions. Signing and sending is consumer responsibility:

```typescript
// SDK builds unsigned transaction
const unsigned = nearBuilder.buildTransfer(validated, signerId)

// Consumer signs and sends (via shim for convenience)
const tx = toNearKitTransaction(near, unsigned)
const result = await tx.send()
```

### Shim Usage

NEAR has two shim options:

```typescript
// Option 1: near-kit (recommended)
import { toNearKitTransaction } from "@omni-bridge/near"
const tx = toNearKitTransaction(near, unsigned)
await tx.send()

// Option 2: near-api-js
import { sendWithNearApiJs } from "@omni-bridge/near"
await sendWithNearApiJs(account, unsigned)
```

Solana returns native `TransactionInstruction[]`:

```typescript
const instructions = await solBuilder.buildTransfer(validated, payer)
const tx = new Transaction().add(...instructions)
await sendAndConfirmTransaction(connection, tx, [keypair])
```

### Parsing Results

The new SDK doesn't parse transaction results. Tests need to:
1. Parse init transfer events to get `origin_nonce`
2. Parse sign transfer results to get `signature` and `message_payload`
3. These are returned from NEAR contract calls in the transaction result

---

## Test Configuration

### Environment Variables

```bash
NEAR_PRIVATE_KEY=ed25519:...   # NEAR testnet account
SOL_PRIVATE_KEY=...            # Solana devnet keypair (base64)
ETH_PRIVATE_KEY=0x...          # Sepolia account
```

### Test Accounts

- **NEAR**: `omni-sdk-test.testnet` (credentials in `~/.near-credentials/testnet/`)
- **Solana**: Devnet keypair from `SOL_PRIVATE_KEY`
- **Ethereum**: Sepolia account from `ETH_PRIVATE_KEY`

### Running Tests

```bash
bun run test e2e/near-to-sol.test.ts   # Single test
bun run test e2e/                       # All e2e tests

# For full finalization (slow, waits for light client)
FULL_E2E_TEST=true bun run test e2e/
```

---

## Implementation Notes

### 1. Event Parsing

The old SDK parsed events internally. The new tests need to extract:

```typescript
// From NEAR init transfer result
interface InitTransferEvent {
  transfer_message: {
    origin_nonce: number
    // ...
  }
}

// From NEAR sign transfer result
interface SignTransferResult {
  signature: Uint8Array
  message_payload: TransferMessagePayload
}
```

Look at `src/clients/near-kit.ts` for parsing logic to adapt.

### 2. Wormhole VAA

The VAA fetching remains the same - use `src/proofs/wormhole.ts`:

```typescript
import { getVaa } from "../src/proofs/wormhole.js"
const vaa = await getVaa(txHash, "Testnet")
```

### 3. Storage Deposits

For NEAR finalization, may need storage deposits:

```typescript
// Check if storage deposit needed
const requiredDeposit = await nearBuilder.getRequiredStorageDeposit(signerId)
if (requiredDeposit > 0n) {
  const depositTx = nearBuilder.buildStorageDeposit(signerId, requiredDeposit)
  await toNearKitTransaction(near, depositTx).send()
}
```

---

## Commands

```bash
bun install              # Install dependencies
bun run build            # Build all packages
bun run test e2e/        # Run e2e tests
bun run lint             # Biome linting
```

---

## Success Criteria

1. **`e2e/near-to-sol.test.ts`** passes using new SDK packages
2. **`e2e/sol-to-near.test.ts`** passes using new SDK packages
3. Tests demonstrate the full flow: validate → build → sign → send → finalize
4. No imports from old `src/` directory (except `src/proofs/wormhole.ts` for VAA)
5. Code is clean and follows existing test patterns

---

## Commit Style

Use Conventional Commits, one-line messages:

```
test(e2e): update near-to-sol test to use new SDK packages
test(e2e): update sol-to-near test to use new SDK packages
```
