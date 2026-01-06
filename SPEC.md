# Omni Bridge SDK v2 Architecture Spec

## Background

### The Problem

The current SDK (`src/`) was designed for frontend use cases where wallets sign and broadcast immediately. Backend consumers (like the relayer team) have different needs:

1. **Need unsigned transactions** - Backends use temporal addresses, need to estimate gas before funding, and manage their own keys
2. **SDK is too heavy** - Single package pulls in ethers + @coral-xyz/anchor + near-kit + wormhole SDK (~2MB+)
3. **Dependency trust issues** - Uses `near-kit` published under a personal npm account
4. **Tight coupling** - Transaction building is coupled to signing/execution, can't get one without the other

The current implementation lives in:
- `src/client.ts` - Main `omniTransfer()` entry point
- `src/factory.ts` - Creates chain-specific clients based on wallet type
- `src/clients/evm.ts` - EVM client (ethers-based, signs immediately)
- `src/clients/near-kit.ts` - NEAR client (near-kit-based, signs immediately)
- `src/clients/solana.ts` - Solana client (Anchor-based, signs immediately)

The pattern in all clients is: validate → build transaction → sign → broadcast → return hash. We need to split this into: validate → build transaction → return unsigned data.

### What Success Looks Like

A backend consumer can:
```typescript
const validated = await bridge.validateTransfer(params)
const unsignedTx = await evm.buildTransfer(validated)
// Now they have { to, data, value } - sign and send however they want
```

No wallet abstraction forced on them. No heavy deps they don't need. Full control.

---

## Overview

A multi-package SDK redesign that separates transaction building from execution. The SDK becomes a "transaction recipe generator" - it handles all bridge protocol logic (validation, encoding, fee calculation) but returns unsigned transactions for consumers to sign and broadcast with their own tooling.

## Goals

1. **Backend flexibility** - Return unsigned transactions so backends can estimate gas, manage keys, and control execution
2. **Lightweight** - Consumers only install packages for chains they use
3. **Library agnostic** - Consumers choose their own signing libraries (ethers, viem, near-api-js, etc.)
4. **No trust issues** - Use well-maintained dependencies from established orgs (no personal npm accounts)

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| RPC data fetching | Fresh every time | Simple, always accurate, no cache invalidation |
| Multi-step transactions | Separate functions | `buildApproval()` and `buildTransfer()` are independent |
| Intents support | Out of scope | Higher-level concern, consumers build on top |
| Error handling | Throw exceptions | Standard JS pattern with typed errors |
| Proof handling | Include in chain packages | EVM proofs in `@omni-bridge/evm`, etc. |
| NEAR storage deposits | SDK fetches balance | Convenience for consumers |
| RPC configuration | Defaults with override | SDK has public RPC URLs, consumer can provide client |
| Package namespace | `@omni-bridge/*` | Chain-agnostic branding |
| EVM chain selection | Inferred from ValidatedTransfer | `sourceChain` determines which network |
| Gas estimation | Document only | Keep SDK simple, consumers estimate themselves |
| Retry behavior | 3x with exponential backoff | Built-in reliability for RPC calls |
| Solana program IDs | In core config | Not a consumer concern |
| Type exports | Export everything | SDK consumers need types for wrappers |
| Network configuration | Factory pattern | `createBridge({ network })` returns configured instance |
| Address validation | Strict | Throw on invalid checksum/format |
| Token lookup | Optional | SDK fetches bridged token if not provided |
| Versioning | Lockstep | All packages share version number |
| Logging | Silent | Consumers add their own observability |
| UTXO operations | Separate `@omni-bridge/btc` package | Clean separation |
| Umbrella package | Yes, `@omni-bridge/sdk` | Convenience for full-stack apps |
| Custom RPC | Public defaults | Consumer can override with own client |
| Unregistered tokens | Throw error | Registration is separate flow |
| Node.js version | 20+ | Current LTS |
| Browser support | Universal | Use Node APIs, bundlers handle polyfills |
| Caching | None | Stateless SDK, consumers cache at their level |
| Token registration | Include | Anyone can deploy tokens, not operator-only |
| Fast finalization | Include | Relayers are SDK consumers too |
| MPC signing | Include | Part of transfer finalization flow |
| API client | Expose publicly | Consumers may want direct API access |

