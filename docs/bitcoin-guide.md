# Bitcoin Bridge Guide

Simple guide for Bitcoin ↔ NEAR transfers using the Omni Bridge SDK.

## Quick Start

```typescript
import {
  ChainKind,
  NearBridgeClient,
  addresses,
  setNetwork,
} from "@near-one/bridge-sdk"

// Setup
setNetwork("testnet") // or "mainnet"
const bridgeClient = new NearBridgeClient(account, addresses.near)

// Deposit: Bitcoin → NEAR (2 steps)
const { depositAddress, depositArgs } =
  await bridgeClient.getUtxoDepositAddress(ChainKind.Btc, "your.near")
// Send Bitcoin to depositAddress, then:
await bridgeClient.finalizeUtxoDeposit(ChainKind.Btc, txHash, vout, depositArgs)

// Withdraw: NEAR → Bitcoin (1 step)
const btcTxHash = await bridgeClient.executeUtxoWithdrawal(
  ChainKind.Btc,
  "bc1qyour-bitcoin-address...",
  BigInt(100000) // Amount in satoshis
)
```

## Deposit Flow: Bitcoin → NEAR

### Step 1: Get Deposit Address

```typescript
const depositResult = await bridgeClient.getUtxoDepositAddress(
  ChainKind.Btc,
  "recipient.near"
)
console.log(`Send Bitcoin to: ${depositResult.depositAddress}`)

// Check minimum amount
const config = await bridgeClient.getUtxoBridgeConfig(ChainKind.Btc)
console.log(`Minimum: ${config.min_deposit_amount} satoshis`)
```

### Step 2: Send Bitcoin & Finalize

```typescript
// 1. Send Bitcoin to the address above using any wallet
// 2. Wait for confirmation
// 3. Find your transaction hash and output index (vout)

const nearTxHash = await bridgeClient.finalizeUtxoDeposit(
  ChainKind.Btc,
  "your_bitcoin_tx_hash",
  0, // output index (usually 0 or 1)
  depositResult.depositArgs
)

console.log(`Success! NEAR TX: ${nearTxHash}`)
// You now have nBTC in your NEAR account
```

**Finding the Output Index (vout):**

