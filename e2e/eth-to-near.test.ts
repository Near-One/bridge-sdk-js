import { beforeAll, describe, expect, test } from "bun:test"
import { ChainKind, createBridge } from "@omni-bridge/core"
import {
  createEvmBuilder,
  ERC20_ABI,
  getEvmProof,
  getInitTransferTopic,
  parseInitTransferEvent,
} from "@omni-bridge/evm"
import { createNearBuilder, ProofKind, toNearKitTransaction } from "@omni-bridge/near"
import type { Near } from "near-kit"
import { createPublicClient, createWalletClient, type Hex, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"
import { ETH_TO_NEAR_ROUTES, TIMEOUTS } from "./shared/fixtures.js"
import { createNearKitInstance, TEST_CONFIG } from "./shared/setup.js"

describe("ETH to NEAR E2E Transfer Tests (New SDK)", () => {
  let near: Near
  let ethPrivateKey: Hex
  const signerId = TEST_CONFIG.networks.near.accountId

  beforeAll(async () => {
    // Setup near-kit instance
    near = await createNearKitInstance()

    // Get ETH private key
    const pk = process.env["ETH_PRIVATE_KEY"]
    if (!pk) {
      throw new Error("ETH_PRIVATE_KEY environment variable required")
    }
    ethPrivateKey = (pk.startsWith("0x") ? pk : `0x${pk}`) as Hex

    console.log("Test setup complete:")
    console.log(`  ETH Address: ${privateKeyToAccount(ethPrivateKey).address}`)
    console.log(`  NEAR Account: ${signerId}`)
  })

  test.each(ETH_TO_NEAR_ROUTES)(
    "should complete manual ETH to NEAR transfer: $name",
    async (route) => {
      console.log(`\n Testing ${route.name} (New SDK)...`)

      // Create builders
      const bridge = createBridge({ network: "testnet" })
      const evmBuilder = createEvmBuilder({ network: "testnet", chain: ChainKind.Eth })
      const nearBuilder = createNearBuilder({ network: "testnet" })

      // Create viem clients
      const account = privateKeyToAccount(ethPrivateKey)
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(TEST_CONFIG.networks.ethereum.rpcUrl),
      })
      const walletClient = createWalletClient({
        account,
        chain: sepolia,
        transport: http(TEST_CONFIG.networks.ethereum.rpcUrl),
      })

      // Step 1: Validate transfer params
      console.log("Step 1: Validating transfer params...")
      const validated = await bridge.validateTransfer({
        token: route.token.address,
        amount: BigInt(route.token.testAmount),
        fee: 0n,
        nativeFee: 0n,
        sender: `eth:${account.address}`,
        recipient: `near:${route.recipient}`,
      })

      console.log(`  Token: ${route.token.symbol} (${route.token.address})`)
      console.log(`  Amount: ${validated.params.amount}`)
      console.log(`  Recipient: ${validated.params.recipient}`)

      // Step 2: Check and build approval if needed
      console.log("\nStep 2: Checking token approval...")
      const tokenAddress = route.token.address.split(":")[1] as Hex

      const allowance = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [account.address, evmBuilder.bridgeAddress],
      })

      if (allowance < validated.params.amount) {
        console.log("  Approving tokens...")
        const approvalTx = evmBuilder.buildMaxApproval(tokenAddress)
        const approvalHash = await walletClient.sendTransaction(approvalTx)
        await publicClient.waitForTransactionReceipt({ hash: approvalHash })
        console.log(`  Approval tx: ${approvalHash}`)
      } else {
        console.log("  Already approved")
      }

      // Step 3: Build and send transfer transaction
      console.log("\nStep 3: Initiating transfer on Ethereum...")
      const transferTx = evmBuilder.buildTransfer(validated)
      const txHash = await walletClient.sendTransaction(transferTx)
      console.log(`  Transaction hash: ${txHash}`)

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      console.log(`  Block: ${receipt.blockNumber}`)
      expect(receipt.status).toBe("success")

      // Step 4: Parse InitTransfer event
      console.log("\nStep 4: Parsing InitTransfer event...")
      const initEvent = parseInitTransferEvent(receipt.logs)
      console.log(`  Origin nonce: ${initEvent.originNonce}`)
      console.log(`  Token: ${initEvent.tokenAddress}`)
      console.log(`  Amount: ${initEvent.amount}`)
      console.log(`  Recipient: ${initEvent.recipient}`)

      expect(initEvent.originNonce).toBeGreaterThan(0n)
      expect(initEvent.amount).toBe(validated.params.amount)

      // Step 5: Generate EVM proof
      console.log("\nStep 5: Generating EVM proof...")
      const initTransferTopic = getInitTransferTopic()
      const proof = await getEvmProof(txHash, initTransferTopic, ChainKind.Eth, "testnet")
      console.log(`  Proof length: ${proof.proof.length} nodes`)
      console.log(`  Log index: ${proof.log_index}`)

      expect(proof.proof.length).toBeGreaterThan(0)

      // Step 6: Check if we should wait for light client
      const shouldWaitForLightClient = process.env["FULL_E2E_TEST"] === "true"

      if (shouldWaitForLightClient) {
        console.log("\nStep 6: Waiting for NEAR light client to sync...")
        console.log("  This will take approximately 30 minutes.")
        console.log(
          "  The light client needs to sync the Ethereum block containing our transaction.",
        )

        // Wait 30 minutes for light client
        await new Promise((resolve) => setTimeout(resolve, 1800000))

        // Step 7: Finalize on NEAR
        console.log("\nStep 7: Finalizing transfer on NEAR...")

        // Get the bridged token on NEAR for storage deposit
        const nearToken = await bridge.getBridgedToken(route.token.address, ChainKind.Near)
        if (!nearToken) {
          throw new Error("Could not find bridged token on NEAR")
        }
        const tokenAccountId = nearToken.split(":")[1]!
        console.log(`  NEAR token: ${tokenAccountId}`)

        // Build finalization transaction with EVM proof
        const finalizeTx = nearBuilder.buildFinalization({
          sourceChain: ChainKind.Eth,
          signerId,
          evmProof: {
            proof_kind: ProofKind.InitTransfer,
            proof: {
              log_index: proof.log_index,
              log_entry_data: proof.log_entry_data,
              receipt_index: proof.receipt_index,
              receipt_data: proof.receipt_data,
              header_data: proof.header_data,
              proof: proof.proof,
            },
          },
          storageDepositActions: [
            {
              token_id: tokenAccountId,
              account_id: route.recipient,
              storage_deposit_amount: null,
            },
          ],
        })

        const finalizeResult = await toNearKitTransaction(near, finalizeTx).send()
        console.log(`  Finalization tx: ${finalizeResult.transaction.hash}`)

        // Check for success
        const hasSuccess = finalizeResult.receipts_outcome.some(
          (r) =>
            r.outcome.status &&
            typeof r.outcome.status === "object" &&
            "SuccessValue" in r.outcome.status,
        )
        expect(hasSuccess).toBe(true)

        console.log("\n Full ETH -> NEAR transfer completed!")
        console.log("  1. Initiated on ETH")
        console.log("  2. Parsed InitTransfer event")
        console.log("  3. Generated EVM proof")
        console.log("  4. Waited for light client")
        console.log("  5. Finalized on NEAR")
      } else {
        console.log("\nStep 6: Skipping light client wait (FULL_E2E_TEST not set)")
        console.log("  Set FULL_E2E_TEST=true to run complete flow with 30min wait")
        console.log("\n Partial test completed successfully!")
        console.log("  1. Initiated on ETH")
        console.log("  2. Parsed InitTransfer event")
        console.log("  3. Generated EVM proof")
        console.log("  Skipped: Light client wait + NEAR finalization")
      }

      console.log(`\n ${route.name} test completed!`)
    },
    TIMEOUTS.FULL_E2E_FLOW,
  )
})
