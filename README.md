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
interface OmniTransferMessage {
  tokenAddress: OmniAddress; // Source token address
  amount: bigint; // Amount to transfer
  fee: bigint; // Token fee
  nativeFee: bigint; // Gas fee in native token
  recipient: OmniAddress; // Destination address
  message?: string // Optional message field
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

// After initiating a transfer on Solana
const txHash = await solanaClient.initTransfer(transferMessage);

// Get VAA (may take 30-60 seconds for Guardian confirmation)
try {
  const vaa = await getVaa(txHash, "Testnet"); // Returns hex-encoded string
  console.log(`VAA retrieved: ${vaa.length} characters`);
} catch (error) {
  if (error.message === "No VAA found") {
    // VAA not ready yet, retry after delay
    await new Promise(resolve => setTimeout(resolve, 30000));
    const vaa = await getVaa(txHash, "Testnet");
  }
}

// Use VAA for finalization
await nearClient.finalizeTransfer(
  tokenId,
  recipient,
  storageDeposit, 
  ChainKind.Sol,
  vaa, // Required for Solana origins
  undefined, // No EVM proof needed
  ProofKind.InitTransfer
);
```

### VAA Error Handling

```typescript
async function getVaaWithRetry(txHash: string, maxRetries = 10): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await getVaa(txHash, "Testnet");
    } catch (error) {
      if (error.message.includes("No VAA found") && i < maxRetries - 1) {
        console.log(`VAA not ready, retrying in 30s... (${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 30000));
        continue;
      }
      throw error;
    }
  }
  throw new Error("VAA not found after maximum retries");
}
```

## Advanced Usage

### Manual Transfer Flows (Complete E2E Examples)

These examples show the complete end-to-end process for manual transfers. For production applications, use the relayer service (see "Using Relayers" section) for better user experience.

#### Complete E2E: Solana to NEAR Transfer

```typescript
import { SolanaBridgeClient, NearBridgeClient, getVaa, ChainKind, ProofKind, omniAddress } from "omni-bridge-sdk";
import { Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { connect } from "near-api-js";

// Setup wallets and clients
const solanaConnection = new Connection("https://api.testnet.solana.com");
const solanaWallet = Keypair.fromSecretKey(yourSolanaSecretKey);
const solanaProvider = new AnchorProvider(solanaConnection, solanaWallet, {});
const solanaClient = new SolanaBridgeClient(solanaProvider);

const near = await connect({ networkId: "testnet", nodeUrl: "https://rpc.testnet.near.org" });
const nearAccount = await near.account("your-account.testnet");
const nearClient = new NearBridgeClient(nearAccount);

async function completeSolanaToNearTransfer() {
  try {
    // Step 1: Prepare transfer message
    const transferMessage = {
      tokenAddress: omniAddress(ChainKind.Sol, "3wQct2e43J1Z99h2RWrhPAhf6E32ZpuzEt6tgwfEAKAy"), // wNEAR on Solana
      amount: BigInt("10000000000000000"), // 0.01 wNEAR
      recipient: omniAddress(ChainKind.Near, "recipient.testnet"),
      fee: BigInt(0), // Manual flow - no relayer fee
      nativeFee: BigInt(0), // Manual flow - no relayer fee  
    };

    console.log("Step 1: Initiating transfer on Solana...");
    
    // Step 2: Initiate transfer on Solana
    const txHash = await solanaClient.initTransfer(transferMessage);
    console.log(`✓ Transfer initiated. TX: ${txHash}`);

    // Step 3: Wait and get Wormhole VAA
    console.log("Step 2: Waiting for Wormhole VAA...");
    await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute for confirmations
    
    const vaa = await getVaaWithRetry(txHash, 10); // Retry up to 10 times
    console.log(`✓ VAA retrieved: ${vaa.length} characters`);

    // Step 4: Finalize transfer on NEAR
    console.log("Step 3: Finalizing transfer on NEAR...");
    
    const finalizeResult = await nearClient.finalizeTransfer(
      "wrap.testnet", // NEAR token ID
      "recipient.testnet", // Recipient account
      BigInt(0), // Storage deposit (0 if account exists)
      ChainKind.Sol, // Source chain
      vaa, // Wormhole VAA proof
      undefined, // No EVM proof needed
      ProofKind.InitTransfer
    );

    console.log(`✓ Transfer completed! NEAR TX: ${finalizeResult.transaction.hash}`);
    return finalizeResult;

  } catch (error) {
    console.error("Transfer failed:", error);
    throw error;
  }
}

// Helper function with retry logic
async function getVaaWithRetry(txHash: string, maxRetries = 10): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await getVaa(txHash, "Testnet");
    } catch (error) {
      if (error.message.includes("No VAA found") && i < maxRetries - 1) {
        console.log(`VAA not ready, retrying in 30s... (${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 30000));
        continue;
      }
      throw error;
    }
  }
  throw new Error("VAA not found after maximum retries");
}
```

#### Complete E2E: Ethereum to NEAR Transfer

```typescript
import { EvmBridgeClient, NearBridgeClient, getEvmProof, ChainKind, ProofKind, omniAddress } from "omni-bridge-sdk";
import { ethers } from "ethers";

