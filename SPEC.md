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

| Decision                | Choice                              | Rationale                                                   |
| ----------------------- | ----------------------------------- | ----------------------------------------------------------- |
| RPC data fetching       | Fresh every time                    | Simple, always accurate, no cache invalidation              |
| Multi-step transactions | Separate functions                  | `buildApproval()` and `buildTransfer()` are independent     |
| Intents support         | Out of scope                        | Higher-level concern, consumers build on top                |
| Error handling          | Throw exceptions                    | Standard JS pattern with typed errors                       |
| Proof handling          | Include in chain packages           | EVM proofs in `@omni-bridge/evm`, etc.                      |
| NEAR storage deposits   | SDK fetches balance                 | Convenience for consumers                                   |
| RPC configuration       | Defaults with override              | SDK has public RPC URLs, consumer can provide client        |
| Package namespace       | `@omni-bridge/*`                    | Chain-agnostic branding                                     |
| EVM chain selection     | Inferred from ValidatedTransfer     | `sourceChain` determines which network                      |
| Gas estimation          | Document only                       | Keep SDK simple, consumers estimate themselves              |
| Retry behavior          | 3x with exponential backoff         | Built-in reliability for RPC calls                          |
| Solana program IDs      | In core config                      | Not a consumer concern                                      |
| Type exports            | Export everything                   | SDK consumers need types for wrappers                       |
| Network configuration   | Factory pattern                     | `createBridge({ network })` returns configured instance     |
| Address validation      | Strict                              | Throw on invalid checksum/format                            |
| Token lookup            | Optional                            | SDK fetches bridged token if not provided                   |
| Versioning              | Lockstep                            | All packages share version number                           |
| Logging                 | Silent                              | Consumers add their own observability                       |
| UTXO operations         | Separate `@omni-bridge/btc` package | Clean separation                                            |
| Umbrella package        | Yes, `@omni-bridge/sdk`             | Convenience for full-stack apps                             |
| Custom RPC              | Public defaults                     | Consumer can override with own client                       |
| Unregistered tokens     | Throw error                         | Registration is separate flow                               |
| Node.js version         | 20+                                 | Current LTS                                                 |
| Browser support         | Universal                           | Use Node APIs, bundlers handle polyfills                    |
| Caching                 | None                                | Stateless SDK, consumers cache at their level               |
| Token registration      | Include                             | Anyone can deploy tokens, not operator-only                 |
| Fast finalization       | Include                             | Relayers are SDK consumers too                              |
| MPC signing             | Include                             | Part of transfer finalization flow                          |
| API client              | Expose publicly                     | Consumers may want direct API access                        |
| Unsigned tx format      | Library-agnostic plain objects      | SDK returns intent, shims convert to library-specific types |
| Shim pattern            | Optional helpers per library        | `toNearKitTransaction()`, `toViemRequest()`, etc.           |
| Nonce/block hash        | Consumer responsibility             | SDK doesn't fetch; shims or consumers handle it             |

---

## Shim Pattern

The SDK returns **library-agnostic unsigned transactions** - plain objects describing the intent (recipient, data, value, actions) without any library-specific types or signing context.

**Why?**

- NEAR transactions require `nonce`, `blockHash`, `publicKey` that are access-key-specific and time-sensitive
- Nonces can go stale between build and send (especially with concurrent transactions)
- Consumers use different libraries (viem vs ethers, near-kit vs near-api-js)
- SDK stays stateless and doesn't make RPC calls for nonces

**Shims** are optional helper functions that convert SDK output to library-specific types:

```
┌─────────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   SDK buildTransfer │ ──▶ │  Unsigned TX     │ ──▶ │  Shim converts to   │
│   (pure, stateless) │     │  (plain object)  │     │  library-native TX  │
└─────────────────────┘     └──────────────────┘     └─────────────────────┘
                                                              │
                                                              ▼
                                                     ┌─────────────────────┐
                                                     │  Library handles    │
                                                     │  nonce/sign/send    │
                                                     └─────────────────────┘
```

| Chain  | SDK Returns                 | Notes                                                    |
| ------ | --------------------------- | -------------------------------------------------------- |
| EVM    | `EvmUnsignedTransaction`    | Directly compatible with viem and ethers v6             |
| NEAR   | `NearUnsignedTransaction`   | Use `toNearKitTransaction()` or `sendWithNearApiJs()`   |
| Solana | `TransactionInstruction[]`  | Native @solana/web3.js instructions                     |
| BTC    | `BtcUnsignedTransaction`    | Consumers handle signing directly                       |

