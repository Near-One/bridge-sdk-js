# Omni Bridge SDK

The Omni Bridge SDK is a TypeScript library for seamless cross-chain token transfers between Ethereum, NEAR, Solana, Base, and Arbitrum using the Omni Bridge protocol. This is a production SDK library, not an application with a UI.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Required Dependencies
Install bun package manager before starting development:
```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

### Bootstrap and Build
- Install dependencies: `bun install` -- takes 1-2 minutes on first run. NEVER CANCEL. Set timeout to 5+ minutes.
- Type check: `bun run typecheck` -- takes 4 seconds.
- Build the SDK: `bun run build` -- takes 4 seconds.
- Run linting: `bun run lint` -- takes <1 second.

### Testing
- Run unit tests: `bun run test tests/types/ tests/utils/ tests/chains/near.test.ts tests/api.test.ts tests/client.test.ts` -- takes 2 seconds. These work offline.
- Full test suite: `bun run test` -- takes 4 seconds but WILL FAIL in sandboxed environments due to network requirements.

**CRITICAL**: Integration tests in `tests/integration/` require external network access to:
- Bridge API endpoints
- Blockchain RPC endpoints (Ethereum, NEAR, Solana)
- Wormhole services

In sandboxed environments, only run unit tests. Integration test failures due to "fetch failed" or "getaddrinfo ENOTFOUND" are expected and normal.

### Package Validation
- Check exports: `bun run check-exports` -- takes 2 seconds. ESM/CJS warnings are expected and normal.

## Validation

Always validate SDK changes through these steps:
1. Install dependencies with `bun install` 
2. Run type checking with `bun run typecheck`
3. Build the SDK with `bun run build`
4. Run unit tests (avoid integration tests in restricted environments)
5. Run linting with `bun run lint`
6. Check package exports with `bun run check-exports`

**Manual Validation Scenarios:**
Since this is an SDK library, validation focuses on successful compilation and test execution rather than UI testing:
- Verify TypeScript compilation succeeds without errors
- Ensure unit tests pass completely
- Confirm linting passes without issues
- Check that build artifacts are generated in `dist/` directory
- Validate package exports are properly configured

Always run `bun run lint` before committing changes or the CI (.github/workflows/ci.yml) will fail.

## Common Tasks

### Development Workflow
```bash
# Setup (run once)
curl -fsSL https://bun.sh/install | bash && source ~/.bashrc

# Standard development cycle
bun install                    # 1-2 minutes first run, NEVER CANCEL
bun run typecheck             # 4 seconds
bun run build                 # 4 seconds  
bun run test tests/types/ tests/utils/ tests/chains/near.test.ts tests/api.test.ts tests/client.test.ts  # Unit tests only
bun run lint                  # <1 second
```

### Repository Structure
```
.
├── README.md                 # Main documentation
├── package.json              # Project configuration and scripts
├── tsconfig.json            # TypeScript configuration  
├── biome.json               # Biome linting/formatting config
├── lefthook.yml             # Git hooks configuration
├── bun.lock                 # Dependency lock file
├── src/                     # Source code
│   ├── index.ts             # Main entry point
│   ├── client.ts            # Main client interface
│   ├── factory.ts           # Client factory
│   ├── api.ts               # Bridge API client
│   ├── config.ts            # Configuration management
│   ├── clients/             # Chain-specific clients
│   ├── types/               # TypeScript type definitions
│   ├── utils/               # Utility functions
│   └── proofs/              # Cryptographic proof utilities
├── tests/                   # Test files
│   ├── types/               # Type tests (work offline)
│   ├── utils/               # Utility tests (work offline)
│   ├── chains/              # Chain tests (work offline)
│   └── integration/         # Integration tests (require network)
├── docs/                    # Additional documentation
├── dist/                    # Build output (generated)
└── .github/                 # GitHub workflows and configs
```

### Key Scripts (from package.json)
- `build`: TypeScript compilation
- `test`: Run vitest test suite
- `lint`: Format and lint with Biome
- `typecheck`: Type checking without compilation
- `prepublishOnly`: Pre-publish build step
- `check-exports`: Validate package exports
- `release`: Build and publish to npm

### Important Configuration Files
- `tsconfig.json`: TypeScript configuration with ESNext target
- `biome.json`: Linting and formatting rules
- `lefthook.yml`: Pre-commit hooks for code quality
- `.github/workflows/ci.yml`: CI pipeline with type checking, linting, and tests

## Common Issues and Solutions

### Network-Related Test Failures
Integration tests will fail with network errors in sandboxed environments:
```
× should fetch real fee information
  → fetch failed
× should fetch status for a known transfer  
  → getaddrinfo ENOTFOUND ethereum-sepolia-rpc.publicnode.com
```
This is expected. Run only unit tests in restricted environments.

### ESM/CJS Export Warnings
The `check-exports` command shows warnings about ESM/CJS compatibility:
```
⚠️ A require call resolved to an ESM JavaScript file
```
This is expected for modern ESM packages and not an error.

### Long Install Times
`bun install` takes approximately 1-2 minutes on first run due to numerous blockchain dependencies including:
- @coral-xyz/anchor (Solana)
- ethers (Ethereum)
- near-api-js (NEAR)
- @wormhole-foundation/sdk (Wormhole)

Set appropriate timeouts and never cancel the install process.

### Build Artifacts
After running `bun run build`, check that `dist/` directory contains:
- `dist/src/` with compiled JavaScript files
- `dist/tests/` with compiled test files
- `.d.ts` TypeScript declaration files
- Source maps (`.js.map` files)

## SDK Usage Context

This SDK enables cross-chain token transfers between:
- Ethereum (ETH)
- NEAR Protocol  
- Solana (SOL)
- Base
- Arbitrum

Key functionality includes:
- Cross-chain token transfers with relayer support
- Token deployment across chains
- Transfer status tracking
- Fee estimation
- Proof generation and verification

When making changes, consider impact on:
- Chain-specific clients (`src/clients/`)
- Type definitions (`src/types/`)
- API integration (`src/api.ts`)
- Utility functions (`src/utils/`)

Always test changes against unit test suites to ensure compatibility across supported blockchain networks.