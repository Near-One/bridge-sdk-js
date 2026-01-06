import { beforeAll, describe, expect, test } from "bun:test"
import { ChainKind, createBridge, getAddresses } from "@omni-bridge/core"
import { createEvmBuilder, type TransferPayload } from "@omni-bridge/evm"
import {
  createNearBuilder,
  type InitTransferEvent,
  MPCSignature,
  type SignTransferEvent,
  toNearKitTransaction,
} from "@omni-bridge/near"
import type { ethers } from "ethers"
import type { Near } from "near-kit"
import { NEAR_TO_ETH_ROUTES, TIMEOUTS } from "./shared/fixtures.js"
import { createEthereumWallet, createNearKitInstance, TEST_CONFIG } from "./shared/setup.js"

describe("NEAR to ETH E2E Transfer Tests (Manual Flow)", () => {
  let near: Near
  let ethWallet: ethers.Wallet

  beforeAll(async () => {
    // Setup NEAR
    near = await createNearKitInstance()

    // Setup Ethereum
    ethWallet = await createEthereumWallet()

    console.log("🚀 Test setup complete:")
    console.log(`  NEAR Account: ${TEST_CONFIG.networks.near.accountId}`)
    console.log(`  ETH Address: ${ethWallet.address}`)
  })

  test.each(NEAR_TO_ETH_ROUTES)(
    "should complete manual NEAR to ETH transfer: $name",
    async (route) => {
      console.log(`\n🌉 Testing ${route.name} (Manual Flow)...`)

      // Create builders
      const bridge = createBridge({ network: "testnet" })
      const nearBuilder = createNearBuilder({ network: "testnet" })
      const evmBuilder = createEvmBuilder({ network: "testnet" })

      // Get addresses
      const addresses = getAddresses("testnet")
      const signerId = TEST_CONFIG.networks.near.accountId
      const ethRecipient = ethWallet.address

      console.log("📤 Step 1: Initiating NEAR → ETH transfer...")
      console.log(`  Token: ${route.token.symbol} (${route.token.address})`)
      console.log(`  Amount: ${route.token.testAmount}`)
      console.log(`  From: ${route.sender}`)
      console.log(`  To: eth:${ethRecipient}`)
      console.log("  Fee: 0 (manual flow)")

      // Validate transfer
      const validated = await bridge.validateTransfer({
        token: route.token.address,
        amount: BigInt(route.token.testAmount),
        fee: 0n,
        nativeFee: 0n,
        sender: `near:${signerId}`,
        recipient: `eth:${ethRecipient}`,
        message: "E2E manual test transfer",
      })

      // Build and send init transfer
      const initTx = nearBuilder.buildTransfer(validated, signerId)
      const initResult = await toNearKitTransaction(near, initTx).send()

      // Parse InitTransferEvent from logs
      const initEventLog = initResult.receipts_outcome
        .flatMap((receipt) => receipt.outcome.logs)
        .find((log) => log.includes("InitTransferEvent"))

      if (!initEventLog) {
        throw new Error("InitTransferEvent not found in transaction logs")
      }

      const initEvent: InitTransferEvent = JSON.parse(initEventLog).InitTransferEvent

      console.log("✓ Transfer initiated on NEAR!")
      console.log(`  Origin Nonce: ${initEvent.transfer_message.origin_nonce}`)

      // Validate initiation
      expect(initEvent).toHaveProperty("transfer_message")
      expect(initEvent.transfer_message).toHaveProperty("origin_nonce")
      expect(initEvent.transfer_message.origin_nonce).toBeGreaterThan(0)

      // Step 2: Sign the transfer on NEAR
      console.log("\n🖋️ Step 2: Signing transfer on NEAR...")

      const signTx = nearBuilder.buildSignTransfer(
        {
          origin_chain: ChainKind.Near,
          origin_nonce: BigInt(initEvent.transfer_message.origin_nonce),
        },
        route.sender, // fee recipient
        {
          fee: initEvent.transfer_message.fee.fee,
          native_fee: initEvent.transfer_message.fee.native_fee,
        },
        signerId,
      )

      const signResult = await toNearKitTransaction(near, signTx).send({ waitUntil: "FINAL" })

      // Parse SignTransferEvent from logs
      const signEventLog = signResult.receipts_outcome
        .flatMap((receipt) => receipt.outcome.logs)
        .find((log) => log.includes("SignTransferEvent"))

      if (!signEventLog) {
        throw new Error("SignTransferEvent not found in transaction logs")
      }

      const signEvent: SignTransferEvent = JSON.parse(signEventLog).SignTransferEvent

      console.log("✓ Transfer signed on NEAR!")
      console.log("  Signature:", signEvent.signature)

      // Validate signing
      expect(signEvent).toHaveProperty("signature")
      expect(signEvent).toHaveProperty("message_payload")

      // Step 3: Finalize transfer on Ethereum
      console.log("\n🏁 Step 3: Finalizing transfer on Ethereum...")

      // Convert MPC signature to EVM format (adds 27 to recovery_id)
      const mpcSignature = MPCSignature.fromRaw(signEvent.signature)
      const signatureBytes = mpcSignature.toBytes(true) // forEvm = true

      // Build the transfer payload for EVM
      // The token_address from NEAR is an OmniAddress like "eth:0x..."
      const tokenAddressRaw = signEvent.message_payload.token_address
      const tokenAddress = tokenAddressRaw.startsWith("eth:")
        ? tokenAddressRaw.slice(4)
        : tokenAddressRaw

      // The recipient is also an OmniAddress like "eth:0x..."
      const recipientRaw = signEvent.message_payload.recipient
      const recipient = recipientRaw.startsWith("eth:") ? recipientRaw.slice(4) : recipientRaw

      // Map chain kind string to number if needed
      let originChain = signEvent.message_payload.transfer_id.origin_chain
      if (typeof originChain === "string") {
        originChain = ChainKind[originChain as keyof typeof ChainKind]
      }

      const transferPayload: TransferPayload = {
        destinationNonce: BigInt(signEvent.message_payload.destination_nonce),
        originChain: Number(originChain),
        originNonce: BigInt(signEvent.message_payload.transfer_id.origin_nonce),
        tokenAddress: tokenAddress as `0x${string}`,
        amount: BigInt(signEvent.message_payload.amount),
        recipient: recipient as `0x${string}`,
        feeRecipient: signEvent.message_payload.fee_recipient ?? "",
      }

      const finalizeTx = evmBuilder.buildFinalization(
        transferPayload,
        signatureBytes,
        TEST_CONFIG.networks.ethereum.chainId,
      )

      // Override the 'to' address with the bridge contract
      finalizeTx.to = addresses.eth.bridge as `0x${string}`

      // Send the transaction
      const txResponse = await ethWallet.sendTransaction({
        to: finalizeTx.to,
        data: finalizeTx.data,
        value: finalizeTx.value,
        chainId: finalizeTx.chainId,
      })

      console.log("  TX Hash:", txResponse.hash)
      const receipt = await txResponse.wait()

      console.log("✓ Transfer finalized on Ethereum!")
      console.log("  Finalization TX:", receipt?.hash)

      // Validate finalization
      expect(receipt).toBeDefined()
      expect(receipt?.hash).toBeDefined()
      expect(receipt?.status).toBe(1)

      console.log("\n🎉 Manual transfer flow completed successfully!")
      console.log("  1. ✓ Initiated on NEAR")
      console.log("  2. ✓ Signed on NEAR")
      console.log("  3. ✓ Finalized on ETH")
      console.log(`✅ ${route.name} test completed!`)
    },
    TIMEOUTS.FULL_E2E_FLOW,
  )
})