Shims that need RPC access (like `toNearKitTransaction`) take a client instance as a parameter. The SDK itself never makes RPC calls for nonces or block hashes.

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
  network: "mainnet" | "testnet"
  rpcUrls?: Partial<Record<ChainKind, string>> // Override defaults
}

export function createBridge(config: BridgeConfig): Bridge

export interface Bridge {
  readonly network: Network
  validateTransfer(params: TransferParams): Promise<ValidatedTransfer>
  getTokenDecimals(token: OmniAddress): Promise<TokenDecimals>
  getBridgedToken(
    token: OmniAddress,
    destChain: ChainKind
  ): Promise<OmniAddress | null>
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
  amount: bigint // Always BigInt, consumer converts from string
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
  bridgedToken?: OmniAddress // Looked up if not provided
}

// Unsigned transaction types

// EVM - directly compatible with viem/ethers, no shims needed
export interface EvmUnsignedTransaction {
  to: `0x${string}`
  data: `0x${string}`
  value: bigint
  chainId: number
}

// NEAR - use shims to convert to near-kit or near-api-js format
export interface NearUnsignedTransaction {
  signerId: string
  receiverId: string
  actions: NearAction[]
}

export type NearAction =
  | {
      type: "FunctionCall"
      methodName: string
      args: Uint8Array
      gas: bigint
      deposit: bigint
    }
  | { type: "Transfer"; amount: bigint }
  | { type: "DeployContract"; code: Uint8Array }
  | { type: "CreateAccount" }
  | { type: "DeleteAccount"; beneficiaryId: string }
  | { type: "AddKey"; publicKey: string; permission: NearAccessKeyPermission }
  | { type: "DeleteKey"; publicKey: string }
  | { type: "Stake"; amount: bigint; publicKey: string }

export type NearAccessKeyPermission =
  | { type: "FullAccess" }
  | {
      type: "FunctionCall"
      receiverId: string
      methodNames: string[]
      allowance?: bigint
    }

export interface SolanaUnsignedTransaction {
  feePayer: string
  instructions: SolanaInstruction[]
}

export interface SolanaInstruction {
  programId: string
  keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>
  data: Uint8Array
}

export interface BtcUnsignedTransaction {
  inputs: Array<{ txid: string; vout: number; value: bigint }>
  outputs: Array<{ address: string; value: bigint }>
}
```

### Validation

```typescript
// Throws on validation failure (strict address validation, amount checks, etc.)
export async function validateTransfer(
  params: TransferParams
): Promise<ValidatedTransfer>

// Utility
export function normalizeAmount(
  amount: bigint,
  fromDecimals: number,
  toDecimals: number
): bigint
```

### API Client (Exposed)

```typescript
export class BridgeAPI {
  constructor(network: Network)

  getTransferStatus(params: {
    nonce?: string
    txHash?: string
  }): Promise<TransferStatus>
  findTransfers(params: FindTransfersParams): Promise<Transfer[]>
  getBridgedToken(
    token: OmniAddress,
    destChain: ChainKind
  ): Promise<OmniAddress | null>
  getTokenDecimals(token: OmniAddress): Promise<TokenDecimals | null>
}
```

---

## `@omni-bridge/evm`

Builds unsigned EVM transactions. Returns objects directly compatible with viem and ethers v6 - no shims needed.

### Dependencies

- `@omni-bridge/core`
- `viem` (for ABI encoding only)

### Factory

```typescript
export interface EvmBuilderConfig {
  network: "mainnet" | "testnet"
}

export function createEvmBuilder(config: EvmBuilderConfig): EvmBuilder

export interface EvmBuilder {
  // Transfers
  buildTransfer(validated: ValidatedTransfer): EvmUnsignedTransaction
  buildApproval(
    token: `0x${string}`,
    spender: `0x${string}`,
    amount: bigint
  ): EvmUnsignedTransaction
  buildMaxApproval(token: `0x${string}`, spender: `0x${string}`): EvmUnsignedTransaction

  // Finalization
  buildFinalization(
    payload: TransferPayload,
    signature: Uint8Array,
    chainId: number
  ): EvmUnsignedTransaction

  // Token registration
  buildLogMetadata(token: `0x${string}`, bridgeAddress: `0x${string}`, chainId: number): EvmUnsignedTransaction
  buildDeployToken(
    signature: Uint8Array,
    metadata: TokenMetadata,
    bridgeAddress: `0x${string}`,
    chainId: number
  ): EvmUnsignedTransaction
}

