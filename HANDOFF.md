# SDK v2 Rewrite Handoff Document

## Prompt for Next Agent

```
I'm continuing work on an SDK v2 rewrite. Please read this handoff document completely, then continue implementing the remaining packages following the established patterns.

The SPEC is at /home/ricky/bridge-sdk-js/SPEC.md
The AGENTS.md has repo-specific instructions at /home/ricky/bridge-sdk-js/AGENTS.md

Start by reading those files and the completed packages to understand the patterns, then implement @omni-bridge/btc next.
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

### 5. `@omni-bridge/solana` (packages/solana/)
Fully implemented with:
- `builder.ts` - SolanaBuilder with buildTransfer, buildFinalization, buildLogMetadata, buildDeployToken
- `types.ts` - Solana-specific types (SolanaTokenMetadata, SolanaTransferMessagePayload, SolanaMPCSignature)
- `idl.json` / `idl.ts` - Anchor IDL and TypeScript types
- PDA derivation methods: deriveConfig, deriveAuthority, deriveWrappedMint, deriveVault, deriveSolVault
- Connection is optional - uses public RPC endpoints by default
- Returns `TransactionInstruction[]` for consumer to build Transaction
- README.md with usage examples

---

## What Remains

### 6. `@omni-bridge/btc` (packages/btc/)

**Dependencies:** `@omni-bridge/core`, `@scure/btc-signer`, `@scure/base`, `merkletreejs`

**Key difference from other chains:** Bitcoin uses UTXO model, not account model. The builder focuses on:
1. UTXO selection for withdrawals
2. Deposit proof generation (Merkle proofs)
3. Transaction planning (inputs/outputs)

**Approach:**
```typescript
interface BtcBuilderConfig {
  network: "mainnet" | "testnet"
  apiUrl?: string  // Optional - uses public Blockstream API by default
}

interface BtcBuilder {
  // Withdrawal planning - select UTXOs and build transaction plan
  buildWithdrawalPlan(
    utxos: UTXO[],
    amount: bigint,
    targetAddress: string,
    changeAddress: string,
    feeRate?: number,
  ): BtcWithdrawalPlan

  // Deposit proof generation
  getDepositProof(txHash: string, vout: number): Promise<BtcDepositProof>
  getMerkleProof(txHash: string): Promise<BtcMerkleProof>

  // UTXO selection utilities
  selectUtxos(utxos: NormalizedUTXO[], amount: bigint, options: UtxoSelectionOptions): UtxoSelectionResult

  // Address utilities
  addressToScriptPubkey(address: string): string

  // Transaction broadcast
  broadcastTransaction(txHex: string): Promise<string>
}
```

**Reference files to adapt:**
- `src/utxo/index.ts` - UTXO selection logic (selectUtxos, linearFeeCalculator, buildBitcoinMerkleProof)
- `src/services/bitcoin.ts` - BitcoinService (buildWithdrawalPlan, getDepositProof, getMerkleProof)
- `src/utxo/rpc.ts` - RPC client for proof fetching

**Key types to define:**
```typescript
interface UTXO {
  txid: string
  vout: number
  balance: number | bigint
  tx_bytes: Uint8Array | number[]
  path?: string
}

interface BtcWithdrawalPlan {
  inputs: string[]  // "txid:vout" format
  outputs: { value: number; script_pubkey: string }[]
  fee: bigint
}

interface BtcDepositProof {
  merkle_proof: string[]
  tx_block_blockhash: string
  tx_bytes: number[]
  tx_index: number
  amount: bigint
}

interface BtcMerkleProof {
  block_height: number
  pos: number
  merkle: string[]
}
```

**Implementation notes:**
1. Use `@scure/btc-signer` for address parsing and network config
2. Use `merkletreejs` with `isBitcoinTree: true` for Merkle proofs
3. Default to Blockstream API for testnet/mainnet
4. UTXO selection uses largest-first algorithm by default
5. Fee calculation is linear based on input/output counts

### 7. `@omni-bridge/sdk` (packages/sdk/)

Already set up to re-export from all packages. Once `@omni-bridge/btc` is complete, verify it builds and exports correctly.

Current state:
```typescript
export * from "@omni-bridge/btc"
export * from "@omni-bridge/core"
export * from "@omni-bridge/evm"
export * from "@omni-bridge/near"
export * from "@omni-bridge/solana"
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
| Solana | Returns `TransactionInstruction[]`, optional Connection | One library, needs RPC for account lookups |
| BTC    | Returns `BtcWithdrawalPlan` (inputs/outputs) | UTXO model, consumer handles signing |

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
- `src/utxo/index.ts` - UTXO selection and Merkle proof utilities
- `src/services/bitcoin.ts` - BitcoinService with withdrawal planning and proofs
- `src/utxo/rpc.ts` - RPC client for Bitcoin/Zcash nodes
- `src/types/bitcoin.ts` - Bitcoin-specific types

---

## Important Notes

1. **Don't modify old src/, tests/, e2e/ files** - They have pre-existing lint issues that shouldn't be fixed as part of this work

2. **Bitcoin uses UTXO model** - Very different from account-based chains. Focus on input selection and fee calculation

3. **Merkle proofs for deposits** - Bitcoin deposits are verified via Merkle inclusion proofs, not transaction receipts

4. **Fee calculation is complex** - Use linear fee calculator based on input/output counts and fee rate (sat/vB)

5. **Address validation** - Use `@scure/btc-signer` for address parsing and script_pubkey generation

6. **Commit style** - Use Conventional Commits, one-line messages

---

## Progress Summary

| Package | Status | Notes |
|---------|--------|-------|
| `@omni-bridge/core` | ✅ Complete | Types, config, API, validation |
| `@omni-bridge/evm` | ✅ Complete | Builder, ABIs, proof generation |
| `@omni-bridge/near` | ✅ Complete | Builder, shims for near-kit/near-api-js |
| `@omni-bridge/solana` | ✅ Complete | Builder, Anchor IDL, PDA derivation |
| `@omni-bridge/btc` | ✅ Complete | UTXO selection, withdrawal planning, proofs |
| `@omni-bridge/sdk` | ✅ Complete | Re-exports all packages |
