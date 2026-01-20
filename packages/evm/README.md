# @omni-bridge/evm

EVM transaction builder for [Omni Bridge](https://github.com/nearone/bridge-sdk-js).

Builds unsigned EVM transactions that work directly with viem and ethers.js - no conversion needed.

## Installation

```bash
npm install @omni-bridge/evm @omni-bridge/core
```

## Quick Start

```typescript
import { ChainKind, createBridge } from "@omni-bridge/core"
import { createEvmBuilder } from "@omni-bridge/evm"
import { createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { mainnet } from "viem/chains"

// Setup - specify both network and chain
const bridge = createBridge({ network: "mainnet" })
const evmBuilder = createEvmBuilder({ network: "mainnet", chain: ChainKind.Eth })

// 1. Validate transfer
const validated = await bridge.validateTransfer({
  token: "eth:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
  amount: 1000000n, // 1 USDC (6 decimals)
  fee: 0n,
  nativeFee: 0n,
  sender: "eth:0xYourAddress...",
  recipient: "near:alice.near",
})

// 2. Build unsigned transaction
const tx = evmBuilder.buildTransfer(validated)

// 3. Send with viem - works directly, no conversion needed
const account = privateKeyToAccount("0x...")
const walletClient = createWalletClient({ account, chain: mainnet, transport: http() })
const hash = await walletClient.sendTransaction(tx)
```

## Using ethers.js

```typescript
import { ChainKind, createBridge } from "@omni-bridge/core"
import { createEvmBuilder } from "@omni-bridge/evm"
import { Wallet, JsonRpcProvider } from "ethers"

const bridge = createBridge({ network: "mainnet" })
const evmBuilder = createEvmBuilder({ network: "mainnet", chain: ChainKind.Eth })

const validated = await bridge.validateTransfer({ ... })
const tx = evmBuilder.buildTransfer(validated)

// Works directly with ethers - no conversion needed
const provider = new JsonRpcProvider("https://...")
const wallet = new Wallet(privateKey, provider)
const txResponse = await wallet.sendTransaction(tx)
```

## Supported Chains

| Chain    | Mainnet ID | Testnet ID |
|----------|------------|------------|
| Ethereum | 1          | 11155111 (Sepolia) |
| Arbitrum | 42161      | 421614 (Arb Sepolia) |
| Base     | 8453       | 84532 (Base Sepolia) |
| BNB      | 56         | 97 (BSC Testnet) |
| Polygon  | 137        | 80002 (Amoy) |

```typescript
import { ChainKind } from "@omni-bridge/core"

// Create builder for specific chain
const ethBuilder = createEvmBuilder({ network: "mainnet", chain: ChainKind.Eth })
const arbBuilder = createEvmBuilder({ network: "mainnet", chain: ChainKind.Arb })
const baseBuilder = createEvmBuilder({ network: "mainnet", chain: ChainKind.Base })

// Access configured values
console.log(ethBuilder.chainId)       // 1
console.log(ethBuilder.bridgeAddress) // 0xe00c629afaccb0510995a2b95560e446a24c85b9
```

## API

### Builder

```typescript
const builder = createEvmBuilder({
  network: "mainnet" | "testnet",
  chain: ChainKind.Eth | ChainKind.Arb | ChainKind.Base | ChainKind.Bnb | ChainKind.Pol
})

// Properties
builder.chainId        // Chain ID for configured chain
builder.bridgeAddress  // Bridge contract address

// Transfers
builder.buildTransfer(validated)        // Init transfer to bridge
builder.buildApproval(token, amount)    // ERC20 approval for bridge
builder.buildMaxApproval(token)         // Max approval for bridge

// Finalization (receiving tokens)
builder.buildFinalization(payload, signature)

// Token registration
builder.buildLogMetadata(token)
builder.buildDeployToken(signature, metadata)
```

### EVM Proofs

Generate Merkle Patricia Trie proofs for cross-chain verification:

```typescript
import { getEvmProof, getInitTransferTopic, parseInitTransferEvent } from "@omni-bridge/evm"

// After initiating a transfer, parse the event
const initEvent = parseInitTransferEvent(receipt.logs)
console.log(initEvent.originNonce, initEvent.amount)

// Generate proof for NEAR finalization
const topic = getInitTransferTopic()
const proof = await getEvmProof(txHash, topic, ChainKind.Eth, "mainnet")
```

## Token Approvals

The builder automatically targets the bridge contract for approvals:

```typescript
// Check allowance
const allowance = await publicClient.readContract({
  address: tokenAddress,
  abi: ERC20_ABI,
  functionName: "allowance",
  args: [account.address, evmBuilder.bridgeAddress],
})

// Approve if needed
if (allowance < amount) {
  const approvalTx = evmBuilder.buildMaxApproval(tokenAddress)
  await walletClient.sendTransaction(approvalTx)
}
```

## Transaction Value

The `value` field in the returned transaction is calculated automatically based on token type:

| Token Type | `tx.value` Contains |
|------------|---------------------|
| ERC20 tokens | `nativeFee` only |
| Native tokens (ETH, BNB, etc.) | `amount + nativeFee` |

```typescript
// ERC20 transfer with native fee
const validated = await bridge.validateTransfer({
  token: "eth:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
  amount: 1000000n,
  nativeFee: 1000000000000000n, // 0.001 ETH
  ...
})
const tx = evmBuilder.buildTransfer(validated)
// tx.value = 1000000000000000n (just the nativeFee)

// Native ETH transfer
const validated = await bridge.validateTransfer({
  token: "eth:0x0000000000000000000000000000000000000000", // Native ETH
  amount: 1000000000000000000n, // 1 ETH
  nativeFee: 1000000000000000n, // 0.001 ETH
  ...
})
const tx = evmBuilder.buildTransfer(validated)
// tx.value = 1001000000000000000n (amount + nativeFee)
```

**Note:** For native token transfers, the `fee` parameter (token fee) is not supported — use `nativeFee` instead.

## Finalization

Finalize transfers from other chains:

```typescript
import { MPCSignature } from "@omni-bridge/near"

// Parse signature from NEAR sign_transfer event
const mpcSignature = MPCSignature.fromRaw(signEvent.signature)
const signatureBytes = mpcSignature.toBytes(true) // forEvm = true

const payload = {
  destinationNonce: BigInt(event.destination_nonce),
  originChain: ChainKind.Near,
  originNonce: BigInt(event.origin_nonce),
  tokenAddress: "0x..." as `0x${string}`,
  amount: BigInt(event.amount),
  recipient: "0x..." as `0x${string}`,
  feeRecipient: event.fee_recipient ?? "",
}

const tx = evmBuilder.buildFinalization(payload, signatureBytes)
await walletClient.sendTransaction(tx)
```

## License

MIT
