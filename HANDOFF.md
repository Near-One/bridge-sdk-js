# SDK v2 Rewrite Handoff Document

## Prompt for Next Agent

```
I'm continuing work on an SDK v2 rewrite. Please read this handoff document completely, then continue implementing the remaining packages following the established patterns.

The SPEC is at /home/ricky/bridge-sdk-js/SPEC.md
The AGENTS.md has repo-specific instructions at /home/ricky/bridge-sdk-js/AGENTS.md

Start by reading those files and the completed packages to understand the patterns, then implement @omni-bridge/near next.
```

---

## Project Overview

Rewriting `omni-bridge-sdk` from a monolithic package into a multi-package monorepo. The goal is to separate transaction **building** from transaction **signing/execution**, returning unsigned transactions that consumers can sign with their own tooling.

**Repository:** `/home/ricky/bridge-sdk-js`
**Branch:** `rewrite`

---

## What's Been Completed

### 1. Monorepo Workspace Setup
- Bun workspaces configured in root `package.json`
- `tsconfig.base.json` for shared TypeScript settings
- Project references in `tsconfig.json` for build ordering
- All 6 package directories created under `packages/`

### 2. `@omni-bridge/core` (packages/core/)
Fully implemented with:
- `types.ts` - Core types (ChainKind, OmniAddress, TransferParams, ValidatedTransfer, unsigned tx types)
- `errors.ts` - Error hierarchy (OmniBridgeError, ValidationError, RpcError, ProofError)
- `config.ts` - Network addresses for all chains (mainnet/testnet)
- `api.ts` - BridgeAPI client with Zod validation
- `bridge.ts` - createBridge() factory and validateTransfer()
- `utils/address.ts` - Address parsing (getChain, getAddress, omniAddress, isEvmChain)
- `utils/decimals.ts` - Decimal normalization (normalizeAmount, verifyTransferAmount, validateTransferAmount)

### 3. `@omni-bridge/evm` (packages/evm/)
Fully implemented with:
- `abi.ts` - Contract ABIs (BRIDGE_TOKEN_FACTORY_ABI, ERC20_ABI)
- `builder.ts` - EvmBuilder with buildTransfer, buildApproval, buildMaxApproval, buildFinalization, buildLogMetadata, buildDeployToken
- `proof.ts` - getEvmProof() for Merkle Patricia Trie proof generation
- Uses `viem` instead of `ethers`

---

## What Remains

### 4. `@omni-bridge/near` (packages/near/)
**Dependencies:** `@omni-bridge/core`, `near-kit`

Needs to implement:
```typescript
interface NearBuilder {
  buildTransfer(validated: ValidatedTransfer, signerId: string): Promise<Transaction>
  buildStorageDeposit(signerId: string, amount: bigint): Promise<Transaction>
  getRequiredStorageDeposit(signerId: string): Promise<bigint>
  buildFinalization(params: FinalizationParams): Promise<Transaction>
  buildLogMetadata(token: string, signerId: string): Promise<Transaction>
  buildDeployToken(proof: Uint8Array, signerId: string): Promise<Transaction>
  buildBindToken(proof: Uint8Array, signerId: string): Promise<Transaction>
  buildSignTransfer(transferId: TransferId, feeRecipient: string, signerId: string): Promise<Transaction>
  buildFastFinTransfer(params: FastFinTransferParams, signerId: string): Promise<Transaction>
}
```

**Reference:** See `src/clients/near-kit.ts` for existing implementation patterns

### 5. `@omni-bridge/solana` (packages/solana/)
**Dependencies:** `@omni-bridge/core`, `@coral-xyz/anchor`, `@solana/web3.js`