async function completeEthereumToNearTransfer() {
  // Setup wallets
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const ethWallet = provider.getSigner();
  const ethClient = new EvmBridgeClient(ethWallet, ChainKind.Eth);
  const nearClient = new NearBridgeClient(nearAccount);

  try {
    // Step 1: Prepare transfer
    const transferMessage = {
      tokenAddress: omniAddress(ChainKind.Eth, "0x1f89e263159f541182f875ac05d773657d24eb92"), // NEAR on Ethereum
      amount: BigInt("1000000000000000000"), // 1 NEAR (18 decimals)
      recipient: omniAddress(ChainKind.Near, "recipient.testnet"),
      fee: BigInt(0),
      nativeFee: BigInt(0),
    };

    console.log("Step 1: Initiating transfer on Ethereum...");
    
    // Step 2: Initiate transfer on Ethereum
    const txHash = await ethClient.initTransfer(transferMessage);
    console.log(`✓ Transfer initiated. TX: ${txHash}`);

    // Step 3: Wait for confirmation and get EVM proof
    console.log("Step 2: Waiting for confirmations and generating proof...");
    await new Promise(resolve => setTimeout(resolve, 60000)); // Wait for confirmations

    const proof = await getEvmProof(
      txHash,
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", // ERC20 Transfer event topic
      ChainKind.Eth
    );
    console.log("✓ EVM proof generated");

    // Step 4: Finalize on NEAR
    console.log("Step 3: Finalizing transfer on NEAR...");
    
    const finalizeResult = await nearClient.finalizeTransfer(
      "1f89e263159f541182f875ac05d773657d24eb92.factory.bridge.near", // NEAR token ID
      "recipient.testnet",
      BigInt(0),
      ChainKind.Eth, // Source chain
      undefined, // No VAA needed for EVM
      proof, // EVM proof required
      ProofKind.InitTransfer
    );

    console.log(`✓ Transfer completed! NEAR TX: ${finalizeResult.transaction.hash}`);
    return finalizeResult;

  } catch (error) {
    console.error("Transfer failed:", error);
    throw error;
  }
}
```

#### Complete E2E: NEAR to Ethereum Transfer

```typescript
async function completeNearToEthereumTransfer() {
  const nearClient = new NearBridgeClient(nearAccount);
  const ethClient = new EvmBridgeClient(ethWallet, ChainKind.Eth);

  try {
    // Step 1: Initiate on NEAR
    const transferMessage = {
      tokenAddress: omniAddress(ChainKind.Near, "wrap.testnet"),
      amount: BigInt("1000000000000000000000000"), // 1 wNEAR (24 decimals)
      recipient: omniAddress(ChainKind.Eth, "0xYourEthereumAddress"),
      fee: BigInt(0),
      nativeFee: BigInt(0),
    };

    console.log("Step 1: Initiating transfer on NEAR...");
    const initResult = await nearClient.initTransfer(transferMessage);
    console.log(`✓ Transfer initiated. TX: ${initResult.transaction.hash}`);

    // Step 2: Sign transfer on NEAR (for manual flows)
    console.log("Step 2: Signing transfer on NEAR...");
    const { signature } = await nearClient.signTransfer(initResult, "your-account.testnet");
    console.log("✓ Transfer signed");

    // Step 3: Finalize on Ethereum
    console.log("Step 3: Finalizing transfer on Ethereum...");
    const finalizeResult = await ethClient.finalizeTransfer(transferMessage, signature);
    console.log(`✓ Transfer completed! ETH TX: ${finalizeResult.hash}`);

    return finalizeResult;
  } catch (error) {
    console.error("Transfer failed:", error);
    throw error;
  }
}
```

> [!WARNING]
> **NEAR Wallet Integration Notes**: When using browser-based NEAR wallets through Wallet Selector, transactions involve page redirects. The current SDK doesn't fully support this flow - applications need to handle redirect returns and transaction hash parsing separately. For production applications, consider using [near-api-js](https://github.com/near/near-api-js) with a direct key approach or implement custom redirect handling.

### Token Operations

#### Deploying Tokens

Token deployment requires a three-step process when deploying FROM NEAR to other chains, or a two-step process when deploying TO NEAR from other chains. Here are complete examples:

##### NEAR to Ethereum Deployment

```typescript
import { getClient, ChainKind, omniAddress } from "omni-bridge-sdk";
import { connect } from "near-api-js";
import { ethers } from "ethers";

// Setup NEAR (source chain)
const near = await connect({
  networkId: "testnet",
  nodeUrl: "https://rpc.testnet.near.org",
});
const nearAccount = await near.account("your-account.testnet");
const nearClient = getClient(ChainKind.Near, nearAccount);

// Setup Ethereum (destination chain)
const provider = new ethers.providers.Web3Provider(window.ethereum);
const ethWallet = provider.getSigner();
const ethClient = getClient(ChainKind.Eth, ethWallet);

