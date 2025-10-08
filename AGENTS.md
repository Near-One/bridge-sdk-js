# Repository Guidelines

## Development Commands

```bash
# Build and development
bun run build          # TypeScript compilation to dist/
bun run typecheck       # Type checking without build
bun run lint           # Biome linting and formatting

# Testing
bun run test           # Run all tests with Vitest
bun run test <pattern>     # Run specific test files matching pattern
bun run test --watch       # Watch mode for development

# Package management
bun install            # Install dependencies
bun run check-exports  # Validate package exports with @arethetypeswrong/cli
```

## Architecture Overview

The SDK uses a **factory pattern** with chain-specific clients behind common interfaces. Key architectural components:

### Client Architecture

- `getClient(chainKind, wallet)` factory creates blockchain-specific clients
- `EvmBridgeClient` handles Ethereum/Base/Arbitrum via ethers.js
- `NearBridgeClient` uses near-api-js for NEAR Protocol
- `SolanaBridgeClient` uses Anchor framework for Solana
- All clients implement common interface for `omniTransfer()`

### OmniAddress System

Cross-chain addresses use chain prefixes: `eth:0x123...`, `near:account.near`, `sol:public_key`. Use `omniAddress(chainKind, address)` helper for construction.

### Proof Systems

Two verification mechanisms:

- **EVM Proofs** (`src/proofs/evm.ts`): Merkle Patricia Trie proofs for Ethereum-family chains
- **Wormhole VAAs** (`src/proofs/wormhole.ts`): Verifiable Action Approvals for Solana↔NEAR

### Decimal Handling

Complex decimal normalization system in `src/utils/decimals.ts` prevents precision loss between chains with different decimal places. Always validate amounts using `validateTransferAmount()`.

### Configuration

Environment-aware config in `src/config.ts`:

- `setNetwork("testnet"|"mainnet")` switches all contract addresses
- Chain-specific RPC endpoints and contract addresses
- Network state is global for the SDK instance

## Key Files

- `src/client.ts` - Main `omniTransfer()` function and validation
- `src/factory.ts` - Client instantiation patterns
- `src/api.ts` - REST API client with Zod validation for bridge services
- `src/types/common.ts` - Core `OmniAddress` and chain types
- `src/types/omni.ts` - Transfer message structures

## Testing Patterns

Tests use Vitest with MSW for API mocking:

- Unit tests for individual utilities and clients
- Integration tests hitting live API endpoints (see `tests/integration/`)
- Snapshot tests for API response structures
- Mock implementations in test files show expected usage patterns

## Code Style

- **Biome** formatting: 2-space indents, 100-char line width, double quotes
- **Import extensions**: Must use `.js` extensions in imports (Biome rule)
- **Strict TypeScript**: Full type safety with strict compiler options
- **ESM modules**: Uses Node.js ESM with `.js` extension requirement

## Cross-Chain Transfer Flow

1. **Validation**: `validateTransferAmount()` checks decimal compatibility
2. **Client Creation**: Factory pattern based on source chain
3. **Transfer Execution**: Chain-specific implementation via client
4. **Proof Generation**: EVM Merkle proof or Wormhole VAA
5. **Finalization**: Destination chain processes proof

The SDK abstracts this complexity behind `omniTransfer(wallet, transferMessage)` for end users, but manual flows are available via individual client methods.

## Workflow Rules

### Git and Commit Practices

- Use Conventional Commits, and keep commit messages to one line

### Changeset Management

- When asked to create a changeset, manually create the file in the `.changeset` directory
- Do not use automated changeset tools - create the markdown file directly
- The project name is `omni-bridge-sdk`

### Pull Request Guidelines

- Verify `bun run build`, `bun run lint`, and `bun run test tests/` locally first
- Keep PR descriptions minimal, straightforward, and technical
- Focus on direct, factual descriptions of changes
- Avoid verbose explanations or marketing language
- Structure: brief summary, key changes, technical details only
