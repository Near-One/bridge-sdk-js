# Token Deployment Guide

This guide explains how to deploy tokens across different chains using the Omni Bridge protocol.

## Overview

Token deployment in Omni Bridge follows a three-phase process:

1. **Initialize** - Log token metadata on source chain
2. **Finalize** - Deploy token on destination chain using proof
3. **Bind** - (NEAR only) Bind the deployed token back to NEAR

Important: To deploy a token on any chain, it must first exist on NEAR. You cannot directly deploy from Ethereum to Solana - the token must first be deployed on NEAR.

## Quick Start

```typescript
import { Chain, omniAddress, getDeployer } from "omni-bridge-sdk";

// Initialize deployer for source chain
const deployer = getDeployer(Chain.Near, wallet, "testnet");

// Start deployment process
const deployment = await deployer.initDeployToken(
  omniAddress(Chain.Near, "token.near"),
  Chain.Eth
);

// Wait for metadata proof
while (
  (await getDeploymentStatus(deployment)).status !== "ready_for_finalize"
) {
  await new Promise((r) => setTimeout(r, 1000));
}

// Finalize deployment
const finalized = await deployer.finDeployToken(deployment);

// For NEAR as destination, bind token
if (deployment.destinationChain === Chain.Near) {
  while ((await getDeploymentStatus(finalized)).status !== "ready_for_bind") {
    await new Promise((r) => setTimeout(r, 1000));
  }
  await deployer.bindToken(finalized);
}
```

## Chain-Specific Examples

### Deploy NEAR Token to Ethereum

```typescript
import { connect } from "near-api-js";

// Setup NEAR connection
const near = await connect({
  networkId: "testnet",
  nodeUrl: "https://rpc.testnet.near.org",
});
const account = await near.account("example.near");

// Get deployer for NEAR
const deployer = getDeployer(Chain.Near, account, "testnet");

// Initialize deployment
const deployment = await deployer.initDeployToken(
  omniAddress(Chain.Near, "token.near"),
  Chain.Eth
);

// Monitor status and finalize when ready
const status = await getDeploymentStatus(deployment);
if (status.status === "ready_for_finalize") {
  await deployer.finDeployToken(deployment);
}
```

### Deploy Ethereum Token to NEAR

```typescript
import { ethers } from "ethers";

// Setup Ethereum wallet
const provider = new ethers.providers.Web3Provider(window.ethereum);
const signer = provider.getSigner();

// First deploy to NEAR
const nearDeployer = getDeployer(Chain.Near, nearWallet, "testnet");
const toNear = await nearDeployer.initDeployToken(
  omniAddress(Chain.Eth, "0x123..."),
  Chain.Near
);

// Wait for ready_for_finalize, then finalize
await nearDeployer.finDeployToken(toNear);

// Wait for ready_for_bind, then bind
await nearDeployer.bindToken(toNear);
```

## Deployment Status

A deployment goes through several states:

```typescript
type DeploymentStatus =
  | "pending" // Initial state after initDeployToken
  | "ready_for_finalize" // Proof is ready, can call finDeployToken
  | "finalized" // Token deployed on destination
  | "ready_for_bind" // (NEAR only) Ready for binding
  | "completed"; // Deployment complete
```

Monitor status using:

```typescript
const status = await getDeploymentStatus(deployment);
```

## Chain Requirements

### NEAR

- Account must exist and have sufficient balance for storage
- Token must be a valid NEP-141 token

### Ethereum

- Wallet must have admin role on factory contract
- Token must be a valid ERC20 token

### Solana

- Wallet must have sufficient SOL for rent
- Token must be an SPL token

## Error Handling

```typescript
try {
  const deployment = await deployer.initDeployToken(addr, Chain.Eth);
} catch (error) {
  if (error.message.includes("Insufficient balance")) {
    // Handle insufficient funds
  } else if (error.message.includes("Invalid token")) {
    // Handle invalid token
  }
}
```

## Gas and Storage Costs

### NEAR

- `initDeployToken`: ~5 TGas + storage deposit
- `finDeployToken`: ~10 TGas
- `bindToken`: ~5 TGas

### Ethereum

- `initDeployToken`: ~100k gas
- `finDeployToken`: ~500k gas
- No bind step required

### Solana

- `initDeployToken`: ~10k lamports
- `finDeployToken`: ~50k lamports
- No bind step required

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

## Troubleshooting

Common issues and solutions:

1. **Proof not ready**

   - Wait longer between initialization and finalization
   - Check bridge indexer status

2. **Invalid token**

   - Verify token implements correct interface
   - Check token is active and not paused

3. **Transaction failures**

   - Check gas/storage estimates
   - Verify account permissions

4. **Binding failures**
   - Ensure proof is ready
   - Check NEAR account has sufficient balance