Needs to implement:
```typescript
interface SolanaBuilder {
  buildTransfer(validated: ValidatedTransfer, payer: string): Promise<SolanaUnsignedTransaction>
  buildFinalization(payload: TransferMessagePayload, signature: Uint8Array, payer: string): Promise<SolanaUnsignedTransaction>
  buildLogMetadata(token: string, payer: string): Promise<SolanaUnsignedTransaction>
  buildDeployToken(signature: Uint8Array, metadata: TokenMetadata, payer: string): Promise<SolanaUnsignedTransaction>
  derivePDAs(): SolanaPDAs
}
```

**Reference:** See `src/clients/solana.ts` for existing implementation

### 6. `@omni-bridge/btc` (packages/btc/)
**Dependencies:** `@omni-bridge/core`, `@scure/btc-signer`

Needs to implement:
```typescript
interface BtcBuilder {
  buildWithdrawalPlan(params: WithdrawalParams): BtcUnsignedTransaction
  selectUtxos(available: UTXO[], targetAmount: bigint, feeRate: number): UTXO[]
  getDepositProof(txHash: string, vout: number): Promise<DepositProof>
  getMerkleProof(txHash: string): Promise<MerkleProof>
}
```

**Reference:** See `src/utxo/index.ts` and `src/services/bitcoin.ts`

### 7. `@omni-bridge/sdk` (packages/sdk/)
Update to properly re-export from all packages:
```typescript
export * from "@omni-bridge/core"
export * from "@omni-bridge/evm"
export * from "@omni-bridge/near"
export * from "@omni-bridge/solana"
export * from "@omni-bridge/btc"
```

---

## Key Patterns to Follow

### Package Structure
```
packages/{name}/
├── src/
│   ├── index.ts      # Public exports
│   ├── builder.ts    # Main builder class
│   └── ...
├── package.json
└── tsconfig.json
```

### Factory Pattern
Each package exposes a `create{Name}Builder(config)` function that returns a builder interface.

### Unsigned Transactions
All `build*` methods return unsigned transaction objects (defined in `@omni-bridge/core/types.ts`):
- `EvmUnsignedTransaction` - { type: "evm", chainId, to, data, value }
- `NearUnsignedTransaction` - { type: "near", signerId, receiverId, actions }
- `SolanaUnsignedTransaction` - { type: "solana", feePayer, instructions }
- `BtcUnsignedTransaction` - { type: "btc", inputs, outputs }

### Import Style
- Use `.js` extensions in imports (Biome rule)
- Import types from `@omni-bridge/core`
- Keep external dependencies minimal per package

---

## Commands

```bash
bun install              # Install dependencies
bun run build            # Build all packages (tsc --build)
bun run clean            # Clean build artifacts
bun run lint             # Biome linting
bunx biome check --write packages/{name}/src/  # Auto-fix lint issues
```

---

## Existing Source Files (for reference)

Key files from the old SDK that can be adapted:
- `src/clients/near-kit.ts` - NEAR client (adapt to return unsigned)
- `src/clients/solana.ts` - Solana client (adapt to return unsigned)
- `src/utxo/index.ts` - UTXO utilities
- `src/services/bitcoin.ts` - Bitcoin service
- `src/types/` - Type definitions

---

## Git Commits So Far

```
c5ef03a feat(evm): implement @omni-bridge/evm package
333ec0c chore: remove tsbuildinfo files from git tracking
571099d chore: add tsbuildinfo to gitignore
9875494 feat(core): implement @omni-bridge/core package
2f3a9e7 feat: setup bun monorepo workspace for SDK v2
71459c2 initial spec
```

---

## Important Notes

1. **Don't modify old src/, tests/, e2e/ files** - They have pre-existing lint issues that shouldn't be fixed as part of this work

2. **near-kit returns Transaction type** - The NEAR package should return near-kit's native `Transaction` type, not a custom wrapper

3. **Solana uses Anchor IDL** - Keep the existing Anchor pattern for instruction building

4. **Decimal normalization is critical** - Always use the utilities from `@omni-bridge/core/utils/decimals.ts`

5. **Gas constants matter** - Preserve gas limit constants from existing clients

6. **Commit style** - Use Conventional Commits, one-line messages