---

## Package Structure

```
packages/
├── core/                 # @omni-bridge/core
├── evm/                  # @omni-bridge/evm
├── near/                 # @omni-bridge/near
├── solana/               # @omni-bridge/solana
├── btc/                  # @omni-bridge/btc
└── sdk/                  # @omni-bridge/sdk (umbrella)
```

---

## `@omni-bridge/core`

The foundation package. Types, validation, configuration, and API client.

### Dependencies

- `zod` - API response validation

### Factory

```typescript
export interface BridgeConfig {
  network: 'mainnet' | 'testnet'
  rpcUrls?: Partial<Record<ChainKind, string>>  // Override defaults
}

export function createBridge(config: BridgeConfig): Bridge

export interface Bridge {
  readonly network: Network
  validateTransfer(params: TransferParams): Promise<ValidatedTransfer>
  getTokenDecimals(token: OmniAddress): Promise<TokenDecimals>
  getBridgedToken(token: OmniAddress, destChain: ChainKind): Promise<OmniAddress | null>
  api: BridgeAPI
}
```

### Types

```typescript
export enum ChainKind {
  Eth = 0,
  Near = 1,
  Sol = 2,
  Btc = 3,
  Base = 4,
  Arb = 5,
  Bnb = 6,
  Pol = 7,
  Zcash = 8,
}

export type OmniAddress =
  | `eth:${string}`
  | `near:${string}`
  | `sol:${string}`
  | `btc:${string}`
  | `base:${string}`
  | `arb:${string}`
  | `bnb:${string}`
  | `pol:${string}`
  | `zcash:${string}`

export interface TransferParams {
  token: OmniAddress
  amount: bigint           // Always BigInt, consumer converts from string
  fee: bigint
  nativeFee: bigint
  sender: OmniAddress
  recipient: OmniAddress
  message?: string
}

export interface ValidatedTransfer {
  params: TransferParams
  sourceChain: ChainKind
  destChain: ChainKind
  normalizedAmount: bigint
  normalizedFee: bigint
  contractAddress: string
  bridgedToken?: OmniAddress  // Looked up if not provided
}

// Unsigned transaction types
export interface EvmUnsignedTransaction {
  type: 'evm'
  chainId: number
  to: `0x${string}`
  data: `0x${string}`
  value: bigint
}

export interface NearUnsignedTransaction {
  type: 'near'
  signerId: string
  receiverId: string
  actions: NearAction[]
}

export interface NearAction {
  type: 'FunctionCall'
  methodName: string
  args: Uint8Array
  gas: bigint
  deposit: bigint
}

export interface SolanaUnsignedTransaction {
  type: 'solana'
  feePayer: string
  instructions: SolanaInstruction[]
}

export interface SolanaInstruction {
  programId: string
  keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>
  data: Uint8Array
}

export interface BtcUnsignedTransaction {
  type: 'btc'
  inputs: Array<{ txid: string; vout: number; value: bigint }>
  outputs: Array<{ address: string; value: bigint }>
}
```

### Validation

```typescript
// Throws on validation failure (strict address validation, amount checks, etc.)
export async function validateTransfer(params: TransferParams): Promise<ValidatedTransfer>

// Utility
export function normalizeAmount(amount: bigint, fromDecimals: number, toDecimals: number): bigint
```

### API Client (Exposed)

```typescript
export class BridgeAPI {
  constructor(network: Network)

  getTransferStatus(params: { nonce?: string; txHash?: string }): Promise<TransferStatus>
  findTransfers(params: FindTransfersParams): Promise<Transfer[]>
  getBridgedToken(token: OmniAddress, destChain: ChainKind): Promise<OmniAddress | null>
  getTokenDecimals(token: OmniAddress): Promise<TokenDecimals | null>
}
```

---

## `@omni-bridge/evm`

Builds unsigned EVM transactions. Uses viem for ABI encoding and RPC calls.

### Dependencies

- `@omni-bridge/core`
- `viem`

### Factory

