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

## Features

- 🔄 Cross-chain token transfers between Ethereum, NEAR, Solana, Base, and Arbitrum
- 🪙 Token deployment and management across chains
- 📖 Comprehensive TypeScript type definitions
- ⚡ Support for native chain-specific features
- 🔍 Transfer status tracking and history

## Installation

```bash
npm install omni-bridge-sdk
# or
yarn add omni-bridge-sdk
```

## Quick Start

The SDK currently provides a split interface for cross-chain transfers:

- `omniTransfer`: A unified interface for initiating transfers from any supported chain
- Chain-specific clients: Required for finalizing transfers on destination chains

> [!NOTE]  
> We're working on unifying this into a single interface that will handle the complete transfer lifecycle. For now, you'll need to use both `omniTransfer` and chain-specific clients as shown below.

Here's a complete example:

```typescript
import {
  omniTransfer,
  ChainKind,
  omniAddress,
  OmniBridgeAPI,
  getClient,
} from "omni-bridge-sdk";
import { connect } from "near-api-js";

// Setup NEAR account (source)
const near = await connect({
  networkId: "testnet",
  nodeUrl: "https://rpc.testnet.near.org",
});
const account = await near.account("sender.near");

// Setup Ethereum wallet (destination)
const provider = new ethers.providers.Web3Provider(window.ethereum);
const ethWallet = provider.getSigner();

// 1. Get fee estimate
const api = new OmniBridgeAPI("testnet");
const fee = await api.getFee(
  omniAddress(ChainKind.Near, account.accountId),
  omniAddress(ChainKind.Eth, await ethWallet.getAddress()),
  "usdc.near"
);

// 2. Create and initiate transfer
const transfer = {
  tokenAddress: omniAddress(ChainKind.Near, "usdc.near"),
  amount: BigInt("1000000"), // 1 USDC (6 decimals)
  fee: BigInt(fee.transferred_token_fee || 0),
  nativeFee: BigInt(fee.native_token_fee),
  recipient: omniAddress(ChainKind.Eth, await ethWallet.getAddress()),
};

// Initiate transfer on source chain
const result = await omniTransfer(account, transfer);

// Sign transfer on NEAR
const nearClient = getClient(ChainKind.Near, account);
const { signature } = await nearClient.signTransfer(result, "sender.near");

// 3. Monitor status
let status;
do {
  status = await api.getTransferStatus(ChainKind.Near, result.nonce);
  console.log(`Status: ${status}`);

  if (status === "ready_for_finalize") {
    // 4. Finalize transfer on destination chain
    const ethClient = getClient(ChainKind.Eth, ethWallet);
    await ethClient.finalizeTransfer(transferMessage, signature);
    break;
  }

  await new Promise((r) => setTimeout(r, 2000));
} while (status === "pending");
```

## Transfer Lifecycle

A cross-chain transfer involves multiple steps across different chains:

### 1. Transfer Initiation

Use `omniTransfer` to start the transfer on the source chain:

```typescript
const result = await omniTransfer(wallet, transfer);
// Returns: { txId: string, nonce: bigint }
```

### 2. Status Monitoring

Track the transfer status using `OmniBridgeAPI`:

```typescript
const api = new OmniBridgeAPI("testnet");
const status = await api.getTransferStatus(chain, nonce);
// Status can be: "pending" | "ready_for_finalize" | "completed" | "failed"
```

### 3. Transfer Finalization

When status is "ready_for_finalize", use chain-specific clients to complete the transfer:

```typescript
// Finalize on Ethereum/EVM chains
const evmClient = getClient(ChainKind.Eth, ethWallet);
await evmClient.finalizeTransfer(transferMessage, signature);

// Finalize on NEAR
const nearClient = getClient(ChainKind.Near, nearAccount);
await nearClient.finalizeTransfer(
  token,
  recipientAccount,
  storageDeposit,
  sourceChain,
  vaa // Optional Wormhole VAA
);

// Finalize on Solana
const solClient = getClient(ChainKind.Sol, provider);
await solClient.finalizeTransfer(transferMessage, signature);
```

## Core Concepts

### Addresses

All addresses in the SDK use the `OmniAddress` format, which includes the chain prefix:

```typescript
type OmniAddress =
  | `eth:${string}` // Ethereum addresses
  | `near:${string}` // NEAR accounts
  | `sol:${string}` // Solana public keys
  | `arb:${string}` // Arbitrum addresses
  | `base:${string}`; // Base addresses

// Helper function to create addresses
const addr = omniAddress(ChainKind.Near, "account.near");
```

### Transfer Messages

