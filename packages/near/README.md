# @omni-bridge/near

NEAR transaction builder for [Omni Bridge](https://github.com/nearone/bridge-sdk-js).

Builds unsigned NEAR transactions that can be signed and sent with your preferred library (near-kit or near-api-js).

## Installation

```bash
npm install @omni-bridge/near @omni-bridge/core
```

## Quick Start

```typescript
import { createBridge } from "@omni-bridge/core"
import { createNearBuilder, toNearKitTransaction } from "@omni-bridge/near"
import { Near } from "near-kit"

// Setup
const bridge = createBridge({ network: "mainnet" })
const nearBuilder = createNearBuilder({ network: "mainnet" })
const near = new Near({ network: "mainnet", privateKey: "ed25519:..." })

// 1. Validate transfer
const validated = await bridge.validateTransfer({
  token: "near:wrap.near",
  amount: 1000000000000000000000000n, // 1 token
  fee: 0n,
  nativeFee: 0n,
  sender: "near:alice.near",
  recipient: "eth:0x1234567890123456789012345678901234567890",
})

// 2. Build unsigned transaction
const unsigned = nearBuilder.buildTransfer(validated, "alice.near")

// 3. Send with near-kit
const result = await toNearKitTransaction(near, unsigned).send()
console.log("TX:", result.transaction.hash)
```

## Using near-api-js

```typescript
import { createNearBuilder, sendWithNearApiJs } from "@omni-bridge/near"
import { connect, keyStores } from "near-api-js"

const nearBuilder = createNearBuilder({ network: "mainnet" })

const near = await connect({
  networkId: "mainnet",
  keyStore: new keyStores.InMemoryKeyStore(),
  nodeUrl: "https://rpc.mainnet.near.org",
})
const account = await near.account("alice.near")

const unsigned = nearBuilder.buildTransfer(validated, "alice.near")
const result = await sendWithNearApiJs(account, unsigned)
```

## API

### Builder

```typescript
const builder = createNearBuilder({ network: "mainnet" | "testnet" })

// Transfers
builder.buildTransfer(validated, signerId)
builder.buildStorageDeposit(signerId, amount)

// Finalization
builder.buildFinalization(params)

// Token registration
builder.buildLogMetadata(token, signerId)
builder.buildDeployToken(chain, proverArgs, signerId, deposit)
builder.buildBindToken(chain, proverArgs, signerId, deposit)

// MPC signing
builder.buildSignTransfer(transferId, feeRecipient, fee, signerId)

// Fast finalization (relayers)
builder.buildFastFinTransfer(params, signerId)

// View calls (RPC handled internally)
await builder.getRequiredStorageDeposit(accountId)
await builder.isTokenStorageRegistered(tokenId)
```

### Shims

```typescript
// near-kit
toNearKitTransaction(near, unsigned)  // Returns TransactionBuilder

// near-api-js
toNearApiJsActions(unsigned)          // Returns Action[]
sendWithNearApiJs(account, unsigned)  // Sends and returns result
```

## Storage Deposits

Before transferring tokens, check if storage deposit is needed:

```typescript
const required = await builder.getRequiredStorageDeposit("alice.near")
if (required > 0n) {
  const depositTx = builder.buildStorageDeposit("alice.near", required)
  await toNearKitTransaction(near, depositTx).send()
}
```

## License

MIT
