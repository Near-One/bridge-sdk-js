# Omni Bridge SDK

TypeScript SDK for cross-chain token transfers via the [Omni Bridge](https://github.com/Near-one/omni-bridge) protocol.

## Install

```bash
# Full SDK (all chains)
npm install @omni-bridge/sdk

# Or individual packages
npm install @omni-bridge/core @omni-bridge/evm
```

## Quick Start

```typescript
import { createBridge } from "@omni-bridge/core"
import { createEvmBuilder } from "@omni-bridge/evm"

const bridge = createBridge({ network: "mainnet" })
const evm = createEvmBuilder({ network: "mainnet", chain: ChainKind.Eth })

// 1. Validate transfer
const validated = await bridge.validateTransfer({
  token: "eth:0x...",           // Source token
  amount: 1000000000000000000n, // 1 token (18 decimals)
  fee: 0n,                      // Relayer fee
  nativeFee: 0n,
  sender: "eth:0x...",
  recipient: "near:alice.near",
})

// 2. Build unsigned transaction
const tx = evm.buildTransfer(validated)

// 3. Sign and send with your preferred library
await walletClient.sendTransaction(tx)  // viem
// or: await signer.sendTransaction(tx) // ethers
```

## Packages

| Package | Description |
|---------|-------------|
| `@omni-bridge/core` | Validation, types, API client |
| `@omni-bridge/evm` | Ethereum, Base, Arbitrum, Polygon, BNB Chain |
| `@omni-bridge/near` | NEAR Protocol |
| `@omni-bridge/solana` | Solana |
| `@omni-bridge/btc` | Bitcoin, Zcash |
| `@omni-bridge/sdk` | Umbrella (re-exports all) |

## Usage by Chain

### EVM (Ethereum, Base, Arbitrum, etc.)

Returns transactions compatible with viem and ethers v6:

```typescript
import { createBridge, ChainKind } from "@omni-bridge/core"
import { createEvmBuilder } from "@omni-bridge/evm"

const bridge = createBridge({ network: "mainnet" })
const evm = createEvmBuilder({ network: "mainnet", chain: ChainKind.Eth })

const validated = await bridge.validateTransfer({ /* ... */ })
const tx = evm.buildTransfer(validated)

// With viem
await walletClient.sendTransaction(tx)

// With ethers v6
await signer.sendTransaction(tx)
```

### NEAR

Returns actions that need conversion via shims:

```typescript
import { createBridge } from "@omni-bridge/core"
import { createNearBuilder, toNearKitTransaction } from "@omni-bridge/near"
import { Near } from "near-kit"

const bridge = createBridge({ network: "mainnet" })
const nearBuilder = createNearBuilder({ network: "mainnet" })
const near = new Near({ network: "mainnet", privateKey: "..." })

const validated = await bridge.validateTransfer({ /* ... */ })
const unsigned = nearBuilder.buildTransfer(validated, "alice.near")

// Convert and send
const result = await toNearKitTransaction(near, unsigned).send()
```

Or with near-api-js:

```typescript
import { sendWithNearApiJs } from "@omni-bridge/near"

const account = await near.account("alice.near")
await sendWithNearApiJs(account, unsigned)
```

### Solana

Returns native `TransactionInstruction[]`:

```typescript
import { createBridge } from "@omni-bridge/core"
import { createSolanaBuilder } from "@omni-bridge/solana"
import { Connection, Transaction, sendAndConfirmTransaction } from "@solana/web3.js"

const bridge = createBridge({ network: "mainnet" })
const connection = new Connection("https://api.mainnet-beta.solana.com")
const solana = createSolanaBuilder({ network: "mainnet", connection })

const validated = await bridge.validateTransfer({ /* ... */ })
const instructions = await solana.buildTransfer(validated, keypair.publicKey)

// Build and send transaction
const { blockhash } = await connection.getLatestBlockhash()
const tx = new Transaction({ recentBlockhash: blockhash, feePayer: keypair.publicKey })
tx.add(...instructions)
await sendAndConfirmTransaction(connection, tx, [keypair])
```

## Addresses

All addresses use the `OmniAddress` format with chain prefix:

```typescript
"eth:0x1234..."      // Ethereum
"near:alice.near"    // NEAR
"sol:ABC123..."      // Solana
"base:0x1234..."     // Base
"arb:0x1234..."      // Arbitrum
"btc:bc1q..."        // Bitcoin
```

## API Client

Track transfers and get fee estimates:

```typescript
import { BridgeAPI } from "@omni-bridge/core"

const api = new BridgeAPI("mainnet")

// Get transfer status
const status = await api.getTransferStatus({ txHash: "0x..." })

// Get fee estimate for relayer
const fee = await api.getFee("eth:0x...", "near:alice.near", "eth:0x...")

// Find transfers
const transfers = await api.findTransfers({ sender: "eth:0x..." })
```

## Supported Chains

- Ethereum
- NEAR
- Solana  
- Base
- Arbitrum
- Polygon
- BNB Chain
- Bitcoin
- Zcash

## License

MIT
