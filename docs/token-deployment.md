# Token Deployment Guide

This guide explains how to deploy tokens across different chains using the Omni Bridge protocol.

## Overview

Token deployment in Omni Bridge follows a three-phase process:

1. **Initialize** - Log token metadata on source chain
2. **Finalize** - Deploy token on destination chain using proof
3. **Bind** - (NEAR-involved flows only) Bind the deployed token back to NEAR

Important: To deploy a token on any chain, it must first exist on NEAR. You cannot directly deploy from Ethereum to Solana - the token must first be deployed on NEAR.

## Chain-Specific Deployment Examples

Every deployment has three concrete operations:

1. Call `logMetadata` on the origin chain to authorize the wrapped token.
2. Finalize the deployment on the destination chain.
3. When NEAR participates, finish by proving the deployment back to NEAR with an EVM proof or a Wormhole VAA.

The examples below assume `setNetwork("testnet")` and omit standard provider/connection bootstrapping for brevity.

### Deploying FROM NEAR to EVM Chains (Ethereum/Base/Arbitrum/Bnb)

```typescript
import { ChainKind, NearBridgeClient, ProofKind } from "omni-bridge-sdk"
import { EvmBridgeClient } from "omni-bridge-sdk"
import { getEvmProof } from "omni-bridge-sdk/proofs/evm.js"
import { connect } from "near-api-js"
import { ethers } from "ethers"

// 1. Log metadata on NEAR to retrieve the MPC signature
const near = await connect({
  networkId: "testnet",
  nodeUrl: "https://test.rpc.fastnear.com",
})
const nearAccount = await near.account("client.near")
const nearClient = new NearBridgeClient(nearAccount)

const { signature, metadata_payload } = await nearClient.logMetadata(
  "near:token.near"
)

// 2. Deploy the wrapped token on the destination EVM chain
const provider = new ethers.providers.Web3Provider(window.ethereum)
const evmWallet = provider.getSigner()
const evmClient = new EvmBridgeClient(evmWallet, ChainKind.Eth)

const { txHash, tokenAddress } = await evmClient.deployToken(signature, {
  token: metadata_payload.token,
  name: metadata_payload.name,
  symbol: metadata_payload.symbol,
  decimals: metadata_payload.decimals,
})

// 3. Produce an EVM Merkle proof of the deployment and bind on NEAR
const receipt = await provider.getTransactionReceipt(txHash)
const deployTopic = receipt.logs[0]?.topics[0]
if (!deployTopic) {
  throw new Error("Token deployment log not found")
}

const evmProof = await getEvmProof(txHash, deployTopic, ChainKind.Eth)

await nearClient.bindToken(ChainKind.Eth, undefined, {
  proof_kind: ProofKind.DeployToken,
  proof: evmProof,
})

console.log(`Wrapped token deployed at ${tokenAddress}`)
```

> [!TIP]
> If you rely on an indexer or relayer, wait until it reports `ready_for_bind` before calling `bindToken`. When building your own flow, the proof becomes available as soon as the EVM transaction is finalized.

### Deploying FROM NEAR to Solana (Wormhole)

```typescript
import { ChainKind, NearBridgeClient } from "omni-bridge-sdk";
import { SolanaBridgeClient } from "omni-bridge-sdk";
import { getVaa } from "omni-bridge-sdk/proofs/wormhole.js";
import { connect } from "near-api-js";

const near = await connect({
  networkId: "testnet",
  nodeUrl: "https://test.rpc.fastnear.com",
});
const nearClient = new NearBridgeClient(await near.account("client.near"));

const { signature, metadata_payload } = await nearClient.logMetadata("near:token.near");

const anchorProvider = /* your Anchor provider (wallet must implement the Anchor wallet interface) */;
const solanaClient = new SolanaBridgeClient(anchorProvider);

const { txHash, tokenAddress } = await solanaClient.deployToken(signature, {
  token: metadata_payload.token,
  name: metadata_payload.name,
  symbol: metadata_payload.symbol,
  decimals: metadata_payload.decimals,
});

// Fetch the Wormhole VAA that proves the deployment
const vaa = await getVaa(txHash, "Testnet");

await nearClient.bindToken(ChainKind.Sol, vaa);
console.log(`Wrapped mint created at ${tokenAddress}`);
```

`getVaa` internally polls Wormhole for up to two minutes. Repeat the call with a delay if it throws `No VAA found`.

> [!NOTE] > `anchorProvider` must be an Anchor-compatible provider (for example `new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions())`).

### Deploying FROM EVM Chains (Ethereum/Base/Arbitrum/Bnb) TO NEAR

```typescript
import { ChainKind, NearBridgeClient, ProofKind } from "omni-bridge-sdk"
import { EvmBridgeClient } from "omni-bridge-sdk"
import { getEvmProof } from "omni-bridge-sdk/proofs/evm.js"
import { connect } from "near-api-js"
import { ethers } from "ethers"

// 1. Log metadata on the source EVM chain
const provider = new ethers.providers.Web3Provider(window.ethereum)
const evmWallet = provider.getSigner()
const evmClient = new EvmBridgeClient(evmWallet, ChainKind.Eth)

const logTxHash = await evmClient.logMetadata("eth:0x123...")

// 2. Build a proof of the LogMetadata event
const logReceipt = await provider.getTransactionReceipt(logTxHash)
const logTopic = logReceipt.logs[0]?.topics[0]
if (!logTopic) {
  throw new Error("LogMetadata event not found in receipt")
}

const logMetadataProof = await getEvmProof(logTxHash, logTopic, ChainKind.Eth)

// 3. Deploy the wrapped token on NEAR using the proof
const near = await connect({
  networkId: "testnet",
  nodeUrl: "https://test.rpc.fastnear.com",
})
const nearAccount = await near.account("client.near")
const nearClient = new NearBridgeClient(nearAccount)

await nearClient.deployToken(ChainKind.Eth, undefined, {
  proof_kind: ProofKind.LogMetadata,
  proof: logMetadataProof,
})
```

