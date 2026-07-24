# @omni-bridge/aptos

Aptos transaction builder for the Omni Bridge SDK. Builds entry-function payloads for the `omni_bridge` Move package, compatible with `InputEntryFunctionData` from `@aptos-labs/ts-sdk`.

## Install

```bash
npm install @omni-bridge/core @omni-bridge/aptos
```

> **Note:** The Aptos bridge contract is not yet deployed, so no bridge address ships in the SDK config. `bridge.validateTransfer()` throws `UNSUPPORTED_CHAIN` for Aptos-source transfers until then, and the full validate-then-build flow below only works once the address ships. Against your own deployment you can already use the builder payload APIs (pass the module address via `bridgeAddress`), the event helpers, and the address utilities.

## Usage

```typescript
import { createBridge } from "@omni-bridge/core"
import { createAptosBuilder } from "@omni-bridge/aptos"
import { Account, Aptos, AptosConfig, Ed25519PrivateKey, Network } from "@aptos-labs/ts-sdk"

const bridge = createBridge({ network: "mainnet" })
const builder = createAptosBuilder({ network: "mainnet", bridgeAddress: "0x..." })
const account = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey("0x...") })

// 1. Validate
const validated = await bridge.validateTransfer({
  token: "aptos:0x000000000000000000000000000000000000000000000000000000000000000a", // APT
  amount: 100_000_000n, // 1 APT (8 decimals)
  fee: 0n,
  nativeFee: 0n,
  sender: "aptos:0xYourAddress...",
  recipient: "near:alice.near",
})

// 2. Build the entry-function payload (no approval step needed on Aptos)
const payload = builder.buildTransfer({
  token: "0xa",
  amount: validated.params.amount,
  fee: validated.params.fee,
  nativeFee: validated.params.nativeFee,
  recipient: validated.params.recipient,
})

// 3. Sign and submit with @aptos-labs/ts-sdk (or a wallet adapter)
const aptos = new Aptos(new AptosConfig({ network: Network.MAINNET }))
const transaction = await aptos.transaction.build.simple({
  sender: account.accountAddress,
  data: payload,
})
const pending = await aptos.signAndSubmitTransaction({ signer: account, transaction })
```

## API

- `createAptosBuilder({ network, bridgeAddress? })` — payload builder factory
  - `buildTransfer(params)` — `init_transfer` payload
  - `buildLogMetadata(token)` — `log_metadata` payload
  - `buildDeployToken(signature, metadata)` — `deploy_token` payload from a NEAR `LogMetadataEvent`
  - `buildFinalization(signature, payload)` — `fin_transfer` payload from a NEAR `SignTransferEvent`
- Event helpers (fullnode REST): `getAptosInitTransferEvent`, `getAptosEventLog`, `getAptosInitTransferLog`, `getAptosDeployTokenLog`, `getAptosFinTransferLog`, `parseAptosInitTransferEvent`, `isAptosTransferFinalised`
- Address utilities: `normalizeAptosAddress`, `aptosAddressToBytes`, `deriveAptosBridgeObjectAddress`, `deriveAptosBridgedTokenAddress`
- `normalizeAptosEventData` — canonical sorted-key JSON of event data for MPC proof construction

See `docs/guides/aptos.mdx` and `docs/reference/aptos.mdx` in the repository for details.

## License

MIT