Transfer messages represent cross-chain token transfers:

```typescript
interface OmniTransferMessage {
  tokenAddress: OmniAddress; // Source token address
  amount: bigint; // Amount to transfer
  fee: bigint; // Token fee
  nativeFee: bigint; // Gas fee in native token
  recipient: OmniAddress; // Destination address
}
```

## Chain-Specific Examples

### Ethereum to Solana Transfer

```typescript
import { ethers } from "ethers";

// Setup Ethereum wallet
const provider = new ethers.providers.Web3Provider(window.ethereum);
const wallet = provider.getSigner();

// Create transfer message
const transfer = {
  tokenAddress: omniAddress(ChainKind.Eth, "0x123..."), // USDC on Ethereum
  amount: BigInt("1000000"),
  fee: BigInt("0"),
  nativeFee: BigInt("10000"), // ETH gas fee
  recipient: omniAddress(
    ChainKind.Sol,
    "GsbwXfJraMomCYJpbtoH4DfzjdzXdYjkqU5YvF3j4YZ"
  ),
};

// Execute transfer
const result = await omniTransfer(wallet, transfer);
console.log(`Transfer initiated: ${result.txId}`);
```

### Solana to Base Transfer

```typescript
import { Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";

// Setup Solana provider
const connection = new Connection("https://api.mainnet-beta.solana.com");
const wallet = new Keypair();
const provider = new AnchorProvider(
  connection,
  wallet,
  AnchorProvider.defaultOptions()
);

// Create transfer message
const transfer = {
  tokenAddress: omniAddress(ChainKind.Sol, "EPjFWdd..."), // USDC on Solana
  amount: BigInt("1000000"),
  fee: BigInt("0"),
  nativeFee: BigInt("5000"), // SOL fee in lamports
  recipient: omniAddress(ChainKind.Base, "0x456..."),
};

// Execute transfer
const result = await omniTransfer(provider, transfer);
```

## Token Operations

### Deploying Tokens

Token deployment uses chain-specific clients through a unified interface:

```typescript
import { getClient } from "omni-bridge-sdk";

// Initialize client for source chain
const client = getClient(ChainKind.Near, wallet);

// Example: Deploy NEAR token to Ethereum
const txHash = await client.logMetadata("near:token.near");
console.log(`Metadata logged with tx: ${txHash}`);

// Deploy token with signed MPC payload
const result = await client.deployToken(signature, {
  token: "token.near",
  name: "Token Name",
  symbol: "TKN",
  decimals: 18,
});
```

### Tracking Transfers

Monitor transfer status and history:

```typescript
const api = new OmniBridgeAPI("testnet");

// Check transfer status
const status = await api.getTransferStatus("Eth", originNonce);

// Get transfer history
const transfers = await api.findOmniTransfers(
  "near:sender.near",
  0, // offset
  10 // limit
);
```

### Fee Estimation

```typescript
// Get fee estimate for transfer
const fee = await api.getFee(
  sender, // OmniAddress
  recipient, // OmniAddress
  tokenAddr // Token address
);

console.log(`Native fee: ${fee.native_token_fee}`);
console.log(`Token fee: ${fee.transferred_token_fee}`);
console.log(`USD fee: ${fee.usd_fee}`);
```

## Error Handling

```typescript
try {
  await omniTransfer(wallet, transfer);
} catch (error) {
  if (error.message.includes("Insufficient balance")) {
    // Handle insufficient funds
  } else if (error.message.includes("Invalid token")) {
    // Handle invalid token
  } else if (error.message.includes("Transfer failed")) {
    // Handle failed transfer
  } else if (error.message.includes("Signature verification failed")) {
    // Handle signature issues
  }
}
```

## Chain Support

Currently supported chains:

- Ethereum (ETH)
- NEAR
- Solana (SOL)
- Arbitrum (ARB)
- Base

Each chain has specific requirements:

### NEAR

- Account must exist and be initialized
- Sufficient NEAR for storage and gas
- Token must be registered with account

### Ethereum/EVM

- Sufficient ETH/native token for gas
- Token must be approved for bridge
- Valid ERC20 token contract

### Solana

- Sufficient SOL for rent and fees
- Associated token accounts must exist
- SPL token program requirements

## Development

### Roadmap

#### Core Transfer Interface

- [x] Base OmniTransfer interface
  - [x] EVM
    - [x] initTransfer
    - [x] finalizeTransfer
  - [x] NEAR
    - [x] initTransfer
    - [x] finalizeTransfer
  - [x] Solana
    - [x] initTransfer
    - [x] finalizeTransfer

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

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

## License

MIT
