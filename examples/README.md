# Bridge SDK Examples

Practical examples showing how to use the Omni Bridge SDK for cross-chain transfers.

## New Package Architecture

These examples use the new `@omni-bridge/*` packages:

- `@omni-bridge/core` - Bridge API, validation, and configuration
- `@omni-bridge/evm` - Ethereum/EVM transaction building (uses viem)
- `@omni-bridge/near` - NEAR transaction building
- `@omni-bridge/solana` - Solana instruction building
- `@omni-bridge/btc` - Bitcoin/Zcash transaction building and proof generation

## Setup

Before running examples, ensure you have NEAR credentials:

```bash
# Option 1: Use near-cli to login (creates ~/.near-credentials)
near login --networkId testnet

# Option 2: Set environment variable
export NEAR_PRIVATE_KEY="ed25519:..."
```

## Bitcoin Examples

### 📥 Bitcoin Deposit (`bitcoin-deposit.ts`)

Two-step process to deposit Bitcoin and receive nBTC on NEAR:

**Step 1: Get deposit address**
```bash
bun run examples/bitcoin-deposit.ts
```

This outputs a Bitcoin address to send testnet BTC to.

**Step 2: Finalize after confirmation**
```bash
# After sending BTC and waiting for 2 confirmations (~20 min)
TX_HASH=<your_tx_hash> VOUT=<output_index> bun run examples/bitcoin-deposit.ts
```

Environment variables:
- `NEAR_ACCOUNT` - NEAR account to receive nBTC (default: `omni-sdk-test.testnet`)
- `TX_HASH` - Bitcoin transaction hash (required for step 2)
- `VOUT` - Output index in the transaction (default: `0`)
- `NETWORK` - `testnet` or `mainnet` (default: `testnet`)

### 📤 Bitcoin Withdrawal (`bitcoin-withdraw.ts`)

Complete 6-step withdrawal flow from NEAR to Bitcoin:

```bash
# Withdraw minimum amount
bun run examples/bitcoin-withdraw.ts

# Withdraw specific amount (satoshis)
AMOUNT=10000 bun run examples/bitcoin-withdraw.ts

# Specify target Bitcoin address
BTC_ADDRESS=tb1q... bun run examples/bitcoin-withdraw.ts
```

The script:
1. Checks nBTC balance and connector config
2. Builds withdrawal plan (selects UTXOs, calculates fees)
3. Initiates withdrawal on NEAR (`ft_transfer_call`)
4. Waits for MPC signing (~1-5 minutes)
5. Extracts signed transaction from NEAR logs
6. Broadcasts to Bitcoin network

Environment variables:
- `NEAR_ACCOUNT` - NEAR account with nBTC (default: `omni-sdk-test.testnet`)
- `BTC_ADDRESS` - Target Bitcoin address
- `AMOUNT` - Amount in satoshis (default: minimum withdrawal)
- `NETWORK` - `testnet` or `mainnet` (default: `testnet`)

## Zcash Examples

### 📥 Zcash Deposit (`zcash-deposit.ts`)

Same flow as Bitcoin but uses Zcash-specific RPC.

```bash
ZCASH_API_KEY=your_key bun run examples/zcash-deposit.ts
```

### 📤 Zcash Withdrawal (`zcash-withdraw.ts`)

Uses ZIP-317 fee calculation automatically.

```bash
ZCASH_API_KEY=your_key bun run examples/zcash-withdraw.ts
```

## Getting Testnet Funds

