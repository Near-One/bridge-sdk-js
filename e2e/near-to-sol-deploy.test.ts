import { PublicKey } from "@solana/web3.js"
import { beforeAll, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { NearBridgeClient } from "../src/clients/near-kit.js"
import { SolanaBridgeClient } from "../src/clients/solana.js"
import { addresses, setNetwork } from "../src/config.js"
import { ChainKind, MPCSignature } from "../src/types/index.js"
import { omniAddress } from "../src/utils/index.js"
// biome-ignore lint/correctness/useImportExtensions: JSON import requires .json extension
import BRIDGE_TOKEN_FACTORY_IDL from "../src/types/solana/bridge_token_factory_shim.json" with {
    type: "json"
}
import { TIMEOUTS } from "./shared/fixtures.js"
import { TEST_CONFIG, type TestAccountsSetup, setupTestAccounts } from "./shared/setup.js"

const LONG_NEAR_TOKEN_ACCOUNT = "dbc.tokens.potlock.testnet"

function getSeed(name: string): Uint8Array {
  const constant = BRIDGE_TOKEN_FACTORY_IDL.constants.find((item) => item.name === name)
  if (!constant?.value) {
    throw new Error(`Missing ${name} constant in Solana IDL`)
  }
  return new Uint8Array(JSON.parse(constant.value as string))
}

function deriveExpectedMint(token: string): PublicKey {
  const tokenBytes = Buffer.from(token, "utf-8")
  const seedBytes =
    tokenBytes.length > 32
      ? createHash("sha256").update(tokenBytes).digest()
      : Buffer.concat([tokenBytes, Buffer.alloc(32 - tokenBytes.length)])

  const [mint] = PublicKey.findProgramAddressSync(
    [getSeed("WRAPPED_MINT_SEED"), seedBytes],
    new PublicKey(addresses.sol.locker),
  )
  return mint
}

describe("NEAR → SOL token deployment (shim PDA derivation)", () => {
  let testAccounts: TestAccountsSetup
  let nearClient: NearBridgeClient
  let solanaClient: SolanaBridgeClient

  beforeAll(async () => {
    setNetwork("testnet")
    testAccounts = await setupTestAccounts()
    nearClient = new NearBridgeClient(testAccounts.nearKitInstance, undefined, {
      defaultSignerId: TEST_CONFIG.networks.near.accountId,
    })
    solanaClient = new SolanaBridgeClient(testAccounts.solanaProvider)
  })

  test(
    "deploys or detects wrapped mint for long NEAR account ids",
    async () => {
      const omniToken = omniAddress(ChainKind.Near, LONG_NEAR_TOKEN_ACCOUNT)
      const expectedMint = deriveExpectedMint(LONG_NEAR_TOKEN_ACCOUNT)

      const metadataEvent = await nearClient.logMetadata(omniToken)
      console.log(
        "NEAR log_metadata -> signature:",
        metadataEvent.signature,
        "payload:",
        metadataEvent.metadata_payload,
      )
      const signature = new MPCSignature(
        metadataEvent.signature.big_r,
        metadataEvent.signature.s,
        metadataEvent.signature.recovery_id,
      )

      let wrappedMintAddress: string | undefined
      try {
        const result = await solanaClient.deployToken(signature, metadataEvent.metadata_payload)
        console.log("Solana deploy_token -> tx hash:", result.txHash, "mint:", result.tokenAddress)
        wrappedMintAddress = result.tokenAddress
      } catch (error: unknown) {
        const message = (error as Error).message ?? ""
        expect(message).toMatch(/already deployed on solana/i)
        expect(message).toContain(expectedMint.toBase58())
        console.log(
          "Solana deploy_token indicates already deployed:",
          message,
          "expected mint:",
          expectedMint.toBase58(),
        )
        wrappedMintAddress = expectedMint.toString()
      }

      expect(wrappedMintAddress).toBe(expectedMint.toString())

      const mintAccount = await testAccounts.solanaProvider.connection.getAccountInfo(expectedMint)
      expect(mintAccount).not.toBeNull()
      console.log("Confirmed mint account exists at:", expectedMint.toBase58())
    },
    TIMEOUTS.FULL_E2E_FLOW,
  )
})