```typescript
export interface EvmBuilderConfig {
  network: 'mainnet' | 'testnet'
  client?: PublicClient  // Optional viem client override
}

export function createEvmBuilder(config: EvmBuilderConfig): EvmBuilder

export interface EvmBuilder {
  // Transfers
  buildTransfer(validated: ValidatedTransfer): Promise<EvmUnsignedTransaction>
  buildApproval(token: `0x${string}`, spender: `0x${string}`, amount: bigint): EvmUnsignedTransaction
  checkAllowance(token: `0x${string}`, owner: `0x${string}`): Promise<bigint>

  // Finalization
  buildFinalization(payload: TransferMessagePayload, signature: Uint8Array): EvmUnsignedTransaction

  // Token registration (anyone can call)
  buildLogMetadata(token: `0x${string}`): EvmUnsignedTransaction
  buildDeployToken(signature: Uint8Array, metadata: TokenMetadata): EvmUnsignedTransaction

  // Proofs
  fetchProof(txHash: `0x${string}`): Promise<EvmProof>  // Waits for finality
}
```

---

## `@omni-bridge/near`

Builds unsigned NEAR transactions using near-kit.

### Dependencies

- `@omni-bridge/core`
- `near-kit` (transaction building, RPC calls)

### Transaction Type

Returns near-kit's `Transaction` type directly (standard NEAR transaction format):

```typescript
import type { Transaction } from 'near-kit'

// Transaction contains:
// - signerId: string
// - receiverId: string
// - actions: Action[]
// - nonce: bigint
// - publicKey: PublicKey
// - blockHash: Uint8Array
```

### Factory

```typescript
export interface NearBuilderConfig {
  network: 'mainnet' | 'testnet'
  rpcUrl?: string  // Optional override
}

export function createNearBuilder(config: NearBuilderConfig): NearBuilder

export interface NearBuilder {
  // Transfers
  buildTransfer(validated: ValidatedTransfer, signerId: string): Promise<Transaction>
  buildStorageDeposit(signerId: string, amount: bigint): Promise<Transaction>
  getRequiredStorageDeposit(signerId: string): Promise<bigint>

  // Finalization
  buildFinalization(params: FinalizationParams): Promise<Transaction>

  // Token registration
  buildLogMetadata(token: string, signerId: string): Promise<Transaction>
  buildDeployToken(proof: Uint8Array, signerId: string): Promise<Transaction>
  buildBindToken(proof: Uint8Array, signerId: string): Promise<Transaction>

  // MPC Signing (for outbound transfers)
  buildSignTransfer(transferId: TransferId, feeRecipient: string, signerId: string): Promise<Transaction>

  // Fast finalization (for relayers)
  buildFastFinTransfer(params: FastFinTransferParams, signerId: string): Promise<Transaction>

  // UTXO chain interactions (BTC/Zcash)
  buildSubmitBtcTransfer(initEvent: InitTransferEvent, signerId: string): Promise<Transaction>
}
```

---

## `@omni-bridge/solana`

Builds unsigned Solana transactions.

### Dependencies

- `@omni-bridge/core`
- `@coral-xyz/anchor` (IDL-based instruction building)
- `@solana/web3.js`

### Factory

```typescript
export interface SolanaBuilderConfig {
  network: 'mainnet' | 'testnet'
  rpcUrl?: string
}

export function createSolanaBuilder(config: SolanaBuilderConfig): SolanaBuilder

export interface SolanaBuilder {
  // Transfers
  buildTransfer(validated: ValidatedTransfer, payer: string): Promise<SolanaUnsignedTransaction>

  // Finalization
  buildFinalization(payload: TransferMessagePayload, signature: Uint8Array, payer: string): Promise<SolanaUnsignedTransaction>

  // Token registration
  buildLogMetadata(token: string, payer: string): Promise<SolanaUnsignedTransaction>
  buildDeployToken(signature: Uint8Array, metadata: TokenMetadata, payer: string): Promise<SolanaUnsignedTransaction>

  // PDA utilities
  derivePDAs(): SolanaPDAs
}
```

---

## `@omni-bridge/btc`

UTXO chain operations (Bitcoin, Zcash).

### Dependencies

- `@omni-bridge/core`
- `@scure/btc-signer`

### Factory