- **Bitcoin testnet:** [bitcoinfaucet.uo1.net](https://bitcoinfaucet.uo1.net)
- **Zcash testnet:** Use a Zcash testnet faucet
- **NEAR testnet:** [near-faucet.io](https://near-faucet.io)

## Architecture

The SDK returns **unsigned transactions** that you sign with your own tooling:

```typescript
import { createBridge, ChainKind } from "@omni-bridge/core"
import { createBtcBuilder } from "@omni-bridge/btc"
import { createNearBuilder, toNearKitTransaction } from "@omni-bridge/near"
import { Near } from "near-kit"

// Initialize
const bridge = createBridge({ network: "testnet" })
const btcBuilder = createBtcBuilder({ network: "testnet", chain: "btc" })
const nearBuilder = createNearBuilder({ network: "testnet" })

// 1. Get deposit address
const { address } = await bridge.getUtxoDepositAddress(ChainKind.Btc, "recipient.near")

// 2. User sends BTC to address...

// 3. Generate proof after confirmation
const proof = await btcBuilder.getDepositProof(txHash, vout)

// 4. Build and send finalization transaction
const finalizeTx = nearBuilder.buildUtxoDepositFinalization({
  chain: "btc",
  depositMsg: { recipient_id: "recipient.near" },
  txBytes: proof.tx_bytes,
  vout: 0,
  txBlockBlockhash: proof.tx_block_blockhash,
  txIndex: proof.tx_index,
  merkleProof: proof.merkle_proof,
  signerId: "recipient.near",
})

const near = new Near({ network: "testnet", privateKey: "ed25519:..." })
await toNearKitTransaction(near, finalizeTx).send()
```

## Network Configuration

Examples use **testnet** by default. For mainnet:

```bash
NETWORK=mainnet bun run examples/bitcoin-deposit.ts
```

## EVM Examples

### 📤 Ethereum to NEAR (`eth-to-near.ts`)

Bridge USDC from Ethereum to NEAR:

```bash
# Set your Ethereum private key
export ETH_PRIVATE_KEY="0x..."

# Run the transfer
RECIPIENT=alice.near AMOUNT=10 bun run examples/eth-to-near.ts
```

Environment variables:
- `ETH_PRIVATE_KEY` - Ethereum wallet private key (required)
- `RECIPIENT` - NEAR account to receive tokens (default: `alice.near`)
- `AMOUNT` - USDC amount to transfer (default: `10`)
- `NETWORK` - `testnet` or `mainnet` (default: `mainnet`)

### 📥 NEAR to Ethereum (`near-to-eth.ts`)

Bridge wrapped USDC from NEAR back to Ethereum:

```bash
# Option 1: Use private key
export NEAR_PRIVATE_KEY="ed25519:..."

# Option 2: Use near-cli credentials (~/.near-credentials)

# Run the transfer
NEAR_ACCOUNT=alice.near RECIPIENT=0x... bun run examples/near-to-eth.ts
```

## Token Deployment

For a detailed guide on how to deploy tokens across different chains using the Omni Bridge protocol, refer to the [Token Deployment Guide](https://bridge.near.tools/guides/advanced/token-deployment)

## More Examples Coming Soon
Environment variables:
- `NEAR_ACCOUNT` - NEAR account with wrapped tokens (default: `alice.near`)
- `NEAR_PRIVATE_KEY` - NEAR private key (optional if using near-cli)
- `RECIPIENT` - Ethereum address to receive tokens
- `AMOUNT` - Amount in base units (default: `1000000` = 1 USDC)
- `NETWORK` - `testnet` or `mainnet` (default: `mainnet`)

## Solana Examples

### 📤 Solana to NEAR (`solana-to-near.ts`)

Bridge USDC from Solana to NEAR:

```bash
# Set your Solana private key (base58 encoded)
export SOLANA_PRIVATE_KEY="..."

# Run the transfer
RECIPIENT=alice.near AMOUNT=1000000 bun run examples/solana-to-near.ts
```

Environment variables:
- `SOLANA_PRIVATE_KEY` - Solana wallet private key, base58 encoded (required)
- `RECIPIENT` - NEAR account to receive tokens (default: `alice.near`)
- `AMOUNT` - Amount in base units (default: `1000000` = 1 USDC)
- `NETWORK` - `testnet` or `mainnet` (default: `mainnet`)

See the main documentation in [`docs/`](../docs/) for detailed guides.
