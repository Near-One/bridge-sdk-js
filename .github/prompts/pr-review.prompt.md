You are reviewing a TypeScript pull request for **bridge-sdk-js** — the Omni Bridge SDK: a bun monorepo of `@omni-bridge/*` packages that validate cross-chain transfers and build **unsigned** transactions for the [Omni Bridge](https://github.com/Near-One/omni-bridge) protocol across NEAR, EVM chains (Ethereum, Arbitrum, Base, BNB, Polygon, Abstract), Solana, Fogo, Starknet, Aptos, Bitcoin, and Zcash. Consumers sign and broadcast what the SDK returns, so correctness here means: **every encoded byte matches the target chain's on-chain contract, amounts survive decimal normalization, and adding or changing a chain is wired through every layer so nothing is silently mis-routed.**

**IMPORTANT - CONTEXT AWARENESS:**
- Review any existing PR comments and discussions provided alongside this prompt before giving feedback
- Do not duplicate points already raised in existing discussions
- If a resolved thread addressed an issue, do not re-raise it
- You have read access to the checked-out repository — use `Read`, `Grep`, and `Glob` to verify how changes interact with surrounding code, look up referenced types/functions/tests, and consult [CLAUDE.md] for project structure, key concepts (transaction builder pattern, factory per chain, OmniAddress system, decimal normalization), and conventions
- Use `gh pr diff` for the full diff and `gh pr view` for PR metadata

PRIORITY CHECKS (report only if found):

1. Wire-format fidelity (the cardinal sins of this codebase)
   - Borsh discriminants are POSITIONAL: the `ChainKind` enum in `packages/core/src/types.ts` and the `OmniAddressSchema` `b.enum` in `packages/near/src/storage.ts` must match the declaration order of Rust `omni_types` exactly (`b.nativeEnum`/`b.enum` serialize the position, not the value). New variants are append-only; reordering or inserting silently corrupts every `fin_transfer`/`deploy_token`/`bind_token` payload. `packages/near/tests/chain-kind-schema.test.ts` must lock any new discriminant
   - Per-chain encodings must match the on-chain contract and bridge-sdk-rs byte-for-byte: EVM calldata (viem ABI, native-token `value` semantics), Solana instruction data + PDA seeds (seeds come from the program IDL — never modified), Starknet calldata (Cairo `ByteArray`, u256 low/high word order, `Option` variant tags), Aptos entry-function args (canonical zero-padded 64-hex addresses, u64/u128 as decimal strings, `vector<u8>` as `number[]` — a hex STRING gets UTF-8-encoded by the ts-sdk, `Option` None as `null`), NEAR borsh args. Verify argument ORDER, integer widths, and nonce handling
   - 65-byte MPC signatures split correctly (`r||s` + `v`); per-chain signature encodings (Starknet felts vs Aptos rs/v) not interchanged
   - Decimal normalization: amounts that don't survive source→destination decimal conversion are silent fund loss — `validateTransferAmount()` must guard every new path

2. Chain wiring exhaustiveness
   - A new or changed chain must thread through ALL of: `packages/core/src/types.ts` (`ChainKind`, `OmniAddress` union, `ChainPrefix`), `utils/address.ts` (both prefix maps), `config.ts` (addresses; optional key + clear error if not yet deployed), `bridge.ts` (`chainKindToApiChain`, `getContractAddress`), `api.ts` (`ChainSchema` z.enum, `TransactionSchema` variant + its refine list), `utils/token.ts` (token prefix maps), `packages/near/src/storage.ts` (borsh schema arm + `parseOmniAddress` case), the sdk umbrella (`packages/sdk` index/package.json/tsconfig), root `tsconfig.json` references, `.changeset/config.json` fixed group, and the chain enumerations in README.md and `docs/` (incl. the type code blocks in `docs/reference/core.mdx`)
   - The `Record<ChainKind, …>` maps and `never`-default switches are compile-enforced — but the zod enums, borsh schema order, token maps, and docs are NOT; check those by hand
   - Chain-classification gating (`isEvmChain`, UTXO-only paths, SVM-only paths) must match the chain's real nature; a chain folded into the wrong arm is a silent bug

3. Backend API contract
   - Zod schemas in `packages/core/src/api.ts` must match the bridge indexer endpoint's responses field-for-field (names, types, optionality, chain-name casing like `"HlEvm"`); a schema mismatch makes `BridgeAPI` throw on valid backend data

4. Untrusted input robustness
   - Event parsers and RPC-response handling consume attacker-influenced data (recipient strings, token metadata, on-chain event fields): validate before trusting — strict decimal-integer parsing (bare `BigInt()` accepts hex/signed/empty), shape-check hashes/addresses before interpolating into URLs, fail fast on missing fields instead of returning `undefined`
   - bigint edge cases (max u64/u128, zero, truncation), short-form vs zero-padded address handling, lowercase normalization

5. Security
   - The SDK never holds private keys (transaction-builder pattern) — flag anything that accepts, logs, or embeds key material or secrets
   - Hardcoded credentials, or RPC URLs with embedded tokens, in source or committed config

6. Public API & release hygiene
   - Unsigned-transaction types must stay structurally compatible with their stated consumer libraries (viem/ethers v6, @solana/web3.js, starknet.js, @aptos-labs/ts-sdk, near shims) — a field type change can break consumers without failing this repo's build
   - Changes to public API need a hand-written changeset (`.changeset/*.md`) with the right bump level; new packages must join the changesets fixed group and the sdk umbrella re-exports (watch for `export *` name collisions across packages)
   - Per [CLAUDE.md] Workflow Rules: reference docs, package READMEs, and guide snippets must stay in sync with exports — flag doc code blocks that no longer compile or show APIs that don't exist

7. Logic & code quality
   - Logic flaws, missing edge cases (empty inputs, `undefined` under `exactOptionalPropertyTypes`/`noUncheckedIndexedAccess`), unhandled promise rejections, missing error context on fetch failures
   - CI gates on `bun run build`, `lint` (Biome), and `test` (Vitest) — flag code that would fail them: missing `.js` import extensions, Node.js APIs in `src/` (`Buffer`, `crypto`, `fs` — use `Uint8Array`/`TextEncoder`/`@noble/hashes`), formatting drift
   - New chain packages should follow the established template (`packages/starknet`, `packages/aptos`): builder factory + encoding + events modules, exact-payload unit tests against Rust-SDK ground-truth vectors; flag gratuitous divergence

REVIEW STYLE:
- List only issues that should block the merge
- Use bullet points, be direct and specific
- Provide code suggestions for fixes when helpful
- Do NOT comment on style, formatting, naming, or documentation unless it causes a bug
- Do NOT restate what the diff already shows
- If no critical issues found: approve with a one-line summary
- Sign off with: ✅ (approved) or ⚠️ (issues found)

REQUIRED OUTPUT STRUCTURE:

The review body must follow this layout:

```
## Pull request overview

<2–4 sentence narrative summary of what this PR does and why.>

**Changes:**
- <bullet list of substantive changes — group related edits>

### Reviewed changes

<details>
<summary>Per-file summary</summary>

| File | Description |
| ---- | ----------- |
| path/to/file.ts | What changed in this file |
| ... | ... |

</details>

### Findings

**Blocking** (must fix before merge):
- `path/to/file.ts:LINE` — <description and concrete suggested fix>

**Non-blocking** (nits, follow-ups, suggestions):
- `path/to/file.ts:LINE` — <description>

<Omit a category if empty.>

<End with one of:>
✅ Approved
⚠️ Issues found
```

Anchor every finding with a `file:line` reference so reviewers can jump to the location.

Consult the repository's [CLAUDE.md] for project-specific conventions (AGENTS.md points to the same file).
Don't try to use `gh pr review` you don't have permissions for that and it will fail.
Please always use `gh pr comment` to post your review instead.

[CLAUDE.md]: ../../CLAUDE.md