```typescript
export interface BtcBuilderConfig {
  network: 'mainnet' | 'testnet'
  chain: 'btc' | 'zcash'
}

export function createBtcBuilder(config: BtcBuilderConfig): BtcBuilder

export interface BtcBuilder {
  // Withdrawal planning
  buildWithdrawalPlan(params: WithdrawalParams): BtcUnsignedTransaction
  selectUtxos(available: UTXO[], targetAmount: bigint, feeRate: number): UTXO[]

  // Deposit proofs
  getDepositProof(txHash: string, vout: number): Promise<DepositProof>

  // Transaction verification
  getMerkleProof(txHash: string): Promise<MerkleProof>
}
```

---

## `@omni-bridge/sdk`

Umbrella package that re-exports everything.

### Dependencies

- All other `@omni-bridge/*` packages

```typescript
// Re-exports everything
export * from '@omni-bridge/core'
export * from '@omni-bridge/evm'
export * from '@omni-bridge/near'
export * from '@omni-bridge/solana'
export * from '@omni-bridge/btc'
```

---

## Consumer Usage Examples

### Backend (EVM) - Full Control

```typescript
import { createBridge, TransferParams } from '@omni-bridge/core'
import { createEvmBuilder } from '@omni-bridge/evm'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'

const bridge = createBridge({ network: 'mainnet' })
const evm = createEvmBuilder({ network: 'mainnet' })

async function initiateTransfer(params: TransferParams, temporalKey: `0x${string}`) {
  // 1. Validate (SDK handles decimal normalization, fee checks, etc.)
  const validated = await bridge.validateTransfer(params)

  // 2. Build unsigned transaction
  const transfer = await evm.buildTransfer(validated)

  // 3. Check approval (consumer's responsibility)
  const tokenAddress = params.token.split(':')[1] as `0x${string}`
  const allowance = await evm.checkAllowance(tokenAddress, temporalKey)
  if (allowance < params.amount + params.fee) {
    const approval = evm.buildApproval(tokenAddress, validated.contractAddress, params.amount + params.fee)
    // Sign and send approval...
  }

  // 4. Estimate gas
  const publicClient = createPublicClient({ chain: mainnet, transport: http() })
  const gas = await publicClient.estimateGas({
    to: transfer.to,
    data: transfer.data,
    value: transfer.value,
    account: temporalKey,
  })

  // 5. Sign and send
  const account = privateKeyToAccount(temporalKey)
  const walletClient = createWalletClient({ account, chain: mainnet, transport: http() })

  return walletClient.sendTransaction({
    to: transfer.to,
    data: transfer.data,
    value: transfer.value,
    gas,
  })
}
```

### Frontend - Minimal Wrapper

```typescript
import { createBridge } from '@omni-bridge/core'
import { createEvmBuilder } from '@omni-bridge/evm'
import { useWalletClient } from 'wagmi'

const bridge = createBridge({ network: 'mainnet' })
const evm = createEvmBuilder({ network: 'mainnet' })

async function transfer(params: TransferParams) {
  const { data: walletClient } = useWalletClient()

  const validated = await bridge.validateTransfer(params)
  const tx = await evm.buildTransfer(validated)

  return walletClient.sendTransaction({
    to: tx.to,
    data: tx.data,
    value: tx.value,
  })
}
```

### Relayer - Fast Finalization

```typescript
import { createBridge } from '@omni-bridge/core'
import { createEvmBuilder } from '@omni-bridge/evm'
import { createNearBuilder } from '@omni-bridge/near'

const bridge = createBridge({ network: 'mainnet' })
const evm = createEvmBuilder({ network: 'mainnet' })
const near = createNearBuilder({ network: 'mainnet' })

async function fastFinalize(evmTxHash: `0x${string}`, signerId: string) {
  // 1. Get init transfer event from EVM
  const proof = await evm.fetchProof(evmTxHash)

  // 2. Build fast finalization transaction
  const fastFinTx = await near.buildFastFinTransfer({
    proof,
    signerId,
    // ... other params
  })

  // 3. Sign and send NEAR transaction
  // ... consumer's NEAR signing logic
}
```

---

## Error Handling

All functions throw typed exceptions on failure:

