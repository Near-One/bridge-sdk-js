import { beforeAll, describe, expect, test } from "bun:test"
import {
  createNearBuilder,
  type LogMetadataEvent,
  MPCSignature,
  toNearKitTransaction,
} from "@omni-bridge/near"
import { createSolanaBuilder } from "@omni-bridge/solana"
import { Connection, Keypair, sendAndConfirmTransaction, Transaction } from "@solana/web3.js"
import type { Near } from "near-kit"
import { TIMEOUTS } from "./shared/fixtures.js"
import { createNearKitInstance, TEST_CONFIG } from "./shared/setup.js"

const LONG_NEAR_TOKEN_ACCOUNT = "dbc.tokens.potlock.testnet"

describe("NEAR → SOL token deployment (shim PDA derivation)", () => {
  let near: Near
  let connection: Connection
  let keypair: Keypair

  beforeAll(async () => {
    // Setup NEAR
    near = await createNearKitInstance()

    // Setup Solana
    const { solana } = TEST_CONFIG.networks
    if (!solana.privateKey) {
      throw new Error("SOL_PRIVATE_KEY environment variable required")
    }

    const privateKeyBytes = Uint8Array.from(Buffer.from(solana.privateKey, "base64"))
    keypair = Keypair.fromSecretKey(privateKeyBytes)
    connection = new Connection(solana.rpcUrl, solana.commitment)
  })

  test(
    "deploys or detects wrapped mint for long NEAR account ids",
    async () => {
      // Create builders
      const nearBuilder = createNearBuilder({ network: "testnet" })
      const solBuilder = createSolanaBuilder({ network: "testnet", connection })

      const signerId = TEST_CONFIG.networks.near.accountId

      // Derive expected mint using builder's PDA derivation
      const expectedMint = solBuilder.deriveWrappedMint(LONG_NEAR_TOKEN_ACCOUNT)

      // Step 1: Log metadata on NEAR
      const logMetadataTx = nearBuilder.buildLogMetadata(LONG_NEAR_TOKEN_ACCOUNT, signerId)
      const logMetadataResult = await toNearKitTransaction(near, logMetadataTx).send({
        waitUntil: "FINAL",
      })

      // Parse LogMetadataEvent from logs
      const eventLog = logMetadataResult.receipts_outcome
        .flatMap((receipt) => receipt.outcome.logs)
        .find((log) => log.includes("LogMetadataEvent"))

      if (!eventLog) {
        throw new Error("LogMetadataEvent not found in transaction logs")
      }

      const metadataEvent: LogMetadataEvent = JSON.parse(eventLog).LogMetadataEvent
      console.log(
        "NEAR log_metadata -> signature:",
        metadataEvent.signature,
        "payload:",
        metadataEvent.metadata_payload,
      )

      const signature = MPCSignature.fromRaw(metadataEvent.signature)

      // Step 2: Deploy token on Solana
      let wrappedMintAddress: string | undefined
      try {
        const deployInstructions = await solBuilder.buildDeployToken(
          signature,
          {
            token: metadataEvent.metadata_payload.token,
            name: metadataEvent.metadata_payload.name,
            symbol: metadataEvent.metadata_payload.symbol,
            decimals: metadataEvent.metadata_payload.decimals,
          },
          keypair.publicKey,
        )

        const { blockhash } = await connection.getLatestBlockhash()
        const tx = new Transaction({
          recentBlockhash: blockhash,
          feePayer: keypair.publicKey,
        })
        tx.add(...deployInstructions)

        const txHash = await sendAndConfirmTransaction(connection, tx, [keypair])
        console.log("Solana deploy_token -> tx hash:", txHash, "mint:", expectedMint.toBase58())
        wrappedMintAddress = expectedMint.toString()
      } catch (error: unknown) {
        const message = (error as Error).message ?? ""
        // Token may already be deployed
        expect(message).toMatch(/already deployed|already in use/i)
        console.log(
          "Solana deploy_token indicates already deployed:",
          message,
          "expected mint:",
          expectedMint.toBase58(),
        )
        wrappedMintAddress = expectedMint.toString()
      }

      expect(wrappedMintAddress).toBe(expectedMint.toString())

      // Verify mint account exists
      const mintAccount = await connection.getAccountInfo(expectedMint)
      expect(mintAccount).not.toBeNull()
      console.log("Confirmed mint account exists at:", expectedMint.toBase58())
    },
    TIMEOUTS.FULL_E2E_FLOW,
  )
})