// Transaction type - directly usable with viem and ethers
interface EvmUnsignedTransaction {
  to: `0x${string}`
  data: `0x${string}`
  value: bigint
  chainId: number
}
```

### Usage with viem

```typescript
import { createBridge } from '@omni-bridge/core'
import { createEvmBuilder } from '@omni-bridge/evm'
import { createWalletClient, http } from 'viem'
import { mainnet } from 'viem/chains'

const bridge = createBridge({ network: 'mainnet' })
const evm = createEvmBuilder({ network: 'mainnet' })

const validated = await bridge.validateTransfer(params)
const tx = evm.buildTransfer(validated)

// Pass directly to viem - no conversion needed
const walletClient = createWalletClient({ chain: mainnet, transport: http() })
await walletClient.sendTransaction(tx)
```

### Usage with ethers v6

```typescript
import { createBridge } from '@omni-bridge/core'
import { createEvmBuilder } from '@omni-bridge/evm'
import { Wallet, JsonRpcProvider } from 'ethers'

const bridge = createBridge({ network: 'mainnet' })
const evm = createEvmBuilder({ network: 'mainnet' })

const validated = await bridge.validateTransfer(params)
const tx = evm.buildTransfer(validated)

// Pass directly to ethers - no conversion needed
const provider = new JsonRpcProvider('https://...')
const wallet = new Wallet(privateKey, provider)
await wallet.sendTransaction(tx)
```

---

## `@omni-bridge/near`

Builds unsigned NEAR transactions as library-agnostic action lists. Shims convert to near-kit or near-api-js formats.

### Dependencies

- `@omni-bridge/core`
- `@zorsh/zorsh` (for Borsh serialization of args)
- `near-kit` (for shims, gas/amount parsing, and internal RPC for view calls)

### Factory

```typescript
export interface NearBuilderConfig {
  network: "mainnet" | "testnet"
}

export function createNearBuilder(config: NearBuilderConfig): NearBuilder

export interface NearBuilder {
  // Transfers - returns library-agnostic type
  buildTransfer(validated: ValidatedTransfer, signerId: string): NearUnsignedTransaction
  buildStorageDeposit(signerId: string, amount: bigint): NearUnsignedTransaction

  // Finalization
  buildFinalization(params: FinalizationParams): NearUnsignedTransaction

  // Token registration
  buildLogMetadata(token: string, signerId: string): NearUnsignedTransaction
  buildDeployToken(destinationChain: ChainKind, proverArgs: Uint8Array, signerId: string, deposit: bigint): NearUnsignedTransaction
  buildBindToken(sourceChain: ChainKind, proverArgs: Uint8Array, signerId: string, deposit: bigint): NearUnsignedTransaction

  // MPC Signing (for outbound transfers)
  buildSignTransfer(
    transferId: TransferId,
    feeRecipient: string,
    fee: { fee: string; native_fee: string },
    signerId: string
  ): NearUnsignedTransaction

  // Fast finalization (for relayers)
  buildFastFinTransfer(params: FastFinTransferParams, signerId: string): NearUnsignedTransaction

  // View calls - builder handles RPC internally (uses public endpoints)
  getRequiredStorageDeposit(accountId: string): Promise<bigint>
  isTokenStorageRegistered(tokenId: string): Promise<boolean>
  buildTokenStorageDeposit(tokenId: string, signerId: string): Promise<NearUnsignedTransaction>

  // Proof serialization helpers
  serializeEvmProofArgs(args: EvmVerifyProofArgs): Uint8Array
  serializeWormholeProofArgs(args: WormholeVerifyProofArgs): Uint8Array
}
```

### Shims

```typescript
import type { Near, TransactionBuilder } from "near-kit"
import type { Account } from "@near-js/accounts"
import type { Action } from "@near-js/transactions"

// Convert to near-kit TransactionBuilder (handles nonce/blockHash automatically)
export function toNearKitTransaction(
  near: Near,
  unsigned: NearUnsignedTransaction
): TransactionBuilder

// Convert actions to @near-js/transactions format
export function toNearApiJsActions(unsigned: NearUnsignedTransaction): Action[]

