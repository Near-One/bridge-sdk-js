# @omni-bridge/solana

SVM transaction builder for [Omni Bridge](https://github.com/nearone/bridge-sdk-js) (Solana and Fogo).

Builds transaction instructions that can be added to a Transaction and signed with your preferred wallet/keypair.

## Installation

```bash
npm install @omni-bridge/solana @omni-bridge/core
```

## Quick Start

```typescript
import { createBridge } from "@omni-bridge/core"
import { createSolanaBuilder } from "@omni-bridge/solana"
import { Connection, Transaction, sendAndConfirmTransaction, Keypair } from "@solana/web3.js"

// Setup - connection is optional, uses public RPC by default
const bridge = createBridge({ network: "mainnet" })
const solBuilder = createSolanaBuilder({ network: "mainnet" })
const keypair = Keypair.fromSecretKey(/* your secret key */)

// 1. Validate transfer
const validated = await bridge.validateTransfer({
  token: "sol:So11111111111111111111111111111111111111112", // wSOL
  amount: 1000000000n, // 1 SOL (9 decimals)
  fee: 0n,
  nativeFee: 0n,
  sender: "sol:YourPublicKey...",
  recipient: "eth:0x1234567890123456789012345678901234567890",
})

// 2. Build instructions (user owns tokens, payer pays fees)
const instructions = await solBuilder.buildTransfer(validated, keypair.publicKey)

// Or with separate payer for fees (e.g., gas refiller pays Wormhole fees)
// const instructions = await solBuilder.buildTransfer(validated, userPubkey, payerPubkey)

// 3. Create and send transaction
const connection = new Connection("https://api.mainnet-beta.solana.com")
const { blockhash } = await connection.getLatestBlockhash()
const tx = new Transaction({ recentBlockhash: blockhash, feePayer: keypair.publicKey })
tx.add(...instructions)

const signature = await sendAndConfirmTransaction(connection, tx, [keypair])
console.log("TX:", signature)
```

## Custom RPC Endpoint

You can provide your own Connection if you need a custom RPC endpoint:

```typescript
import { Connection } from "@solana/web3.js"

const connection = new Connection("https://your-rpc-endpoint.com")
const solBuilder = createSolanaBuilder({ network: "mainnet", connection })
```

## API

### Builder

```typescript
const builder = createSolanaBuilder({
  network: "mainnet" | "testnet",
  connection?: Connection  // Optional - uses public RPC endpoint if not provided
})

// Transfers - returns TransactionInstruction[]
// user: account that owns tokens and authorizes the transfer
// payer: optional account that pays Wormhole fees and rent (defaults to user)
await builder.buildTransfer(validated, user)
await builder.buildTransfer(validated, user, payer)  // separate fee payer

// Finalization
await builder.buildFinalization(payload, signature, payer)

// Token registration
await builder.buildLogMetadata(token, payer)
await builder.buildDeployToken(signature, metadata, payer)

// PDA derivation (pure, no RPC)
builder.deriveConfig()
builder.deriveAuthority()
builder.deriveWrappedMint(token)
builder.deriveVault(mint)
builder.deriveSolVault()
```

### Why Instructions?

Unlike EVM/NEAR, this package returns native `TransactionInstruction[]` because:

1. **Single library ecosystem** - Everyone uses @solana/web3.js
2. **RPC required anyway** - Account lookups need a Connection
3. **Consumer controls blockhash** - Can use durable nonces, set priority fees
4. **Batching** - Combine multiple operations into one transaction

## PDA Derivation

Use PDA methods without building transactions:

```typescript
const config = solBuilder.deriveConfig()
const authority = solBuilder.deriveAuthority()
const wrappedMint = solBuilder.deriveWrappedMint("near:wrap.near")
const vault = solBuilder.deriveVault(someMintPubkey)
const solVault = solBuilder.deriveSolVault()
```

## Native SOL Transfers

When the token is the native SOL address (`11111111111111111111111111111111`), the builder automatically uses `initTransferSol` instead of `initTransfer`.

## Fogo (SVM-Compatible)

Fogo is SVM-compatible and runs the same Anchor program as Solana. The package exports a `createFogoBuilder` factory with the same `SolanaBuilder` interface — only the Wormhole core program address and default RPC differ.

```typescript
import { createFogoBuilder } from "@omni-bridge/solana"

const fogo = createFogoBuilder({ network: "mainnet" })  // defaults to https://mainnet.fogo.io

// Same API as createSolanaBuilder
const instructions = await fogo.buildTransfer(validated, user)
```

Addresses use the `fogo:` prefix (e.g. `fogo:dahPEoZGXfyV58JqqH85okdHmpN8U2q8owgPUXSCPxe`). Source/destination chain is `ChainKind.Fogo`.

> Fogo testnet is not yet deployed. `createFogoBuilder({ network: "testnet" })` throws a `ValidationError` with code `UNSUPPORTED_CHAIN`.

## License

MIT