// Step 1: Log metadata on source chain (NEAR)
const logResult = await nearClient.logMetadata("near:your-token.near");
console.log(`Metadata logged: ${logResult.transaction.hash}`);

// Step 2: Wait for MPC signature (handled by relayer)
// In production, poll for signature readiness
await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30s

// Step 3: Deploy token on destination chain (Ethereum)
const deployResult = await ethClient.deployToken(signature, {
  token: "your-token.near",
  name: "Your Token Name",
  symbol: "YTN",
  decimals: 18,
});
console.log(`Token deployed: ${deployResult.tokenAddress}`);

// Step 4: Bind deployed token back to NEAR (for NEAR→foreign chains only)
const bindResult = await nearClient.bindToken(
  ChainKind.Eth,
  undefined, // No VAA needed for EVM
  evmProof   // EVM proof required
);
console.log(`Token bound: ${bindResult.transaction.hash}`);
```

##### Solana to NEAR Deployment

```typescript
import { SolanaBridgeClient, NearBridgeClient, getVaa } from "omni-bridge-sdk";
import { Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";

// Setup Solana (source chain)
const connection = new Connection("https://api.testnet.solana.com");
const solanaWallet = Keypair.fromSecretKey(yourSecretKey);
const provider = new AnchorProvider(connection, solanaWallet, {});
const solanaClient = new SolanaBridgeClient(provider);

// Setup NEAR (destination chain)
const nearClient = new NearBridgeClient(nearAccount);

// Step 1: Log metadata on source chain (Solana)
const logTx = await solanaClient.logMetadata("sol:EPjFWdd5p2vGgGMN3bYhDbvBL4ovNCyCtQyM9VJpHNoP");

// Step 2: Get Wormhole VAA (proof from Solana)
const vaa = await getVaa(logTx, "Testnet");

// Step 3: Deploy token on destination chain (NEAR)
const deployResult = await nearClient.deployToken(signature, {
  token: "EPjFWdd5p2vGgGMN3bYhDbvBL4ovNCyCtQyM9VJpHNoP",
  name: "USD Coin",
  symbol: "USDC",
  decimals: 6,
});
// Note: No binding step needed for foreign→NEAR deployments
```

### Error Handling

Comprehensive error handling for cross-chain operations, including VAA-related errors:

```typescript
async function handleTransferWithErrorRecovery(transferMessage: OmniTransferMessage) {
  try {
    // Attempt transfer
    const result = await omniTransfer(wallet, transferMessage);
    return result;
  } catch (error) {
    // Handle specific error types
    if (error.message.includes("Insufficient balance")) {
      console.error("Not enough tokens:", error.message);
      // Guide user to check balances
      throw new Error("Insufficient balance. Please check your token balance.");
      
    } else if (error.message.includes("Invalid token")) {
      console.error("Token validation failed:", error.message);
      // Guide user to check token address
      throw new Error("Invalid token address. Please verify the token contract.");
      
    } else if (error.message.includes("Transfer failed")) {
      console.error("Transfer execution failed:", error.message);
      // Retry logic could be implemented here
      throw new Error("Transfer failed. Please try again.");
      
    } else if (error.message.includes("Signature verification failed")) {
      console.error("Signature issue:", error.message);
      // Guide user to reconnect wallet
      throw new Error("Signature verification failed. Please reconnect your wallet.");
      
    } else {
      console.error("Unexpected error:", error);
      throw error;
    }
  }
}

// VAA-specific error handling
async function handleVaaOperations(txHash: string) {
  try {
    const vaa = await getVaaWithRetry(txHash, 10);
    return vaa;
  } catch (error) {
    if (error.message.includes("No VAA found")) {
      console.error("VAA not available:", error.message);
      throw new Error(
        "Wormhole VAA not found. This usually means:\n" +
        "1. Transaction not confirmed yet (wait 1-2 minutes)\n" +
        "2. Transaction failed on source chain\n" +
        "3. Wormhole guardians haven't processed it yet\n" +
        "Please verify transaction status and try again."
      );
    } else if (error.message.includes("Invalid transaction")) {
      throw new Error("Invalid transaction hash. Please check the transaction ID.");
    } else if (error.message.includes("Network error")) {
      throw new Error("Network connectivity issue. Please check your internet connection.");
    } else {
      throw error;
    }
  }
}

// Token deployment error handling
async function handleTokenDeployment(signature: any, metadata: any) {
  try {
    const result = await ethClient.deployToken(signature, metadata);
    return result;
  } catch (error) {
    if (error.message.includes("Token already exists")) {
      throw new Error("Token already deployed on this chain. Use existing token address.");
    } else if (error.message.includes("Invalid signature")) {
      throw new Error("MPC signature invalid or expired. Please retry token metadata logging.");
    } else if (error.message.includes("Insufficient gas")) {
      throw new Error("Insufficient gas for deployment. Please increase gas limit or gas price.");
    } else {
      throw error;
    }
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
