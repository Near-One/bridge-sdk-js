import { type NearAccount, Worker } from "near-workspaces"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { NearDeployer } from "../../src/chains/near"
import { Chain, type OmniAddress } from "../../src/types"

describe("NearDeployer Integration Tests", () => {
  let worker: Worker
  let root: NearAccount
  let wallet: NearAccount
  let locker: NearAccount
  let token: NearAccount
  let deployer: NearDeployer

  beforeAll(async () => {
    // Initialize the sandbox environment
    worker = await Worker.init()
    root = worker.rootAccount

    // Create test accounts
    wallet = await root.createSubAccount("wallet")
    token = await root.createSubAccount("token")

    // Import the real omni-locker contract from testnet
    locker = await root.importContract({
      testnetContract: "omni-locker.testnet",
      withData: true,
    })

    // Initialize NearDeployer with test accounts
    //deployer = new NearDeployer(wallet, 'testnet', locker.accountId)
  })

  afterAll(async () => {
    await worker.tearDown()
  })

  test.only("initDeployToken should successfully log metadata", async () => {
    const result = await wallet.call(
      locker.accountId,
      "log_metadata",
      { token_id: token.accountId },
      { gas: 300000000000000, attachedDeposit: 1000000000000000000000 },
    )
    console.log(result)
  })

  test("finDeployToken should finalize deployment with proof", async () => {
    const tokenAddress = `near:${token.accountId}`
    const mockDeployment = {
      id: "mock-tx-hash",
      tokenAddress,
      sourceChain: Chain.Near,
      destinationChain: Chain.Ethereum,
      status: "ready_for_finalize" as const,
      proof: {
        header: "mock-header",
        proof: "mock-proof",
        height: "123",
      },
    }

    const finalizedDeployment = await deployer.finDeployToken(mockDeployment)

    expect(finalizedDeployment).toBeDefined()
    expect(finalizedDeployment.status).toBe("finalized")
    expect(finalizedDeployment.deploymentTx).toBeDefined()
  })

  test("bindToken should complete token binding with proof", async () => {
    const tokenAddress: OmniAddress = `near:${token.accountId}`
    const mockDeployment = {
      id: "mock-tx-hash",
      tokenAddress,
      sourceChain: Chain.Near,
      destinationChain: Chain.Ethereum,
      status: "ready_for_bind" as const,
      proof: {
        header: "mock-header",
        proof: "mock-proof",
        height: "123",
      },
    }

    const boundDeployment = await deployer.bindToken(mockDeployment)

    expect(boundDeployment).toBeDefined()
    expect(boundDeployment.status).toBe("completed")
    expect(boundDeployment.bindTx).toBeDefined()
  })

  test("should throw error when initializing non-NEAR token", async () => {
    const invalidTokenAddress = "eth:0x123"
    await expect(deployer.initDeployToken(invalidTokenAddress, Chain.Ethereum)).rejects.toThrow(
      "Token address must be on NEAR chain",
    )
  })

  test("should throw error when finalizing with invalid status", async () => {
    const tokenAddress = `near:${token.accountId}`
    const invalidDeployment = {
      id: "mock-tx-hash",
      tokenAddress,
      sourceChain: Chain.Near,
      destinationChain: Chain.Ethereum,
      status: "pending" as const,
    }

    await expect(deployer.finDeployToken(invalidDeployment)).rejects.toThrow(
      "Invalid deployment status: pending",
    )
  })

  test("should throw error when binding with invalid status", async () => {
    const tokenAddress = `near:${token.accountId}`
    const invalidDeployment = {
      id: "mock-tx-hash",
      tokenAddress,
      sourceChain: Chain.Near,
      destinationChain: Chain.Ethereum,
      status: "pending" as const,
    }

    await expect(deployer.bindToken(invalidDeployment)).rejects.toThrow(
      "Invalid deployment status: pending",
    )
  })
})
