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
> We're working on unifying this into a single interface that will handle the complete transfer lifecycle. For now, you'll need to use both `omniTransfer` and chain-specific clients as shown in the Transfer Flows section below.

## Transfer Flows

Cross-chain transfers have different flows depending on the source and destination chains. Here's a detailed breakdown:

### NEAR to Foreign Chain Transfers

When transferring from NEAR to another chain (e.g., Ethereum, Solana), you need to:

1. Initiate the transfer on NEAR
2. Sign the transfer message
3. Use the signature for finalization on the destination chain

You can use either [near-api-js](https://github.com/near/near-api-js) or [NEAR Wallet Selector](https://github.com/near/wallet-selector) for NEAR interactions:

```typescript
// Using near-api-js
const near = await connect({
  networkId: "testnet",
  nodeUrl: "https://rpc.testnet.near.org",
});
const account = await near.account("sender.near");
const nearClient = getClient(ChainKind.Near, account);

// OR using NEAR Wallet Selector
const selector = await setupWalletSelector({
  network: "testnet",
  modules: [
    /* your wallet modules */
  ],
});
const nearClient = getClient(ChainKind.Near, selector);

// Create and initiate transfer
const transfer = {
  tokenAddress: omniAddress(ChainKind.Near, "usdc.near"),
  amount: BigInt("1000000"),
  fee: BigInt(feeEstimate.transferred_token_fee),
  nativeFee: BigInt(feeEstimate.native_token_fee),
  recipient: omniAddress(ChainKind.Eth, await ethWallet.getAddress()),
};

// Initiate on NEAR
const result = await omniTransfer(account, transfer);

// Sign transfer on NEAR
const { signature } = await nearClient.signTransfer(result, "sender.near");

// Finalize on destination (e.g., Ethereum)
const ethClient = getClient(ChainKind.Eth, ethWallet);
await ethClient.finalizeTransfer(transferMessage, signature);
```

### Solana to NEAR Transfers

Solana to NEAR transfers use Wormhole VAAs (Verified Action Approvals) for verification:

```typescript
// Setup Solana provider
const connection = new Connection("https://api.testnet.solana.com");
const wallet = new Keypair();
const provider = new AnchorProvider(
  connection,
  wallet,
  AnchorProvider.defaultOptions()
);

// Create transfer
const transfer = {
  tokenAddress: omniAddress(ChainKind.Sol, "EPjFWdd..."), // Solana USDC
  amount: BigInt("1000000"),
  fee: BigInt(feeEstimate.transferred_token_fee),
  nativeFee: BigInt(feeEstimate.native_token_fee),
  recipient: omniAddress(ChainKind.Near, "recipient.near"),
};

// Initiate on Solana
const result = await omniTransfer(provider, transfer);

// Get Wormhole VAA
const vaa = await getVaa(result.txHash, "Testnet");

// Finalize on NEAR
const nearClient = getClient(ChainKind.Near, nearAccount);
await nearClient.finalizeTransfer(
  token,
  "recipient.near",
  storageDeposit,
  ChainKind.Sol,
  vaa // Wormhole VAA required for Solana->NEAR
);
```

### EVM to NEAR Transfers

EVM chain transfers to NEAR require proof verification:

```typescript
// Setup EVM wallet
const provider = new ethers.providers.Web3Provider(window.ethereum);
const wallet = provider.getSigner();

// Create transfer
const transfer = {
  tokenAddress: omniAddress(ChainKind.Eth, "0x123..."), // Ethereum USDC
  amount: BigInt("1000000"),
  fee: BigInt(feeEstimate.transferred_token_fee),
  nativeFee: BigInt(feeEstimate.native_token_fee),
  recipient: omniAddress(ChainKind.Near, "recipient.near"),
};

// Initiate on EVM
const result = await omniTransfer(wallet, transfer);

// Get EVM proof
const proof = await getEvmProof(
  result.txHash,
  ERC20_TRANSFER_TOPIC,
  ChainKind.Eth
);

// Finalize on NEAR
const nearClient = getClient(ChainKind.Near, nearAccount);
await nearClient.finalizeTransfer(
  token,
  "recipient.near",
  storageDeposit,
  ChainKind.Eth,
  undefined, // No VAA needed
  proof // EVM proof required
);
```

### Status Monitoring

For all transfer types, you can monitor status using the API:

```typescript
const api = new OmniBridgeAPI("testnet");
const status = await api.getTransferStatus(sourceChain, nonce);
// Status: "pending" | "ready_for_finalize" | "completed" | "failed"
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

## Token Operations

### Deploying Tokens

Token deployment uses chain-specific clients through a unified interface:

```typescript
import { getClient } from "omni-bridge-sdk";

// Initialize client for source chain
const nearClient = getClient(ChainKind.Near, wallet);
const ethClient = getClient(ChainKind.Eth, wallet);

// Example: Deploy NEAR token to Ethereum
const { signature } = await nearClient.logMetadata("near:token.near");

// Deploy token with signed MPC payload
const result = await ethClient.deployToken(signature, {
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
- NEAR (with support for both near-api-js and Wallet Selector)
- Solana (SOL)
- Arbitrum (ARB)
- Base

Each chain has specific requirements:

### NEAR

- Account must exist and be initialized
- Sufficient NEAR for storage and gas
- Token must be registered with account
- Can use either near-api-js or Wallet Selector for interactions

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