// Send using @near-js/accounts Account (handles nonce/blockHash automatically)
export function sendWithNearApiJs(
  account: Account,
  unsigned: NearUnsignedTransaction
): Promise<FinalExecutionOutcome>
```

The `toNearKitTransaction` shim takes a configured `Near` instance and applies the unsigned transaction's actions to a `TransactionBuilder`. The near-kit library handles nonce, blockHash, and signing automatically when you call `.send()`.

The `sendWithNearApiJs` shim takes an `Account` from `@near-js/accounts` and sends the transaction directly. The Account handles nonce, blockHash, and signing automatically.

### Usage with near-kit

```typescript
import { createBridge } from '@omni-bridge/core'
import { createNearBuilder, toNearKitTransaction } from '@omni-bridge/near'
import { Near } from 'near-kit'

const bridge = createBridge({ network: 'mainnet' })
const nearBuilder = createNearBuilder({ network: 'mainnet' })
const near = new Near({ network: 'mainnet', privateKey: '...' })

// 1. Validate transfer params
const validated = await bridge.validateTransfer({
  token: 'near:wrap.near',
  amount: 1000000000000000000000000n,
  fee: 0n,
  nativeFee: 0n,
  sender: 'near:alice.near',
  recipient: 'eth:0x1234...',
})

// 2. Build library-agnostic transaction
const unsigned = nearBuilder.buildTransfer(validated, 'alice.near')

// 3. Convert to near-kit and send (near-kit handles nonce/blockHash/signing)
const tx = toNearKitTransaction(near, unsigned)
const result = await tx.send()
console.log('Transaction hash:', result.transaction.hash)
```

### Usage with near-api-js

```typescript
import { createBridge } from '@omni-bridge/core'
import { createNearBuilder, sendWithNearApiJs } from '@omni-bridge/near'
import { connect, keyStores } from 'near-api-js'

const bridge = createBridge({ network: 'mainnet' })
const nearBuilder = createNearBuilder({ network: 'mainnet' })

// Connect to NEAR
const near = await connect({
  networkId: 'mainnet',
  keyStore: new keyStores.InMemoryKeyStore(),
  nodeUrl: 'https://rpc.mainnet.near.org',
})
const account = await near.account('alice.near')

// Validate and build
const validated = await bridge.validateTransfer(params)
const unsigned = nearBuilder.buildTransfer(validated, 'alice.near')

