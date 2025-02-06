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
- 🤖 Automated transfer finalization through our relayer network
- 🪙 Token deployment and management across chains
- 📖 Comprehensive TypeScript type definitions
- ⚡ Support for native chain-specific features
- 🔍 Transfer status tracking and history

## Getting Started

### Installation

```bash
npm install omni-bridge-sdk
# or
yarn add omni-bridge-sdk
```

### Quick Start with Relayers

The fastest way to get started is using our relayer service for automated transfer finalization:

```typescript
// 1. Setup your wallet/provider
const wallet = provider.getSigner(); // for EVM
// or
const account = await near.account("sender.near"); // for NEAR
// or
const provider = new AnchorProvider(connection, wallet); // for Solana

// 2. Create the transfer with relayer fee
const transfer = {
  tokenAddress: omniAddress(ChainKind.Eth, "0x123..."),
  amount: BigInt("1000000"),
  fee: BigInt(feeEstimate.transferred_token_fee), // Includes relayer fee
  nativeFee: BigInt(feeEstimate.native_token_fee),
  recipient: omniAddress(ChainKind.Near, "recipient.near"),
};

// 3. Single transaction - relayers handle the rest
const result = await omniTransfer(wallet, transfer);

// 4. Optional: Monitor status
const status = await api.getTransferStatus(sourceChain, result.nonce);
```

### Core Concepts

#### Addresses

All addresses in the SDK use the `OmniAddress` format, which includes the chain prefix:

```typescript
type OmniAddress =
  | `eth:${string}` // Ethereum addresses
  | `near:${string}` // NEAR accounts
  | `sol:${string}` // Solana public keys
  | `arb:${string}` // Arbitrum addresses
  | `base:${string}`; // Base addresses

// Helper function
const addr = omniAddress(ChainKind.Near, "account.near");
```

#### Transfer Messages

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

## Transfer Guide

### Using Relayers (Recommended)

While the SDK provides methods to manually handle the complete transfer lifecycle, we recommend using our relayer service for the best user experience. Benefits include:

- Single transaction for end users
- Automated message signing and finalization
- No need to handle cross-chain message passing
- Optimized gas fees
- Simplified error handling

To use relayers, simply include the relayer fee when initiating the transfer:

```typescript
const transfer = {
  tokenAddress: omniAddress(ChainKind.Near, "usdc.near"),
  amount: BigInt("1000000"),
  fee: BigInt(feeEstimate.transferred_token_fee), // Relayer fee included
  nativeFee: BigInt(feeEstimate.native_token_fee),
  recipient: omniAddress(ChainKind.Eth, recipientAddress),
};

// One transaction - relayers handle the rest
const result = await omniTransfer(account, transfer);
```

### Status Monitoring

Track transfer progress using the API:

```typescript
const api = new OmniBridgeAPI("testnet");
const status = await api.getTransferStatus(sourceChain, nonce);
// Status: "pending" | "ready_for_finalize" | "completed" | "failed"

// Get transfer history
const transfers = await api.findOmniTransfers(
  "near:sender.near",
  0, // offset
  10 // limit
);
```

### Fee Estimation

```typescript
const api = new OmniBridgeAPI("testnet");
const fee = await api.getFee(sender, recipient, tokenAddr);

console.log(`Native fee: ${fee.native_token_fee}`); // Includes relayer fee
console.log(`Token fee: ${fee.transferred_token_fee}`);
console.log(`USD fee: ${fee.usd_fee}`);
```

## Advanced Usage

### Manual Transfer Flows

For cases where manual control over the transfer process is needed, the SDK provides complete access to the underlying bridge functions. Here are the flows for different chains:

#### NEAR to Foreign Chain

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

// Create transfer
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

> [!WARNING]
> When using browser-based NEAR wallets through Wallet Selector, transactions involve page redirects. The current SDK doesn't fully support this flow - applications need to handle redirect returns and transaction hash parsing separately.

#### Solana to NEAR

Solana transfers use Wormhole VAAs (Verified Action Approvals):

```typescript
// Setup Solana
const connection = new Connection("https://api.testnet.solana.com");
const wallet = new Keypair();
const provider = new AnchorProvider(
  connection,
  wallet,
  AnchorProvider.defaultOptions()
);

// Create transfer
const transfer = {
  tokenAddress: omniAddress(ChainKind.Sol, "EPjFWdd..."),
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

#### EVM to NEAR

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

### Token Operations

#### Deploying Tokens

```typescript
import { getClient } from "omni-bridge-sdk";

// Initialize clients
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

### Error Handling

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

Each supported chain has specific requirements:

### NEAR

- Account must exist and be initialized
- Sufficient NEAR for storage and gas
- Token must be registered with account
- Supports both [near-api-js](https://github.com/near/near-api-js) and [Wallet Selector](https://github.com/near/wallet-selector)

### Ethereum/EVM

- Sufficient ETH/native token for gas
- Token must be approved for bridge
- Valid ERC20 token contract

### Solana

- Sufficient SOL for rent and fees
- Associated token accounts must exist
- SPL token program requirements

Currently supported chains:

- Ethereum (ETH)
- NEAR
- Solana (SOL)
- Arbitrum (ARB)
- Base

### Build and Test

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
