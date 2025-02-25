# Token Deployment Guide

This guide explains how to deploy tokens across different chains using the Omni Bridge protocol.

## Overview

Token deployment in Omni Bridge follows a three-phase process:

1. **Initialize** - Log token metadata on source chain
2. **Finalize** - Deploy token on destination chain using proof
3. **Bind** - (NEAR-involved flows only) Bind the deployed token back to NEAR

Important: To deploy a token on any chain, it must first exist on NEAR. You cannot directly deploy from Ethereum to Solana - the token must first be deployed on NEAR.

## Chain-Specific Deployment Examples

For all cross-chain deployments, you'll need two clients: one for the source chain and one for the destination chain.
- Source chain client handles `logMetadata`
- Destination chain client handles `deployToken`
- NEAR client always handles `bindToken` (when required)

### Deploying FROM NEAR to Foreign Chains

```typescript
import { NearBridgeClient, EvmBridgeClient, ChainKind } from "omni-bridge-sdk";
import { connect } from "near-api-js";
import { ethers } from "ethers";

// Setup NEAR connection (source chain)
const near = await connect({
  networkId: "testnet",
  nodeUrl: "https://rpc.testnet.near.org",
});
const nearAccount = await near.account("client.near");

// Initialize NEAR client (source chain)
const nearClient = new NearBridgeClient(nearAccount);

// 1. Log metadata for existing NEAR token (done on source chain)
const logTxHash = await nearClient.logMetadata("near:token.near");

// Setup EVM wallet (destination chain, e.g., Ethereum)
const provider = new ethers.providers.Web3Provider(window.ethereum);
const evmWallet = provider.getSigner();

// Initialize EVM client (destination chain)
const evmClient = new EvmBridgeClient(evmWallet, ChainKind.Eth);

// 2. Deploy token on destination chain (done on destination chain)
const { txHash, tokenAddress } = await evmClient.deployToken(
  signature, // MPC signature authorizing deployment
  {
    token: "token_id",
    name: "Token Name",
    symbol: "TKN",
    decimals: 18,
  }
);

// 3. Bind the deployed token back to NEAR (always done with NEAR client)
await nearClient.bindToken(
  ChainKind.Eth, // Destination chain where token was deployed
  vaa, // Optional: Wormhole VAA
  evmProof // Optional: EVM proof (for EVM chains)
);
```

### Deploying FROM EVM Chains (Ethereum/Base/Arbitrum) TO NEAR

```typescript
import { EvmBridgeClient, NearBridgeClient, ChainKind } from "omni-bridge-sdk";
import { ethers } from "ethers";
import { connect } from "near-api-js";

// Setup EVM wallet (source chain)
const provider = new ethers.providers.Web3Provider(window.ethereum);
const evmWallet = provider.getSigner();

// Initialize EVM client (source chain)
const evmClient = new EvmBridgeClient(evmWallet, ChainKind.Eth);

// 1. Log metadata for existing token (done on source chain)
const logTxHash = await evmClient.logMetadata("eth:0x123...");

// Setup NEAR connection (destination chain)
const near = await connect({
  networkId: "testnet",
  nodeUrl: "https://rpc.testnet.near.org",
});
const nearAccount = await near.account("client.near");

// Initialize NEAR client (destination chain)
const nearClient = new NearBridgeClient(nearAccount);

// 2. Deploy token on NEAR (done on destination chain)
const { txHash, tokenAddress } = await nearClient.deployToken(
  signature, // MPC signature authorizing deployment
  {
    token: "token_id",
    name: "Token Name",
    symbol: "TKN",
    decimals: 18,
  }
);

// Note: When deploying FROM EVM chains TO NEAR, no bindToken step is needed
```

### Deploying FROM Solana TO NEAR

```typescript
import { SolanaBridgeClient, NearBridgeClient, ChainKind } from "omni-bridge-sdk";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { connect } from "near-api-js";

// Setup Solana connection (source chain)
const connection = new Connection("https://api.testnet.solana.com");
const solanaPayer = Keypair.generate();

// Initialize Solana client (source chain)
const solanaClient = new SolanaBridgeClient(
  connection,
  new PublicKey("wormhole_program_id")
);

// 1. Log metadata for existing SPL token (done on source chain)
const logTxHash = await solanaClient.logMetadata(
  tokenPubkey,
  solanaPayer // Optional payer for transaction
);

// Setup NEAR connection (destination chain)
const near = await connect({
  networkId: "testnet",
  nodeUrl: "https://rpc.testnet.near.org",
});
const nearAccount = await near.account("client.near");

// Initialize NEAR client (destination chain)
const nearClient = new NearBridgeClient(nearAccount);

// 2. Deploy token on NEAR (done on destination chain)
const { txHash, tokenAddress } = await nearClient.deployToken(
  signature,
  {
    token: "token_id",
    name: "Token Name",
    symbol: "TKN",
    decimals: 9,
  }
);

// Note: When deploying FROM Solana TO NEAR, no bindToken step is needed
```

