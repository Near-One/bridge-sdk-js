# Bridge SDK Examples

Practical examples showing how to use the Omni Bridge SDK for cross-chain transfers.

## New Package Architecture

These examples use the new `@omni-bridge/*` packages:

- `@omni-bridge/core` - Bridge API, validation, and configuration
- `@omni-bridge/btc` - Bitcoin/Zcash transaction building and proof generation
- `@omni-bridge/near` - NEAR transaction building
- `near-kit` - NEAR RPC interactions

## Bitcoin Examples

### 📥 Bitcoin Deposit
**File:** `bitcoin-deposit.ts`

Two-step process to deposit Bitcoin and receive nBTC on NEAR:
1. Generate deposit address via Bridge API
2. Send Bitcoin → Generate proof → Finalize on NEAR

```bash
bun run examples/bitcoin-deposit.ts
```

### 📤 Bitcoin Withdrawal  
**File:** `bitcoin-withdraw.ts`

Build a withdrawal plan from NEAR to Bitcoin:
1. Query available UTXOs
2. Build withdrawal plan with fee calculation
3. Execute via ft_transfer_call on nBTC token

```bash
bun run examples/bitcoin-withdraw.ts
```

## Zcash Examples

### 📥 Zcash Deposit
**File:** `zcash-deposit.ts`

Same flow as Bitcoin but uses Zcash-specific RPC.

```bash
ZCASH_API_KEY=your_key bun run examples/zcash-deposit.ts
```

### 📤 Zcash Withdrawal
**File:** `zcash-withdraw.ts`

Uses ZIP-317 fee calculation automatically.

```bash
ZCASH_API_KEY=your_key bun run examples/zcash-withdraw.ts
```

## Setup

Before running examples:

1. **Replace configuration values** in each script:
   - `NEAR_ACCOUNT` - your testnet account
   - `BITCOIN_ADDRESS` / `ZCASH_ADDRESS` - your destination address
   - `TX_HASH` and `VOUT` (for deposit finalization)

2. **For Zcash:** Set the `ZCASH_API_KEY` environment variable

3. **For deposits:** Have testnet funds ready
   - Get testnet Bitcoin: [bitcoinfaucet.uo1.net](https://bitcoinfaucet.uo1.net)
   - Get testnet Zcash: Use a Zcash testnet faucet

## Architecture

The new SDK returns **unsigned transactions** that you sign with your own tooling:

```typescript
import { createBridge, ChainKind } from "@omni-bridge/core"
import { createBtcBuilder } from "@omni-bridge/btc"
import { Near } from "near-kit"

// 1. Get deposit address
const bridge = createBridge({ network: "testnet" })
const { address } = await bridge.getUtxoDepositAddress(ChainKind.Btc, "recipient.near")

// 2. User sends BTC to address...

// 3. Generate proof
const btcBuilder = createBtcBuilder({ network: "testnet" })
const proof = await btcBuilder.getDepositProof(txHash, vout)

// 4. Finalize on NEAR (with credentials)
const near = new Near({ network: "testnet", privateKey: "..." })
await near.transaction(signer)
  .functionCall(connectorAddress, "verify_deposit", proof, { gas: "300 Tgas" })
  .send()
```

## Network Configuration

Examples use **testnet** by default. For mainnet, update:

```typescript
const NETWORK: Network = "mainnet"
```

## More Examples Coming Soon

- EVM chain transfers (Ethereum, Base, Arbitrum)
- Solana transfers  
- Cross-chain bridging (BTC → ETH via NEAR)
- Integration patterns for dApps

See the main documentation in [`docs/`](../docs/) for detailed guides.
