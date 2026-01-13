# @omni-bridge/btc

Bitcoin/UTXO transaction builder for Omni Bridge SDK.

## Installation

```bash
npm install @omni-bridge/btc
# or
bun add @omni-bridge/btc
```

## Usage

### Building Withdrawal Plans

```typescript
import { createBtcBuilder, type UTXO } from "@omni-bridge/btc"

const btcBuilder = createBtcBuilder({
  network: "mainnet",
})

// Define UTXOs available for withdrawal
const utxos: UTXO[] = [
  {
    txid: "abc123...",
    vout: 0,
    balance: 100000n, // satoshis
    path: "m/84'/0'/0'/0/0",
  },
  {
    txid: "def456...",
    vout: 1,
    balance: 50000n,
    path: "m/84'/0'/0'/0/1",
  },
]

// Build withdrawal plan
const plan = btcBuilder.buildWithdrawalPlan(
  utxos,
  75000n, // amount in satoshis
  "bc1q...", // target address
  "bc1q...", // change address
  5, // fee rate in sat/vB
)

console.log(plan)
// {
//   inputs: ["abc123...:0", "def456...:1"],
//   outputs: [
//     { value: 75000, script_pubkey: "..." },
//     { value: 24500, script_pubkey: "..." }
//   ],
//   fee: 500n
// }
```

### Deposit Proof Generation

```typescript
import { createBtcBuilder } from "@omni-bridge/btc"

const btcBuilder = createBtcBuilder({ network: "mainnet" })

// Get Merkle proof for a confirmed transaction
const merkleProof = await btcBuilder.getMerkleProof("txid...")
console.log(merkleProof)
// {
//   block_height: 800000,
//   merkle: ["hash1...", "hash2..."],
//   pos: 3
// }

// Get full deposit proof for NEAR verification
const depositProof = await btcBuilder.getDepositProof("txid...", 0)
console.log(depositProof)
// {
//   merkle_proof: [...],
//   tx_block_blockhash: "...",
//   tx_bytes: [...],
//   tx_index: 3,
//   amount: 100000n
// }
```

### UTXO Selection

```typescript
import { createBtcBuilder, linearFeeCalculator } from "@omni-bridge/btc"

const btcBuilder = createBtcBuilder({ network: "mainnet" })

const normalized = [
  { txid: "abc...", vout: 0, amount: 100000n },
  { txid: "def...", vout: 1, amount: 50000n },
]

const result = btcBuilder.selectUtxos(normalized, 75000n, {
  dustThreshold: 546n,
  minChange: 1000n,
  sort: "largest-first",
  feeCalculator: linearFeeCalculator({
    base: 10,
    input: 68,
    output: 31,
    rate: 5, // sat/vB
  }),
})
```

### Address to Script

```typescript
const btcBuilder = createBtcBuilder({ network: "mainnet" })

const scriptPubkey = btcBuilder.addressToScriptPubkey(
  "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
)
// "0014..."
```

### Transaction Broadcasting

```typescript
const btcBuilder = createBtcBuilder({ network: "mainnet" })

// After signing your transaction externally
const txid = await btcBuilder.broadcastTransaction(signedTxHex)
console.log(`Broadcast successful: ${txid}`)
```

## Configuration

```typescript
interface BtcBuilderConfig {
  network: "mainnet" | "testnet"
  chain?: "btc" | "zcash" // defaults to "btc"
  apiUrl?: string // Blockstream API URL (optional)
  rpcUrl?: string // Bitcoin RPC URL for proofs (optional)
  rpcHeaders?: Record<string, string> // Custom RPC headers (optional)
}
```

## API Reference

### `createBtcBuilder(config)`

Creates a new BtcBuilder instance.

### `BtcBuilder.buildWithdrawalPlan(utxos, amount, targetAddress, changeAddress, feeRate?, overrides?)`

Builds a withdrawal transaction plan with optimal UTXO selection.

### `BtcBuilder.getDepositProof(txHash, vout)`

Generates a deposit proof for verifying BTC deposits on NEAR.

### `BtcBuilder.getMerkleProof(txHash)`

Gets the Merkle inclusion proof for a confirmed transaction.

### `BtcBuilder.selectUtxos(utxos, amount, options?)`

Selects optimal UTXOs for a target amount using largest-first algorithm.

### `BtcBuilder.addressToScriptPubkey(address)`

Converts a Bitcoin address to its script_pubkey (hex encoded).

### `BtcBuilder.broadcastTransaction(txHex)`

Broadcasts a signed transaction to the Bitcoin network.

### `BtcBuilder.getTransactionBytes(txHash)`

Fetches raw transaction bytes for a given txid.

### `linearFeeCalculator(params)`

Creates a fee calculator based on transaction virtual size.

```typescript
linearFeeCalculator({
  base: 10, // base vbytes
  input: 68, // vbytes per input
  output: 31, // vbytes per output
  rate: 5, // sat/vB
})
```
