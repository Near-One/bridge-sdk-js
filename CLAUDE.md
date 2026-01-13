# Repository Guidelines

## Development Commands

```bash
# Build and development
bun run build          # TypeScript compilation to dist/
bun run typecheck      # Type checking without build
bun run lint           # Biome linting and formatting

# Testing
bun run test           # Run all tests with Vitest
bun run test <pattern> # Run specific test files matching pattern
bun run test --watch   # Watch mode for development
bun run test e2e/      # Run e2e tests (requires funded testnet accounts)

# Package management
bun install            # Install dependencies
bun run check-exports  # Validate package exports with @arethetypeswrong/cli
```

## Architecture Overview

This is a monorepo containing the `@omni-bridge/*` SDK packages under `packages/`. The SDK uses a **transaction builder pattern** - it handles all bridge protocol logic (validation, encoding, fee calculation) but returns unsigned transactions for consumers to sign and broadcast with their own tooling.

### Package Structure

```
packages/
├── core/        # @omni-bridge/core - Types, validation, config, API client
├── evm/         # @omni-bridge/evm - EVM transaction builder (viem-based)
├── near/        # @omni-bridge/near - NEAR transaction builder + shims
├── solana/      # @omni-bridge/solana - Solana instruction builder (Anchor-based)
├── btc/         # @omni-bridge/btc - Bitcoin/Zcash UTXO operations
└── sdk/         # @omni-bridge/sdk - Umbrella re-export of all packages
```

### Core Concepts

**Factory Pattern**: Each chain has a builder factory:

- `createBridge({ network })` → validation and API access
- `createEvmBuilder({ network, chain })` → EVM transaction building
- `createNearBuilder({ network })` → NEAR transaction building
- `createSolanaBuilder({ network, connection? })` → Solana instruction building
- `createBtcBuilder({ network, chain })` → Bitcoin/Zcash UTXO operations

**Unsigned Transaction Types**: SDK returns library-agnostic plain objects:

- `EvmUnsignedTransaction` → Compatible with viem and ethers v6 directly
- `NearUnsignedTransaction` → Use shims: `toNearKitTransaction()` or `sendWithNearApiJs()`
- `TransactionInstruction[]` → Native @solana/web3.js instructions
- `BtcWithdrawalPlan` → UTXO inputs/outputs for signing

**OmniAddress System**: Cross-chain addresses use chain prefixes:
`eth:0x...`, `near:account.near`, `sol:...`, `base:0x...`, `arb:0x...`, `btc:...`, `zec:...`

### Transfer Flow

1. `bridge.validateTransfer(params)` → Validates and returns `ValidatedTransfer`
2. `builder.buildTransfer(validated)` → Returns unsigned transaction
3. Consumer signs and broadcasts using their preferred library

### Key Files

- `packages/core/src/bridge.ts` - `createBridge()` factory and validation
- `packages/core/src/types.ts` - Core types (`OmniAddress`, `ValidatedTransfer`, unsigned tx types)
- `packages/core/src/api.ts` - REST API client with Zod validation
- `packages/core/src/config.ts` - Network addresses and chain IDs
- `packages/evm/src/builder.ts` - EVM transaction builder
- `packages/near/src/builder.ts` - NEAR transaction builder
- `packages/near/src/shims.ts` - near-kit and near-api-js conversion helpers
- `packages/solana/src/builder.ts` - Solana instruction builder
- `packages/btc/src/builder.ts` - Bitcoin/Zcash UTXO builder

## Testing Patterns

Tests use Vitest with MSW for API mocking:

- **Unit tests**: `packages/*/tests/*.test.ts` - Pure function testing
- **E2E tests**: `e2e/*.test.ts` - Real testnet transactions

Run specific package tests:

```bash
bun run test packages/core/    # Core package tests
bun run test packages/evm/     # EVM builder tests
```

## Code Style

- **Biome** formatting: 2-space indents, 100-char line width, double quotes, no semicolons
- **Import extensions**: Must use `.js` extensions in imports (Biome rule)
- **No Node.js APIs**: Use `Uint8Array`/`TextEncoder` instead of `Buffer`, `@noble/hashes` instead of `crypto`
- **Strict TypeScript**: Full type safety with strict compiler options
- **ESM modules**: Uses Node.js ESM with `.js` extension requirement

## Workflow Rules

### Documentation Updates

When making changes to the SDK, always update documentation accordingly:

- **Reference docs** (`docs/reference/`): Update when adding/changing public API methods, parameters, or return types
- **Code snippets**: Ensure all code examples in docs still compile and reflect current API
- **Package READMEs** (`packages/*/README.md`): Keep API sections in sync with actual exports
- **Guides** (`docs/guides/`): Update when workflows or best practices change
- **Examples** (`docs/examples/`, `examples/`): Verify examples work with any API changes

Run `bun run typecheck` to catch any stale code snippets that no longer compile.

### Git and Commit Practices

- Use Conventional Commits, and keep commit messages to one line

### Changeset Management

- When asked to create a changeset, manually create the file in the `.changeset` directory
- Do not use automated changeset tools - create the markdown file directly
- Package names use the `@omni-bridge/` namespace (e.g., `@omni-bridge/core`)

### Pull Request Guidelines

- Verify `bun run build`, `bun run lint`, and `bun run test` locally first
- Keep PR descriptions minimal, straightforward, and technical
- Focus on direct, factual descriptions of changes
- Avoid verbose explanations or marketing language
- Structure: brief summary, key changes, technical details only

## Important Implementation Notes

1. **Decimal normalization is critical** - Transfers can fail silently if amount doesn't survive decimal conversion. Always use `validateTransferAmount()`.

2. **NEAR storage deposits are stateful** - Use `builder.getRequiredStorageDeposit()` before transfers.

3. **EVM native token transfers** - When token is `0x0000...0000`, the `value` field carries the amount plus native fee.

4. **Solana PDAs must match on-chain program** - Seed constants come from the program IDL. Don't modify them.

5. **NEAR transactions require shims** - SDK returns `{ signerId, receiverId, actions }`. Use `toNearKitTransaction()` or `sendWithNearApiJs()` to handle nonce/blockHash at send time.