- Check your Bitcoin transaction on [blockstream.info](https://blockstream.info)
- Find the output that goes to your deposit address
- The position (starting from 0) is your `vout`

## Withdrawal Flow: NEAR → Bitcoin

**Note**: Change addresses for Bitcoin transactions are automatically configured by the bridge. Users only specify the target withdrawal address.

### Fee Structure for UTXO Chains

Bitcoin and Zcash transfers support specifying maximum network fees via the `options` field:

```typescript
const transfer: OmniTransferMessage = {
  tokenAddress: "near:nbtc.near",
  recipient: "btc:bc1q...",
  amount: BigInt(100000),
  fee: BigInt(5000), // Bridge fee (includes protocol fee calculated by contract)
  nativeFee: BigInt(1000), // NEAR gas fee
  options: {
    maxFee: BigInt(5000), // Maximum BTC network fee in satoshis
  }
}
```

**Fee Options:**
- `maxFee`: Maximum BTC/Zcash network fee allowed (in satoshis)
  - Automatically converted to nested message format: `{"MaxGasFee":5000}` (number, not string)
  - Protects you from excessive network fees
  - The contract validates the actual gas fee doesn't exceed this limit
  - Cannot be used together with the `message` field

**Fee Breakdown:**
- `fee`: Bridge fee paid to the protocol (use `OmniBridgeAPI.getFee()` to get the correct value)
- `nativeFee`: NEAR transaction gas fee
- `options.maxFee`: Cap on Bitcoin/Zcash network fee (optional but recommended)

**Advanced**: You can manually construct the `message` field if needed (this overrides `maxFee`):
```typescript
const transfer: OmniTransferMessage = {
  // ... other fields
  message: JSON.stringify({
    MaxGasFee: 5000  // Number (not string) - in satoshis
  })
}
```

### Simple Method (Recommended)

```typescript
// All steps automated in one call
const bitcoinTxHash = await bridgeClient.executeUtxoWithdrawal(
  ChainKind.Btc,
  "bc1qyour-bitcoin-address...", // Target address
  BigInt(50000) // Amount in satoshis
)

console.log(`Bitcoin TX: ${bitcoinTxHash}`)
```

### Manual Method (Step-by-step)

```typescript
// Step 1: Initialize
const init = await bridgeClient.initUtxoWithdrawal(
  ChainKind.Btc,
  "bc1qyour-bitcoin-address...",
  BigInt(50000) // Amount in satoshis
)

// Step 2: Wait for MPC signing (returns the NEAR transaction that completed signing)
const nearTxHash = await bridgeClient.waitForUtxoTransactionSigning(
  ChainKind.Btc,
  init.nearTxHash
)

// Step 3: Broadcast to Bitcoin
const bitcoinTxHash = await bridgeClient.finalizeUtxoWithdrawal(
  ChainKind.Btc,
  nearTxHash
)
```

## Configuration

### Networks

```typescript
// Testnet (for development)
setNetwork("testnet")
const client = new NearBridgeClient(account, addresses.near)

// Mainnet (for production)
setNetwork("mainnet")
const client = new NearBridgeClient(account, addresses.near)
```

### Bridge Settings

```typescript
const config = await bridgeClient.getUtxoBridgeConfig(ChainKind.Btc)

console.log({
  minDeposit: config.min_deposit_amount, // Minimum deposit
  minWithdraw: config.min_withdraw_amount, // Minimum withdrawal
  depositFee: config.deposit_bridge_fee, // Deposit fees
  withdrawFee: config.withdraw_bridge_fee, // Withdrawal fees
})
```

## Error Handling

```typescript
try {
  const result = await bridgeClient.executeUtxoWithdrawal(
    ChainKind.Btc,
    address,
    amount
  )
} catch (error) {
  if (error.message.includes("Insufficient funds")) {
    console.log("Not enough nBTC balance")
  } else if (error.message.includes("Transaction not confirmed")) {
    console.log("Bitcoin deposit not confirmed yet")
  } else if (error.message.includes("Transaction signing not found")) {
    console.log("MPC signing timeout - try again")
  }
}
```

## Validation

```typescript
// Check minimum amounts
const config = await bridgeClient.getUtxoBridgeConfig(ChainKind.Btc)
if (amount < BigInt(config.min_withdraw_amount)) {
  throw new Error(`Below minimum: ${config.min_withdraw_amount} satoshis`)
}

// Validate Bitcoin address
try {
  await bridgeClient.bitcoinService.addressToScriptPubkey(address)
  console.log("Valid address")
} catch {
  console.log("Invalid Bitcoin address")
}
```

## Testing

### Testnet Resources

- **Bitcoin Faucet**: [bitcoinfaucet.uo1.net](https://bitcoinfaucet.uo1.net)
- **Testnet Explorer**: [blockstream.info/testnet](https://blockstream.info/testnet)
- **NEAR Testnet**: [testnet.nearblocks.io](https://testnet.nearblocks.io)

### Example Test

```typescript
async function testBridge() {
  setNetwork("testnet")
  const client = new NearBridgeClient(account, addresses.near)

  // Get deposit address
  const { depositAddress } = await client.getUtxoDepositAddress(
    ChainKind.Btc,
    "test.testnet"
  )
  console.log(`Send testnet BTC to: ${depositAddress}`)

  // After sending and confirming:
  // const nearTxHash = await client.finalizeUtxoDeposit(ChainKind.Btc, txHash, vout, depositArgs)

  // Test withdrawal:
  // await client.executeUtxoWithdrawal(ChainKind.Btc, "tb1q...", BigInt(10000))
}
```

## Common Issues

| Problem                     | Solution                                      |
| --------------------------- | --------------------------------------------- |
| "Transaction not confirmed" | Wait for Bitcoin confirmations                |
| "Invalid vout"              | Check block explorer for correct output index |
| "Insufficient funds"        | Check nBTC balance and fees                   |
| "Signing timeout"           | Relayer busy - retry in a few minutes         |
| "Invalid address"           | Verify Bitcoin address format and network     |

## API Reference

### Deposit Methods

- `getUtxoUserDepositAddress(chain, recipient)` → `{ address }`
- `finalizeBitcoinDeposit(txHash, vout, args)` → `nearTxHash`

### Withdrawal Methods

- `executeUtxoWithdrawal(ChainKind.Btc, address, amount)` → `bitcoinTxHash` (recommended)
- `initUtxoWithdrawal(ChainKind.Btc, address, amount)` → `{ pendingId, nearTxHash }`
- `waitForUtxoTransactionSigning(ChainKind.Btc, nearTxHash)` → `signedTxHash`
- `finalizeUtxoWithdrawal(ChainKind.Btc, signedTxHash)` → `bitcoinTxHash`

### Configuration

- `getUtxoBridgeConfig(ChainKind.Btc)` → `BtcConnectorConfig`
- `setNetwork("testnet" | "mainnet")`

## Support

- **Issues**: [GitHub Issues](https://github.com/Near-One/bridge-sdk-js/issues)
- **Discord**: [NEAR Community](https://discord.gg/nearprotocol)
- **Examples**: See `examples/bitcoin-deposit.ts` and `examples/bitcoin-withdraw.ts`
