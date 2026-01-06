# @omni-bridge/solana

Solana transaction builder for [Omni Bridge](https://github.com/nearone/bridge-sdk-js).

Builds transaction instructions for Solana that can be added to a Transaction and signed with your preferred wallet/keypair.

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

// 2. Build instructions
const instructions = await solBuilder.buildTransfer(validated, keypair.publicKey)

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
await builder.buildTransfer(validated, payer)

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

## License

MIT
