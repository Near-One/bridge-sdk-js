# Bridge SDK Examples

Practical examples showing how to use the Omni Bridge SDK for cross-chain transfers.

## Bitcoin Examples

### 📥 Bitcoin Deposit
**File:** `bitcoin-deposit.ts`

Two-step process to deposit Bitcoin and receive nBTC on NEAR:
1. Generate deposit address
2. Send Bitcoin → Finalize deposit

```bash
bun run examples/bitcoin-deposit.ts
```

### 📤 Bitcoin Withdrawal  
**File:** `bitcoin-withdraw.ts`

Simple one-step withdrawal from NEAR to Bitcoin using the automated method.

```bash
bun run examples/bitcoin-withdraw.ts
```

## Setup

Before running examples:

1. **Replace configuration values** in each script:
   - `NEAR_ACCOUNT` - your testnet account
   - `BITCOIN_ADDRESS` - your Bitcoin address
   - `TX_HASH` and `VOUT` (for deposit finalization)

2. **Ensure NEAR credentials** are in `~/.near-credentials`

3. **For deposits:** Have Bitcoin testnet funds ready
   - Get testnet Bitcoin: [bitcoinfaucet.uo1.net](https://bitcoinfaucet.uo1.net)

## Network Configuration

Examples use **testnet** by default. For mainnet:

```typescript
const NETWORK = "mainnet" as "testnet" | "mainnet"
// Update contract addresses accordingly
```

## Token Deployment

For a detailed guide on how to deploy tokens across different chains using the Omni Bridge protocol, refer to the [Token Deployment Guide](https://github.com/Near-One/bridge-sdk-js/blob/main/docs/token-deployment.md)

## More Examples Coming Soon

- EVM chain transfers (Ethereum, Base, Arbitrum)
- Solana transfers  
- Advanced bridge configurations
- Integration patterns for dApps

See the main documentation in [`docs/`](../docs/) for detailed guides.
