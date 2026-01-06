# Omni Bridge SDK

![Status](https://img.shields.io/badge/Status-Beta-blue)
![License](https://img.shields.io/badge/License-MIT-green)

TypeScript SDK for cross-chain token transfers via the [Omni Bridge](https://github.com/Near-one/omni-bridge) protocol. Transfer tokens between Ethereum, NEAR, Solana, Base, Arbitrum, Polygon, BNB Chain, Bitcoin, and Zcash.

## Install

```bash
npm install @omni-bridge/sdk
```

Or install only the chains you need:

```bash
npm install @omni-bridge/core @omni-bridge/evm
```

## How It Works

The SDK is a **transaction builder** — it handles all the bridge protocol complexity (validation, encoding, fee calculation) and gives you back unsigned transactions. You then sign and broadcast using whatever library you prefer (viem, ethers, near-api-js, etc.).

This design gives you full control over signing, gas estimation, and transaction management. Whether you're building a frontend wallet integration or a backend service with your own key management, the SDK fits your architecture.

### The Three-Step Flow

Every cross-chain transfer follows the same pattern:

1. **Validate** — Call `bridge.validateTransfer()` with your transfer parameters. The SDK checks that addresses are valid, the token is registered, amounts survive decimal normalization, and returns a `ValidatedTransfer` object.

2. **Build** — Pass the validated transfer to a chain-specific builder (like `evm.buildTransfer()`). You get back an unsigned transaction — a plain object with `to`, `data`, `value`, etc.

3. **Sign & Send** — Use your preferred library to sign and broadcast. The unsigned transaction format is designed to work directly with viem, ethers v6, near-kit, near-api-js, and @solana/web3.js.

```typescript
// 1. Validate
const validated = await bridge.validateTransfer(params)

// 2. Build
const tx = evm.buildTransfer(validated)

// 3. Sign & Send (using viem, ethers, or any wallet)
await walletClient.sendTransaction(tx)
```

## Addresses

The SDK uses **OmniAddress** format — a chain prefix followed by the native address:

```
eth:0x1234...      → Ethereum
base:0x1234...     → Base
arb:0x1234...      → Arbitrum
near:alice.near    → NEAR
sol:ABC123...      → Solana
btc:bc1q...        → Bitcoin
```

This makes it unambiguous which chain an address belongs to, which is essential for cross-chain operations.

## Packages

| Package               | Description                                    |
| --------------------- | ---------------------------------------------- |
| `@omni-bridge/core`   | Validation, types, configuration, API client   |
| `@omni-bridge/evm`    | Ethereum, Base, Arbitrum, Polygon, BNB Chain   |
| `@omni-bridge/near`   | NEAR Protocol                                  |
| `@omni-bridge/solana` | Solana                                         |
| `@omni-bridge/btc`    | Bitcoin, Zcash                                 |
| `@omni-bridge/sdk`    | Umbrella package (re-exports all of the above) |

Install `@omni-bridge/sdk` for everything, or pick individual packages to minimize bundle size.

## Examples

### EVM Chains (Ethereum, Base, Arbitrum, etc.)

EVM builders return transactions that work directly with viem and ethers — no conversion needed.

```typescript
import { createBridge, ChainKind } from "@omni-bridge/core"
import { createEvmBuilder } from "@omni-bridge/evm"
import { createWalletClient, http } from "viem"
import { mainnet } from "viem/chains"

// Create bridge and builder
const bridge = createBridge({ network: "mainnet" })
const evm = createEvmBuilder({ network: "mainnet", chain: ChainKind.Eth })

// Validate transfer parameters
const validated = await bridge.validateTransfer({
  token: "eth:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
  amount: 1000000n, // 1 USDC (6 decimals)
  fee: 0n,
  nativeFee: 0n,
  sender: "eth:0xYourAddress...",
  recipient: "near:alice.near",
})

// Build unsigned transaction
const tx = evm.buildTransfer(validated)

// Send with viem
const walletClient = createWalletClient({ chain: mainnet, transport: http() })
await walletClient.sendTransaction(tx)

// Or with ethers v6
// await signer.sendTransaction(tx)
```

**Don't forget approvals** — for ERC20 tokens, you'll need to approve the bridge contract first:

```typescript
const approvalTx = evm.buildApproval(tokenAddress, amount)
await walletClient.sendTransaction(approvalTx)
```

### NEAR

NEAR transactions require runtime context (nonce, block hash) that the SDK doesn't fetch. Instead, the SDK returns a library-agnostic object, and you use a **shim** to convert it for your preferred library.

```typescript
import { createBridge } from "@omni-bridge/core"
import { createNearBuilder, toNearKitTransaction } from "@omni-bridge/near"
import { Near } from "near-kit"

const bridge = createBridge({ network: "mainnet" })
const nearBuilder = createNearBuilder({ network: "mainnet" })
const near = new Near({ network: "mainnet", privateKey: "ed25519:..." })

const validated = await bridge.validateTransfer({
  token: "near:wrap.near",
  amount: 1000000000000000000000000n, // 1 wNEAR (24 decimals)
  fee: 0n,
  nativeFee: 0n,
  sender: "near:alice.near",
  recipient: "eth:0x1234...",
})

// Build library-agnostic transaction
const unsigned = nearBuilder.buildTransfer(validated, "alice.near")

// Convert to near-kit and send
const result = await toNearKitTransaction(near, unsigned).send()
```

Using near-api-js instead? There's a shim for that too:

```typescript
import { sendWithNearApiJs } from "@omni-bridge/near"

const account = await near.account("alice.near")
await sendWithNearApiJs(account, unsigned)
```

**Storage deposits** — NEAR requires storage deposits before transfers. Check if one is needed:

```typescript
const deposit = await nearBuilder.getRequiredStorageDeposit("alice.near")
if (deposit > 0n) {
  const depositTx = nearBuilder.buildStorageDeposit("alice.near", deposit)
  await toNearKitTransaction(near, depositTx).send()
}
```

### Solana

Solana builders return native `TransactionInstruction[]` that you add to a transaction:

```typescript
import { createBridge } from "@omni-bridge/core"
import { createSolanaBuilder } from "@omni-bridge/solana"
import {
  Connection,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js"

const bridge = createBridge({ network: "mainnet" })
const connection = new Connection("https://api.mainnet-beta.solana.com")
const solana = createSolanaBuilder({ network: "mainnet", connection })

const validated = await bridge.validateTransfer({
  token: "sol:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  amount: 1000000n,
  fee: 0n,
  nativeFee: 0n,
  sender: "sol:YourPublicKey...",
  recipient: "near:alice.near",
})

// Build instructions
const instructions = await solana.buildTransfer(validated, keypair.publicKey)

// Create and send transaction
const { blockhash } = await connection.getLatestBlockhash()
const tx = new Transaction({
  recentBlockhash: blockhash,
  feePayer: keypair.publicKey,
})
tx.add(...instructions)

await sendAndConfirmTransaction(connection, tx, [keypair])
```

## Tracking Transfers

Use the API client to check transfer status and history:

```typescript
import { BridgeAPI } from "@omni-bridge/core"

const api = new BridgeAPI("mainnet")

// Check status by transaction hash
const status = await api.getTransferStatus({ txHash: "0x..." })

// Or by nonce
const status = await api.getTransferStatus({ nonce: "123" })

// Find transfers for an address
const transfers = await api.findTransfers({
  sender: "eth:0x...",
  limit: 10,
})
```

## Relayer Fees

To use the relayer network for automatic finalization, include the relayer fee in your transfer:

```typescript
const fee = await api.getFee(sender, recipient, token)

const validated = await bridge.validateTransfer({
  // ...
  fee: BigInt(fee.transferred_token_fee),
  nativeFee: BigInt(fee.native_token_fee),
})
```

With fees included, relayers will automatically finalize your transfer on the destination chain.

## License

MIT