// Send (Account handles nonce/blockHash/signing)
const result = await sendWithNearApiJs(account, unsigned)
console.log('Transaction hash:', result.transaction.hash)
```

### Why This Pattern?

NEAR transactions require `publicKey`, `nonce`, and `blockHash` fields that are:

1. **Access-key specific** - nonce is per-key, not per-account
2. **Time-sensitive** - nonce can go stale with concurrent transactions
3. **Signing-context dependent** - you need to know which key signs before building

By returning just `{ signerId, receiverId, actions }`, the SDK stays stateless. The shims + near-kit/near-api-js handle timing-sensitive fields at send time.

### View Calls

The builder handles view calls (like `getRequiredStorageDeposit()`) internally using public RPC endpoints. This keeps the API simple - consumers don't need to pass an RPC client for read-only operations.

---

## `@omni-bridge/solana`

Builds Solana transaction instructions using Anchor. Unlike NEAR, Solana has a single library ecosystem (@solana/web3.js + Anchor), so no shim pattern is needed. The builder returns `TransactionInstruction[]` directly.

### Dependencies

- `@omni-bridge/core`
- `@coral-xyz/anchor` (for IDL-based instruction encoding)
- `@solana/web3.js`
- `@solana/spl-token`

### Factory

```typescript
import type { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js"

export interface SolanaBuilderConfig {
  network: "mainnet" | "testnet"
  connection: Connection  // Required for account lookups
}

export function createSolanaBuilder(config: SolanaBuilderConfig): SolanaBuilder

export interface SolanaBuilder {
  // Transfers - returns instructions, consumer builds Transaction
  buildTransfer(validated: ValidatedTransfer, payer: PublicKey): Promise<TransactionInstruction[]>

  // Finalization
  buildFinalization(
    payload: TransferMessagePayload,
    signature: MPCSignature,
    payer: PublicKey
  ): Promise<TransactionInstruction[]>

  // Token registration
  buildLogMetadata(token: PublicKey, payer: PublicKey): Promise<TransactionInstruction[]>
  buildDeployToken(
    signature: MPCSignature,
    metadata: TokenMetadata,
    payer: PublicKey
  ): Promise<TransactionInstruction[]>

  // PDA derivation (pure, no RPC needed)
  deriveConfig(): PublicKey
  deriveAuthority(): PublicKey
  deriveWrappedMint(token: string): PublicKey
  deriveVault(mint: PublicKey): PublicKey
  deriveSolVault(): PublicKey
}
```

### Why Instructions Instead of Transactions?

Unlike EVM/NEAR where we return library-agnostic objects, Solana returns native `TransactionInstruction[]` because:

1. **Single library ecosystem** - Everyone uses @solana/web3.js, no competing libraries
2. **RPC required anyway** - Account lookups (token program, bridged status) need a Connection
3. **Consumer controls blockhash** - Can use durable nonces, set priority fees, etc.
4. **Batching** - Consumer can combine multiple operations into one transaction

### Usage

```typescript
import { createBridge } from "@omni-bridge/core"
import { createSolanaBuilder } from "@omni-bridge/solana"
import { Connection, Transaction, sendAndConfirmTransaction, Keypair } from "@solana/web3.js"

const bridge = createBridge({ network: "mainnet" })
const connection = new Connection("https://api.mainnet-beta.solana.com")
const solBuilder = createSolanaBuilder({ network: "mainnet", connection })

async function initiateTransfer(params: TransferParams, keypair: Keypair) {
  // 1. Validate
  const validated = await bridge.validateTransfer(params)

  // 2. Build instructions
  const instructions = await solBuilder.buildTransfer(validated, keypair.publicKey)

  // 3. Create transaction with recent blockhash
  const { blockhash } = await connection.getLatestBlockhash()
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: keypair.publicKey })
  tx.add(...instructions)

  // 4. Sign and send
  return sendAndConfirmTransaction(connection, tx, [keypair])
}
```

### PDA Derivation

The builder exposes PDA derivation methods for consumers who need addresses without building transactions:

```typescript
const config = solBuilder.deriveConfig()
const authority = solBuilder.deriveAuthority()
const wrappedMint = solBuilder.deriveWrappedMint("near:wrap.near")
const vault = solBuilder.deriveVault(someMintPubkey)
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
  network: "mainnet" | "testnet"
  chain: "btc" | "zcash"
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
export * from "@omni-bridge/core"
export * from "@omni-bridge/evm"
export * from "@omni-bridge/near"
export * from "@omni-bridge/solana"
export * from "@omni-bridge/btc"
```

---

## Consumer Usage Examples

### Backend (EVM) - Full Control

```typescript
import { createBridge, TransferParams } from "@omni-bridge/core"
import { createEvmBuilder } from "@omni-bridge/evm"
import { createPublicClient, createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { mainnet } from "viem/chains"

const bridge = createBridge({ network: "mainnet" })
const evm = createEvmBuilder({ network: "mainnet" })

async function initiateTransfer(
  params: TransferParams,
  privateKey: `0x${string}`
) {
  // 1. Validate (SDK handles decimal normalization, fee checks, etc.)
  const validated = await bridge.validateTransfer(params)

  // 2. Build unsigned transaction
  const tx = evm.buildTransfer(validated)

  // 3. Check approval if needed
  const publicClient = createPublicClient({ chain: mainnet, transport: http() })
  const tokenAddress = params.token.split(":")[1] as `0x${string}`
  
  // ... check allowance and send approval if needed ...

  // 4. Estimate gas
  const account = privateKeyToAccount(privateKey)
  const gas = await publicClient.estimateGas({ ...tx, account: account.address })

  // 5. Sign and send - tx is directly compatible with viem
  const walletClient = createWalletClient({
    account,
    chain: mainnet,
    transport: http(),
  })

  return walletClient.sendTransaction({ ...tx, gas })
}
```

### Frontend (EVM) - Minimal Wrapper

```typescript
import { createBridge } from "@omni-bridge/core"
import { createEvmBuilder } from "@omni-bridge/evm"
import { useWalletClient } from "wagmi"

const bridge = createBridge({ network: "mainnet" })
const evm = createEvmBuilder({ network: "mainnet" })

async function transfer(params: TransferParams) {
  const { data: walletClient } = useWalletClient()

  const validated = await bridge.validateTransfer(params)
  const tx = evm.buildTransfer(validated)

  // wagmi handles gas estimation, signing, sending
  // tx is directly compatible - no conversion needed
  return walletClient.sendTransaction(tx)
}
```

### Backend (NEAR) - Using near-kit

```typescript
import { createBridge } from "@omni-bridge/core"
import { createNearBuilder, toNearKitTransaction } from "@omni-bridge/near"
import { Near } from "near-kit"

const bridge = createBridge({ network: "mainnet" })
const nearBuilder = createNearBuilder({ network: "mainnet" })
const near = new Near({ network: "mainnet", privateKey: "ed25519:..." })

async function initiateTransfer(params: TransferParams) {
  const signerId = "alice.near"

  // 1. Check if storage deposit is needed
  const requiredDeposit = await nearBuilder.getRequiredStorageDeposit(signerId)
  if (requiredDeposit > 0n) {
    const depositTx = nearBuilder.buildStorageDeposit(signerId, requiredDeposit)
    await toNearKitTransaction(near, depositTx).send()
  }

  // 2. Validate transfer params
  const validated = await bridge.validateTransfer(params)

  // 3. Build library-agnostic transaction
  const unsigned = nearBuilder.buildTransfer(validated, signerId)

  // 4. Convert to near-kit and send (handles nonce, blockHash, signing)
  const tx = toNearKitTransaction(near, unsigned)
  return tx.send()
}
```

### Backend (NEAR) - Using near-api-js

```typescript
import { createBridge } from "@omni-bridge/core"
import { createNearBuilder, sendWithNearApiJs } from "@omni-bridge/near"
import { connect, keyStores } from "near-api-js"

const bridge = createBridge({ network: "mainnet" })
const nearBuilder = createNearBuilder({ network: "mainnet" })

async function initiateTransfer(params: TransferParams) {
  const signerId = "alice.near"

  // Connect to NEAR
  const near = await connect({
    networkId: "mainnet",
    keyStore: new keyStores.InMemoryKeyStore(),
    nodeUrl: "https://rpc.mainnet.near.org",
  })
  const account = await near.account(signerId)

  // Validate and build
  const validated = await bridge.validateTransfer(params)
  const unsigned = nearBuilder.buildTransfer(validated, signerId)

  // Send (Account handles nonce, blockHash, signing)
  return sendWithNearApiJs(account, unsigned)
}
```

### Relayer - Fast Finalization

```typescript
import { createBridge } from '@omni-bridge/core'
import { createEvmBuilder } from '@omni-bridge/evm'
import { createNearBuilder, toNearKitTransaction } from '@omni-bridge/near'
import { Near } from 'near-kit'

const bridge = createBridge({ network: 'mainnet' })
const evm = createEvmBuilder({ network: 'mainnet' })
const nearBuilder = createNearBuilder({ network: 'mainnet' })
const near = new Near({ network: 'mainnet', privateKey: '...' })

async function fastFinalize(evmTxHash: `0x${string}`, evmClient: EvmRpcClient) {
  // 1. Get init transfer proof from EVM
  const proof = await evm.fetchProof(evmClient, evmTxHash)

  // 2. Build fast finalization transaction
  const unsigned = nearBuilder.buildFastFinTransfer({ proof, ... })

  // 3. Convert to near-kit and send
  const tx = toNearKitTransaction(near, unsigned)
  return tx.send()
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

These need rework to return library-agnostic unsigned transaction types:

- `src/clients/evm.ts` - Extract ABI encoding logic, return `{ to, data, value, chainId }`
- `src/clients/near-kit.ts` - Extract action building logic, return `{ signerId, receiverId, actions }`
- `src/clients/solana.ts` - Extract instruction building logic, return `{ feePayer, instructions }`

Shims are new code that convert library-agnostic types to library-specific types:

- `toNearKitTransaction()` - applies actions to a near-kit TransactionBuilder
- `sendWithNearApiJs()` - sends via @near-js/accounts Account

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
- [ ] `toViemRequest()` converts to viem-compatible `TransactionRequest`
- [ ] `toEthersRequest()` converts to ethers-compatible `TransactionRequest`
- [ ] Output works with viem's `sendTransaction()` after shim conversion

**@omni-bridge/near**

- [ ] `createNearBuilder({ network })` returns configured instance
- [ ] `buildTransfer()` returns `NearUnsignedTransaction` with correct actions
- [ ] `getRequiredStorageDeposit()` returns correct amount via view call
- [ ] `toNearKitTransaction()` converts to TransactionBuilder that can be sent
- [ ] `sendWithNearApiJs()` sends via @near-js/accounts Account
- [ ] Real transactions succeed on testnet via both shims

**@omni-bridge/solana**

- [ ] `createSolanaBuilder({ network })` returns configured instance
- [ ] `buildTransfer()` returns `SolanaUnsignedTransaction` with correct instructions
- [ ] `toSolanaTransaction()` creates valid Transaction with fetched blockhash
- [ ] `toSolanaInstructions()` returns usable TransactionInstruction array
- [ ] PDA derivation matches on-chain program expectations

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
