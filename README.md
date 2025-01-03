# Omni Bridge SDK

![Status](https://img.shields.io/badge/Status-Alpha-orange)
![Stability](https://img.shields.io/badge/Stability-Experimental-red)

> [!WARNING]
> This SDK is currently under heavy development and should be considered **highly unstable**. The API surface is subject to frequent and breaking changes without notice. While we encourage exploration and feedback, we strongly advise against using this in production environments at this time.

A TypeScript SDK for seamless cross-chain token transfers using the Omni Bridge protocol.

## Development Status

This project is in **alpha stage** and under active development. Here's what you should know:

- 🚧 **API Stability**: All APIs are subject to breaking changes
- 🧪 **Testing**: Test coverage is still being expanded
- 📦 **Features**: Core functionality is being implemented
- 🔄 **Updates**: Frequent updates and breaking changes should be expected

We welcome feedback and contributions, but please be aware of the experimental nature of this project.

## Installation

```bash
npm install omni-bridge-sdk
# or
yarn add omni-bridge-sdk
```

## Quick Start

```typescript
import { Chain, omniAddress } from "omni-bridge-sdk";
import { ethers } from "ethers";

// Setup wallet (example with Ethereum)
const provider = ethers.getDefaultProvider("goerli");
const wallet = new ethers.Wallet(privateKey, provider);

// Create transfer message
const transfer = {
  tokenAddress: omniAddress(Chain.Ethereum, "0x123..."), // USDC on Ethereum
  amount: BigInt("1000000"), // 1 USDC (6 decimals)
  fee: BigInt("0"),
  nativeFee: BigInt("10000"), // 0.00001 ETH
  recipient: omniAddress(Chain.Base, "0x456..."), // Recipient on Base
  message: null,
};

// Execute transfer
const result = await omniTransfer(wallet, transfer);
console.log(`Transfer initiated with nonce: ${result.nonce}`);

// Check transfer status
const status = await getTransferStatus(Chain.Ethereum, result.nonce);
console.log(`Status: ${status}`); // 'pending' | 'completed' | 'failed'
```

### Development Roadmap

#### Core Transfer Interface

- [ ] Base OmniTransfer interface
  - [x] EVM
    - [x] initTransfer
    - [x] finalizeTransfer
  - [x] NEAR
    - [x] initTransfer
    - [x] finalizeTransfer
  - [ ] Solana
    - [x] initTransfer
    - [ ] finalizeTransfer

#### Query Functions

- [x] findOmniTransfers (Transfer History API)
- [x] getFee (Fee Estimation API)
- [x] getTransferStatus (Status Tracking API)

#### Token Deployment

- [x] Ethereum (EVM)
  - [x] logMetadata
  - [x] deployToken
- [x] NEAR
  - [x] logMetadata
  - [x] deployToken
  - [x] bindToken
- [x] Solana
  - [x] logMetadata
  - [x] deployToken

#### Additional Features

- [ ] Transaction receipt validation
- [ ] Automatic gas estimation
- [ ] Rate limiting
- [ ] Retry mechanisms
- [ ] Error recovery

## Core API

### Cross-Chain Transfers

```typescript
// Main transfer function
function omniTransfer(
  wallet: ethers.Wallet | NearWalletConnection | SolanaWallet,
  transferMessage: TransferMessage
): Promise<OmniTransfer>;

// Types
interface TransferMessage {
  tokenAddress: OmniAddress; // Source token
  amount: bigint; // Amount to transfer
  fee: bigint; // Fee in token amount
  nativeFee: bigint; // Fee in chain's native token
  recipient: OmniAddress; // Destination address
  message: string | null; // Optional message data
}

interface OmniTransfer {
  txId: string; // Source chain transaction ID
  nonce: bigint; // Unique transfer identifier
  transferMessage: TransferMessage;
}

// Status checking
function getTransferStatus(
  originChain: Chain,
  nonce: bigint
): Promise<"pending" | "completed" | "failed">;

// Fee estimation
function getFee(
  sender: OmniAddress,
  recipient: OmniAddress
): Promise<{
  fee: bigint; // Fee in token amount
  nativeFee: bigint; // Fee in native token
}>;

// Transfer history
function findOmniTransfers(sender: OmniAddress): Promise<OmniTransfer[]>;
```

## Chain Support

Currently supported chains:

- Ethereum (ETH)
- NEAR
- Solana (SOL)
- Arbitrum (ARB)
- Base

### Address Format

Addresses follow the format `chain:address` where chain is one of: `eth`, `near`, `sol`, `arb`, `base`

```typescript
// Using string literal (type-checked)
const addr: OmniAddress = "eth:0x123...";

// Using constructor helper
const addr = omniAddress(Chain.Ethereum, "0x123...");
```

## Examples

### NEAR to Ethereum Transfer

```typescript
import { connect } from "near-api-js";

const near = await connect(config);
const account = await near.account("sender.near");

const transfer = {
  tokenAddress: omniAddress(Chain.Near, "usdc.near"),
  amount: BigInt("1000000"),
  fee: BigInt("0"),
  nativeFee: BigInt("1000000000000000000000"), // 0.001 NEAR
  recipient: omniAddress(Chain.Ethereum, "0x123..."),
  message: null,
};

const result = await omniTransfer(account, transfer);
```

### Solana to Base Transfer

```typescript
import { Connection, Keypair } from '@solana/web3.js'

const connection = new Connection("https://api.mainnet-beta.solana.com")
const wallet = new Keypair(...)

const transfer = {
  tokenAddress: omniAddress(Chain.Solana, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), // USDC
  amount: BigInt("1000000"),
  fee: BigInt("0"),
  nativeFee: BigInt("5000"), // 0.000005 SOL
  recipient: omniAddress(Chain.Base, "0x456..."),
  message: null
}

const result = await omniTransfer(wallet, transfer)
```

## Advanced Features

### Token Deployment

For deploying tokens across chains (see [Token Deployment Guide](./docs/token-deployment.md))

```typescript
const deployer = getDeployer(Chain.Near, wallet, "testnet");
const deployment = await deployer.initDeployToken(tokenAddr, Chain.Ethereum);
```

## Development

```bash
# Install dependencies
yarn install

# Run tests
yarn test

# Build
yarn build
```

## License

MIT