## Error Handling

Each deployment step can encounter different types of errors that need handling:

```typescript
try {
  await client.logMetadata("near:token.near");
} catch (error) {
  if (error.message.includes("Token metadata not provided")) {
    // Handle missing metadata
  } else if (error.message.includes("Invalid token address")) {
    // Handle invalid token
  } else if (error.message.includes("Signature verification failed")) {
    // Handle invalid signature
  }
}
```

## Storage and Gas Requirements

### NEAR

- `logMetadata`: ~3 TGas + 0.2 NEAR storage deposit
- `deployToken`: ~1.2 TGas + 4 NEAR storage deposit
- `bindToken`: ~3 TGas + 0.2 NEAR storage deposit

### Ethereum/EVM

- `logMetadata`: ~100k gas
- `deployToken`: ~500k gas (Arbitrum: ~3M gas)

### Solana

- `logMetadata`: Variable based on token metadata size
- `deployToken`: Variable based on token configuration

## Advanced Features

### Checking Deployment Status

```typescript
import { OmniBridgeAPI } from "omni-bridge-sdk";

const api = new OmniBridgeAPI("testnet");

// Get deployment status by txHash
const status = await api.getDeploymentStatus(deploymentTxHash);
console.log(status); // "pending" | "ready_for_finalize" | "finalized" | "ready_for_bind" | "completed"
```

### Retrieving Token Information

```typescript
// For EVM chains
const evmClient = new EvmClient(wallet, ChainKind.Eth);
const nearTokenAddress = await evmClient.factory.nearToEthToken("token.near");

// For Solana
const solClient = new SolanaClient(provider, wormholeProgramId);
const isBridgedToken = await solClient.isBridgedToken(tokenPubkey);
```

## Security Considerations

1. Token ownership and admin rights transfer to the bridge
2. Metadata becomes immutable after deployment
3. Original token remains independent
4. Bridge contracts are upgradeable by governance

## Best Practices

1. Always verify token contracts before deployment
2. Monitor deployment status actively
3. Have sufficient funds for all steps
4. Keep deployment IDs for future reference
5. Test on testnet first

## Common Issues and Solutions

### 1. Insufficient Funds

```typescript
// Check required balances on NEAR
const { regBalance, initBalance, storage } = await client.getBalances();
const requiredBalance = regBalance + initBalance;
```

### 2. Invalid Token Metadata

```typescript
// Verify metadata before deployment
if (!tokenMetadata.name || !tokenMetadata.symbol || !tokenMetadata.decimals) {
  throw new Error("Invalid token metadata");
}
```

### 3. Failed Signature Verification

```typescript
// Ensure signature is valid for specific chain
if (!signature.isValidFor(ChainKind.Eth)) {
  throw new Error("Invalid signature for chain");
}
```

### 4. NEAR to Foreign Chain Binding Failures

```typescript
import { OmniBridgeAPI, NearBridgeClient, ChainKind } from "omni-bridge-sdk";
import { connect } from "near-api-js";

// Setup API and NEAR client
const api = new OmniBridgeAPI("testnet");
const near = await connect({
  networkId: "testnet",
  nodeUrl: "https://rpc.testnet.near.org",
});
const account = await near.account("client.near");
const nearClient = new NearBridgeClient(account);

// For NEAR to foreign chain deployments, ensure proof is ready before binding back to NEAR
while ((await api.getDeploymentStatus(txHash)).status !== "ready_for_bind") {
  await new Promise((r) => setTimeout(r, 1000));
}

// bindToken is always done with a NEAR client
await nearClient.bindToken(destinationChain, vaa, evmProof); // evmProof only needed for EVM chains
```

## Chain Support Matrix

| Source Chain | Destination Chains  | Required Steps                        |
| ------------ | ------------------- | ------------------------------------- |
| NEAR         | ETH, BASE, ARB, SOL | logMetadata → deployToken → bindToken |
| ETH/BASE/ARB | NEAR                | logMetadata → deployToken             |
| SOL          | NEAR                | logMetadata → deployToken             |

## Appendix

### MPC Signature Format

```typescript
interface MPCSignature {
  big_r: {
    affine_point: string;
  };
  s: {
    scalar: string;
  };
  recovery_id: number;
  toBytes(forEvm?: boolean): Uint8Array;
}
```

### Deployment Payloads

```typescript
interface TokenMetadata {
  token: string;
  name: string;
  symbol: string;
  decimals: number;
}

interface TokenDeployment {
  id: string;
  tokenAddress: OmniAddress;
  sourceChain: ChainKind;
  destinationChain: ChainKind;
  status:
    | "pending"
    | "ready_for_finalize"
    | "finalized"
    | "ready_for_bind"
    | "completed";
  proof?: {
    proof_kind: ProofKind;
    vaa: string;
  };
  metadata?: {
    nearAddress: string;
    tokenAddress: OmniAddress;
    emitterAddress: OmniAddress;
  };
  deploymentTx?: string;
  bindTx?: string;
}
```