```typescript
export class OmniBridgeError extends Error {
  code: string
  details?: Record<string, unknown>
}

export class ValidationError extends OmniBridgeError {
  code: 'INVALID_AMOUNT' | 'INVALID_ADDRESS' | 'TOKEN_NOT_REGISTERED' | 'DECIMAL_OVERFLOW' | ...
}

export class RpcError extends OmniBridgeError {
  code: 'RPC_TIMEOUT' | 'RPC_ERROR'
  retryCount: number
}

export class ProofError extends OmniBridgeError {
  code: 'PROOF_NOT_READY' | 'PROOF_FETCH_FAILED'
}
```

---

## Retry Behavior

All RPC calls automatically retry 3 times with exponential backoff:
- Attempt 1: immediate
- Attempt 2: 1 second delay
- Attempt 3: 2 second delay

After 3 failures, throws `RpcError`.

---

## Migration Path

1. Build new packages in `packages/` directory (monorepo)
2. Keep existing `omni-bridge-sdk` functional during transition
3. Publish new packages under `@omni-bridge/*` namespace
4. Deprecate old SDK with migration guide
5. Remove old SDK after deprecation period

---

## Repository Structure

```
bridge-sdk-js/
├── packages/
│   ├── core/
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── evm/
│   ├── near/
│   ├── solana/
│   ├── btc/
│   └── sdk/
├── package.json          # Workspace root
├── tsconfig.base.json    # Shared TS config
├── biome.json            # Shared linting
└── SPEC.md
```

Monorepo tooling: bun workspaces with lockstep versioning via changesets.

---

## Implementation Guidance

### What to Reuse from Current Codebase

These can be adapted (logic is correct, just needs decoupling from wallet):
- `src/utils/decimals.ts` - Decimal normalization logic, move to core
- `src/api.ts` - Bridge API client, move to core
- `src/config.ts` - Contract addresses and network config, move to core
- `src/types/` - Most types can be reused, some need adjustment
- `src/proofs/evm.ts` - EVM proof generation, move to evm package
- `src/proofs/wormhole.ts` - Wormhole VAA fetching, may need rework

These need rework to return unsigned transactions instead of executing:
- `src/clients/evm.ts` - Replace ethers with viem, return `{ to, data, value }` instead of signing
- `src/clients/near-kit.ts` - Keep near-kit, use `.build()` instead of `.send()` to return unsigned `Transaction`
- `src/clients/solana.ts` - Keep Anchor, use `.instruction()` instead of `.rpc()` to return unsigned instructions

All three libraries already support building without executing - we just need to stop one step earlier.

### Build Order

Dependencies flow: `core` → chain packages → `sdk`

Recommended order:
1. **core** first - types, config, validation, API client (no chain deps)
2. **evm** second - simplest chain, good template for others
3. **near** third - more complex (storage deposits, multiple operations)
4. **solana** fourth - PDA derivation complexity
5. **btc** fifth - depends on near for some flows
6. **sdk** last - just re-exports

### Non-Obvious Gotchas

1. **Decimal normalization is critical** - Transfers can fail silently if amount doesn't survive decimal conversion. The current `verifyTransferAmount()` logic must be preserved exactly.

2. **NEAR storage deposits are stateful** - Need to check current balance before building transfer. Can't be pure function.

3. **EVM native token transfers are different** - When token is `0x0000...0000`, the `value` field carries the amount, not just the native fee.

4. **Solana PDAs must match on-chain program** - The seed constants in `src/clients/solana.ts` come from the program's IDL. Don't change them.

5. **Gas constants matter** - The `GAS` objects in each client have specific values (e.g., Arbitrum needs higher gas limits). Preserve these.

6. **Borsh serialization** - NEAR proof args use Borsh encoding with specific schemas (`src/types/schemas.ts`). The encoding must match what the contract expects.

7. **Wormhole finality takes time** - `fetchProof()` needs to poll/wait for VAA availability. Current implementation uses retry loops.

---

## Validation Strategy

This section helps verify the implementation is correct.

### Automated Checks

Run these commands to validate work:

```bash
bun run build          # Must compile without errors
bun run typecheck      # Strict mode - no type errors allowed
bun run lint           # Biome linting must pass
bun run test           # All tests must pass
```

### Test Strategy

**Two layers of testing:**

#### 1. Unit Tests (fast, no network)

