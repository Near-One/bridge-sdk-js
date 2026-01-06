# Bridge SDK Examples

Practical examples showing how to use the Omni Bridge SDK for cross-chain transfers.

## New Package Architecture

These examples use the new `@omni-bridge/*` packages:

- `@omni-bridge/core` - Bridge API, validation, and configuration
- `@omni-bridge/btc` - Bitcoin/Zcash transaction building and proof generation
- `@omni-bridge/near` - NEAR transaction building
- `near-kit` - NEAR RPC interactions

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

## More Examples Coming Soon

- EVM chain transfers (Ethereum, Base, Arbitrum)
- Solana transfers
- Cross-chain bridging (BTC → ETH via NEAR)
- Integration patterns for dApps

See the main documentation in [`docs/`](../docs/) for detailed guides.
