# Omni Bridge SDK

![Status](https://img.shields.io/badge/Status-Beta-blue)
![Stability](https://img.shields.io/badge/Stability-Pre--Release-yellow)

A TypeScript SDK for seamless cross-chain token transfers using the Omni Bridge protocol.

> [!IMPORTANT]  
> This SDK is in beta and approaching production readiness. While core functionality is stable, some features may still change. We recommend thorough testing before using in production environments.

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
import { omniTransfer, OmniBridgeAPI } from "omni-bridge-sdk";

// Get fees (includes relayer service fee)
const api = new OmniBridgeAPI();
const fees = await api.getFee("eth:0x123...", "near:bob.near", "eth:0x789...");

// Send tokens
await omniTransfer(wallet, {
  tokenAddress: "eth:0x789...", // Token contract
  recipient: "near:bob.near", // Destination address
  amount: BigInt("1000000"), // Amount to send
  fee: BigInt(fees.transferred_token_fee), // Includes relayer fee
  nativeFee: BigInt(fees.native_token_fee),
});
```

### Complete Example

Here's a more detailed example showing wallet setup, error handling, and status monitoring:

```typescript
import { setNetwork } from "omni-bridge-sdk";

// Set network type
setNetwork("testnet");

// 1. Setup wallet/provider
const wallet = provider.getSigner(); // for EVM
// or
const account = await near.account("sender.near"); // for NEAR
// or
const provider = new AnchorProvider(connection, wallet); // for Solana

// 2. Get fees (includes relayer service fee)
const api = new OmniBridgeAPI();
const sender = "eth:0x123...";
const recipient = "near:bob.near";
const token = "eth:0x789...";

const fees = await api.getFee(sender, recipient, token);

// 3. Send tokens
try {
  const result = await omniTransfer(wallet, {
    tokenAddress: token,
    recipient,
    amount: BigInt("1000000"),
    fee: BigInt(fees.transferred_token_fee),
    nativeFee: BigInt(fees.native_token_fee),
  });

  // 4. Monitor status
  const status = await api.getTransferStatus(sourceChain, result.nonce);
  console.log(`Transfer status: ${status}`);
} catch (error) {
  console.error("Transfer failed:", error);
}
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
interface UtxoTransferOptions {
  maxFee?: bigint;  // Maximum BTC/Zcash network fee (in satoshis)
}

interface OmniTransferMessage {
  tokenAddress: OmniAddress; // Source token address
  amount: bigint; // Amount to transfer
  fee: bigint; // Token fee
  nativeFee: bigint; // Gas fee in native token
  recipient: OmniAddress; // Destination address
  message?: string; // Optional message field (for advanced use, overrides maxFee)
  options?: UtxoTransferOptions; // Chain-specific options
}
```

**Chain-Specific Options**: The `options` field allows you to specify chain-specific parameters:
- **UTXO chains (Bitcoin/Zcash)**: Use `UtxoTransferOptions` to specify:
  - `maxFee`: Maximum BTC/Zcash network fee allowed (in satoshis). This protects you from excessive fees.
    - Automatically converted to the nested message format: `{"MaxGasFee":"5000"}`
    - The contract validates that the actual gas fee doesn't exceed this limit
    - Cannot be used together with the `message` field (use one or the other)
  - The protocol fee is automatically calculated by the contract based on the configured `protocol_fee_rate`

Example for Bitcoin:
```typescript
const transfer: OmniTransferMessage = {
  tokenAddress: "near:nbtc.near",
  recipient: "btc:bc1q...",
  amount: BigInt(100000),
  fee: BigInt(5000),
  nativeFee: BigInt(1000),
  options: {
    maxFee: BigInt(5000)  // Maximum BTC network fee in satoshis
  }
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
const api = new OmniBridgeAPI();
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
const api = new OmniBridgeAPI();
const fee = await api.getFee(sender, recipient, tokenAddr);

console.log(`Native fee: ${fee.native_token_fee}`); // Includes relayer fee
console.log(`Token fee: ${fee.transferred_token_fee}`);
console.log(`USD fee: ${fee.usd_fee}`);
```

> **Fee Validation**: Using `api.getFee()` is recommended to get accurate protocol and relayer fees. The smart contract validates fees on-chain and will reject transfers with insufficient fees. You can provide higher fees than the API suggests if desired (e.g., for priority processing or custom relayers).

## Understanding Wormhole VAAs

### What are VAAs?

Verified Action Approvals (VAAs) are cryptographic proofs used by the Wormhole protocol to verify cross-chain messages. When tokens are transferred from Solana to other chains, Wormhole Guardians observe the transaction and collectively sign a VAA that proves the transfer occurred.

### When VAAs are Required

- **Solana → NEAR**: VAA required for transfer finalization
- **Solana → Any Chain**: VAA needed for token deployments  
- **EVM → NEAR**: EVM proof required instead of VAA
- **NEAR → Any Chain**: MPC signature used instead of VAA

### Working with VAAs

```typescript
import { getVaa } from "omni-bridge-sdk";

// Get VAA after Solana transaction (may take 30-60 seconds)
const vaa = await getVaa(txHash, "Testnet");

// Use VAA for finalization on NEAR
await nearClient.finalizeTransfer(tokenId, recipient, storageDeposit, 
  ChainKind.Sol, vaa, undefined, ProofKind.InitTransfer);
```

> **Note**: VAAs may take 30-60 seconds to become available after transaction confirmation. Implement retry logic for production applications.

## Advanced Usage

### Manual Transfer Flows

For applications requiring manual control over the transfer process, the SDK provides complete access to underlying bridge functions. Each chain requires specific handling:

```typescript
// Basic manual flow pattern
const txHash = await sourceClient.initTransfer(transferMessage);
const proof = await getProof(txHash); // VAA for Solana, EVM proof for Ethereum 
await destinationClient.finalizeTransfer(tokenId, recipient, proof);
```

> **Complete Examples**: See the `e2e/` directory for working end-to-end transfer examples, including Solana→NEAR, Ethereum→NEAR, and NEAR→Ethereum flows with full error handling.

> [!WARNING]
> **NEAR Wallet Integration Notes**: When using browser-based NEAR wallets through Wallet Selector, transactions involve page redirects. The current SDK doesn't fully support this flow - applications need to handle redirect returns and transaction hash parsing separately. For production applications, consider using [near-api-js](https://github.com/near/near-api-js) with a direct key approach or implement custom redirect handling.

### Token Operations

#### Deploying Tokens

Token deployment follows a multi-step process depending on source and destination chains:

```typescript
// Basic token deployment pattern
await sourceClient.logMetadata(tokenAddress);
// ... wait for proof/signature generation ...
const { tokenAddress } = await destinationClient.deployToken(proof, metadata);
// ... binding step if deploying FROM NEAR ...
```

**Key Requirements:**
- **NEAR→Foreign**: 4 steps (logMetadata → wait → deployToken → bindToken)
- **Foreign→NEAR**: 3 steps (logMetadata → wait → deployToken)
- All cross-chain deployments require the token to first exist on NEAR

> **Complete Guide**: See [`docs/token-deployment.md`](docs/token-deployment.md) for detailed deployment instructions with full code examples for all supported chain combinations.

### Error Handling

The SDK provides detailed error messages for common failure scenarios:

```typescript
try {
  const result = await omniTransfer(wallet, transferMessage);
} catch (error) {
  if (error.message.includes("Insufficient balance")) {
    // Handle balance errors
  } else if (error.message.includes("No VAA found")) {
    // VAA not ready yet - implement retry logic
  } else if (error.message.includes("Token already exists")) {
    // Token deployment conflicts
  }
  // ... handle other error types
}
```

> **Note**: For VAA operations, implement retry logic as VAAs may take 30-60 seconds to become available. For comprehensive error handling patterns, see the examples in `e2e/` test files.

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
bun install

# Build
bun run build

# Run tests
bun run test

# Type checking
bun run typecheck

# Linting
bun run lint
```

## License

MIT
