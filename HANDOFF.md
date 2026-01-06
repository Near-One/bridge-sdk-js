# SDK v2 Rewrite Handoff Document

## Prompt for Next Agent

```
I'm continuing work on an SDK v2 rewrite. Please read this handoff document completely, then continue implementing the remaining packages following the established patterns.

The SPEC is at /home/ricky/bridge-sdk-js/SPEC.md
The AGENTS.md has repo-specific instructions at /home/ricky/bridge-sdk-js/AGENTS.md

Start by reading those files and the completed packages to understand the patterns, then implement @omni-bridge/solana next.
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

### 4. `@omni-bridge/near` (packages/near/)
Fully implemented with:
- `builder.ts` - NearBuilder with all transfer, finalization, and token registration methods
- `shims.ts` - `toNearKitTransaction()`, `toNearApiJsActions()`, `sendWithNearApiJs()`
- `types.ts` - Borsh schemas for proof serialization (FinTransferArgsSchema, etc.)
- Uses `near-kit` for shims and `@near-js/accounts` + `@near-js/transactions` for near-api-js support
- View calls handled internally (getRequiredStorageDeposit, isTokenStorageRegistered)
- README.md with usage examples

---

## What Remains

### 5. `@omni-bridge/solana` (packages/solana/)

**Dependencies:** `@omni-bridge/core`, `@coral-xyz/anchor`, `@solana/web3.js`, `@solana/spl-token`

**Key difference from NEAR:** Solana only has one library ecosystem (@solana/web3.js + Anchor), so no shim pattern needed. The builder requires a `Connection` for RPC calls (checking token programs, bridged status, etc.) and returns `TransactionInstruction[]` that consumers add to a `Transaction`.

**Approach:**
```typescript
interface SolanaBuilderConfig {
  network: "mainnet" | "testnet"
  connection: Connection  // Required - needed for account lookups
}

interface SolanaBuilder {
  // Returns instructions - consumer builds Transaction, sets blockhash, signs
  buildTransfer(validated: ValidatedTransfer, payer: PublicKey): Promise<TransactionInstruction[]>
  buildFinalization(payload: TransferMessagePayload, signature: MPCSignature, payer: PublicKey): Promise<TransactionInstruction[]>
  buildLogMetadata(token: PublicKey, payer: PublicKey): Promise<TransactionInstruction[]>
  buildDeployToken(signature: MPCSignature, metadata: TokenMetadata, payer: PublicKey): Promise<TransactionInstruction[]>
  
  // PDA derivation (pure, no RPC)
  deriveConfig(): PublicKey
  deriveAuthority(): PublicKey
  deriveWrappedMint(token: string): PublicKey
  deriveVault(mint: PublicKey): PublicKey
}
```

**Why instructions instead of full Transaction?**
- Consumer controls blockhash fetching (can use durable nonces, etc.)
- Consumer can batch multiple operations into one transaction
- Consumer handles signing with their wallet/keypair
- Anchor's `.instruction()` method returns `TransactionInstruction` directly

**Reference:** See `src/clients/solana.ts` for:
- PDA derivation patterns (SEEDS constants, findProgramAddressSync)
- Account resolution logic (isBridgedToken, getTokenProgramForMint)
- Anchor method building pattern

**Key files to copy:**
- `src/types/solana/bridge_token_factory_shim.json` - Anchor IDL
- `src/types/solana/bridge_token_factory_shim.ts` - TypeScript types for IDL

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
├── tsconfig.json
└── README.md         # Usage examples
```

### Factory Pattern
Each package exposes a `create{Name}Builder(config)` function that returns a builder interface.

### Chain-Specific Patterns

| Chain  | Pattern | Why |
|--------|---------|-----|
| EVM    | Returns `EvmUnsignedTransaction` (plain object) | Multiple libraries (viem, ethers), stateless encoding |
| NEAR   | Returns `NearUnsignedTransaction` + shims | Two libraries (near-kit, near-api-js), nonce is per-key |
| Solana | Returns `TransactionInstruction[]`, requires Connection | One library, needs RPC for account lookups |
| BTC    | Returns `BtcUnsignedTransaction` (inputs/outputs) | UTXO model, consumer handles signing |

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
- `src/clients/solana.ts` - Solana client (adapt to return instructions)
- `src/utxo/index.ts` - UTXO utilities
- `src/services/bitcoin.ts` - Bitcoin service
- `src/types/solana/` - Anchor IDL and types

---

## Important Notes

1. **Don't modify old src/, tests/, e2e/ files** - They have pre-existing lint issues that shouldn't be fixed as part of this work

2. **Solana needs Connection** - Unlike NEAR which can do view calls internally, Solana account lookups need a Connection passed in

3. **Anchor IDL is required** - Copy the IDL JSON and TypeScript types from `src/types/solana/`

4. **Decimal normalization is critical** - Always use the utilities from `@omni-bridge/core/utils/decimals.ts`

5. **PDA seeds come from IDL constants** - Don't hardcode, extract from `BRIDGE_TOKEN_FACTORY_IDL.constants`

6. **Commit style** - Use Conventional Commits, one-line messages