Since NEAR is the destination chain in this flow, no additional `bindToken` step is required.

### Deploying FROM Solana TO NEAR (Wormhole)

```typescript
import { ChainKind, NearBridgeClient } from "omni-bridge-sdk";
import { SolanaBridgeClient } from "omni-bridge-sdk";
import { getVaa } from "omni-bridge-sdk/proofs/wormhole.js";
import { connect } from "near-api-js";

const anchorProvider = /* your Anchor provider */;
const solanaClient = new SolanaBridgeClient(anchorProvider);

const logTxHash = await solanaClient.logMetadata("sol:MINT_ADDRESS");

// Wormhole emits a VAA that proves the metadata log
const vaa = await getVaa(logTxHash, "Testnet");

const near = await connect({
  networkId: "testnet",
  nodeUrl: "https://test.rpc.fastnear.com",
});
const nearClient = new NearBridgeClient(await near.account("client.near"));

await nearClient.deployToken(ChainKind.Sol, vaa);
```

Because the deployment is finalized on NEAR, there is no follow-up binding step.

> [!NOTE]
> As above, `anchorProvider` refers to your pre-configured Anchor provider instance.

## Error Handling

Each deployment step can encounter different types of errors that need handling:

```typescript
try {
  await client.logMetadata("near:token.near")
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

A deployment is ready for the next step once the proof you need becomes available:

- For EVM chains, retry `getEvmProof(txHash, topic, chain)` until it resolves without throwing.
- For Solana, retry `getVaa(txHash, network)`; Wormhole VAAs can take up to a couple of minutes to surface.

If you run your own relayer or indexer, poll it for `ready_for_bind` (NEAR → foreign) or `ready_for_finalize` (foreign → NEAR) before continuing.

### Retrieving Token Information

```typescript
// For EVM chains
const evmClient = new EvmClient(wallet, ChainKind.Eth)
const nearTokenAddress = await evmClient.factory.nearToEthToken("token.near")

// For Solana
const solClient = new SolanaClient(provider, wormholeProgramId)
const isBridgedToken = await solClient.isBridgedToken(tokenPubkey)
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
const { regBalance, initBalance, storage } = await client.getBalances()
const requiredBalance = regBalance + initBalance
```

### 2. Invalid Token Metadata

```typescript
// Verify metadata before deployment
if (!tokenMetadata.name || !tokenMetadata.symbol || !tokenMetadata.decimals) {
  throw new Error("Invalid token metadata")
}
```

### 3. Failed Signature Verification

```typescript
// Ensure signature is valid for specific chain
if (!signature.isValidFor(ChainKind.Eth)) {
  throw new Error("Invalid signature for chain")
}
```

### 4. NEAR to Foreign Chain Binding Failures

```typescript
import { ChainKind, ProofKind } from "omni-bridge-sdk"
import { getEvmProof } from "omni-bridge-sdk/proofs/evm.js"
import { getVaa } from "omni-bridge-sdk/proofs/wormhole.js"

async function waitForDeploymentProof(
  chain: ChainKind,
  txHash: string,
  topic?: string
) {
  // Retry until the relevant proof fetch succeeds
  for (;;) {
    try {
      if (chain === ChainKind.Sol) {
        return { vaa: await getVaa(txHash, "Testnet") }
      }

      if (!topic) throw new Error("Missing log topic for EVM deployment proof")
      const proof = await getEvmProof(txHash, topic, chain)
      return {
        evmProof: {
          proof_kind: ProofKind.DeployToken,
          proof,
        },
      }
    } catch (error) {
      const message = (error as Error).message ?? ""
      if (!message.includes("not found") && !message.includes("No VAA")) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000))
    }
  }
}

// Usage:
// const { evmProof } = await waitForDeploymentProof(ChainKind.Eth, txHash, deployTopic);
// await nearClient.bindToken(ChainKind.Eth, undefined, evmProof);
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
    affine_point: string
  }
  s: {
    scalar: string
  }
  recovery_id: number
  toBytes(forEvm?: boolean): Uint8Array
}
```

### Deployment Payloads

```typescript
interface TokenMetadata {
  token: string
  name: string
  symbol: string
  decimals: number
}

interface TokenDeployment {
  id: string
  tokenAddress: OmniAddress
  sourceChain: ChainKind
  destinationChain: ChainKind
  status:
    | "pending"
    | "ready_for_finalize"
    | "finalized"
    | "ready_for_bind"
    | "completed"
  proof?: {
    proof_kind: ProofKind
    vaa: string
  }
  metadata?: {
    nearAddress: string
    tokenAddress: OmniAddress
    emitterAddress: OmniAddress
  }
  deploymentTx?: string
  bindTx?: string
}
```