For pure functions and deterministic output:
- `normalizeAmount()` - decimal conversion edge cases (0 decimals, 18 decimals, overflow)
- Address validation - checksums, format parsing, invalid input handling
- ABI encoding - output matches expected bytes for known inputs
- Error cases - validation rejects invalid amounts, unregistered tokens, bad addresses

These live in `packages/*/tests/` alongside the source code.

#### 2. E2E Tests (real testnet transactions)

The `e2e/` directory has existing end-to-end tests that perform real transfers on testnet:
- `e2e/eth-to-near.test.ts` - ETH → NEAR transfers
- `e2e/near-to-eth.test.ts` - NEAR → ETH transfers
- `e2e/near-to-sol.test.ts` - NEAR → Solana transfers
- `e2e/sol-to-near.test.ts` - Solana → NEAR transfers

These tests currently use the old SDK (ethers, near-kit, Anchor). **Update them to use the new packages.** If the e2e tests pass with the new SDK, the implementation is correct.

The pattern should change from:
```typescript
// OLD: SDK signs and broadcasts
const txHash = await ethClient.initTransfer(transferMessage)
```

To:
```typescript
// NEW: SDK builds, consumer signs
const validated = await bridge.validateTransfer(params)
const unsignedTx = await evm.buildTransfer(validated)
const txHash = await walletClient.sendTransaction(unsignedTx)
```

### Testnet Configuration

Already configured in `.env`:
```bash
ETH_PRIVATE_KEY=...      # Funded on Sepolia
SOL_PRIVATE_KEY=...      # Funded on Solana devnet
SOLANA_KEYPAIR=...       # Alternative format
```

NEAR credentials are in `~/.near-credentials/testnet/omni-sdk-test.testnet.json`

Test setup helpers are in `e2e/shared/setup.ts` - these will need updating to use viem instead of ethers, etc.

### Running E2E Tests

```bash
bun run test e2e/         # Run all e2e tests
bun run test e2e/eth-to-near.test.ts  # Run specific test
```

Set `FULL_E2E_TEST=true` to run complete flows including finalization (takes 30+ mins for light client).

### Acceptance Criteria Per Package

**@omni-bridge/core**
- [ ] `createBridge({ network })` returns configured instance
- [ ] `validateTransfer()` throws `ValidationError` for invalid inputs
- [ ] `validateTransfer()` returns `ValidatedTransfer` for valid inputs
- [ ] All types are exported
- [ ] `BridgeAPI` class is exported and functional

**@omni-bridge/evm**
- [ ] `createEvmBuilder({ network })` returns configured instance
- [ ] `buildTransfer()` returns `EvmUnsignedTransaction` with correct ABI-encoded data
- [ ] `buildApproval()` returns correct ERC20 approve calldata
- [ ] `checkAllowance()` makes RPC call and returns bigint
- [ ] Output is compatible with viem's `sendTransaction()`

**@omni-bridge/near**
- [ ] `createNearBuilder({ network })` returns configured instance
- [ ] `buildTransfer()` returns `NearUnsignedTransaction` with correct actions
- [ ] `getRequiredStorageDeposit()` queries NEAR RPC correctly
- [ ] Actions can be used with any NEAR signing library

**@omni-bridge/solana**
- [ ] `createSolanaBuilder({ network })` returns configured instance
- [ ] `buildTransfer()` returns `SolanaUnsignedTransaction` with correct instructions
- [ ] PDA derivation matches on-chain program expectations
- [ ] Instructions can be used with @solana/web3.js Transaction

**@omni-bridge/btc**
- [ ] `createBtcBuilder({ network, chain })` returns configured instance
- [ ] `selectUtxos()` correctly selects UTXOs for target amount
- [ ] `buildWithdrawalPlan()` returns valid transaction structure

### Definition of Done

1. All automated checks pass: `bun run build && bun run typecheck && bun run lint && bun run test`
2. **E2E tests pass with new SDK**: `bun run test e2e/` - this is the primary validation
3. Each package's acceptance criteria are met
4. Real transactions land on testnet successfully

### Debugging Tips

- Compare ABI encoding output with etherscan's "Input Data" decoder for known transactions
- Compare NEAR actions with explorer.near.org transaction details
- The current `src/clients/*.ts` files show what output should look like (minus the signing step)
- Existing tests in `tests/` show expected behavior patterns
