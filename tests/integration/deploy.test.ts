import { type Account, type KeyPair, connect, keyStores } from "near-api-js"
import { Gas, NEAR, type NearAccount, Worker } from "near-workspaces"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { NearDeployer } from "../../src/chains/near"
import { Chain, type OmniAddress, type TokenDeployment } from "../../src/types"

describe("NearDeployer Integration Tests", () => {
  let worker: Worker
  let root: NearAccount
  let wallet: Account
  let locker: NearAccount
  let token: NearAccount
  let deployer: NearDeployer
  let factory: NearAccount
  let tokenDeployer: NearAccount

  beforeAll(async () => {
    // Initialize the sandbox environment
    worker = await Worker.init()
    root = worker.rootAccount

    // Create test accounts
    const alice = await root.createSubAccount("alice")
    factory = await root.createSubAccount("factory")

    // Set up existing contracts
    tokenDeployer = await root.devDeploy("tests/mocks/deployer.wasm", {
      initialBalance: NEAR.parse("300 N").toJSON(),
    })
    const signer = await root.devDeploy("tests/mocks/signer.wasm")
    const prover = await root.devDeploy("tests/mocks/prover.wasm")
    const wNEAR = await root.importContract({
      testnetContract: "wrap.testnet",
    })

    // Create a mock Fungible Token to test log_metadata
    // We'll deploy something different when testing `deployToken`
    token = await root.devDeploy("tests/mocks/ft.wasm", {
      initialBalance: NEAR.parse("300 N").toJSON(),
    })
    await root.call(token, "new_default_meta", {
      total_supply: NEAR.parse("1,000,000,000 N").toString(),
      owner_id: root,
      metadata: JSON.stringify({
        spec: "ft-1.0.0",
        name: "Mock Fungible Token",
        symbol: "MOCK",
        decimals: 8,
      }),
    })

    // Import and setup the omni-locker contract from testnet
    locker = await root.importContract({
      testnetContract: "omni-locker.testnet",
    })
    await root.call(tokenDeployer, "new", {
      controller: locker.accountId,
      dao: "dao.near",
    })
    await root.call(
      locker,
      "new",
      {
        prover_account: prover.accountId,
        mpc_signer: signer.accountId,
        nonce: 0,
        wnear_account_id: wNEAR.accountId,
      },
      {
        gas: Gas.parse("300 Tgas").toBigInt().toString(),
      },
    )
    await root.call(locker, "add_factory", {
      address: `near:${factory.accountId}`,
    })
    await root.call(locker, "add_token_deployer", {
      chain: "Near", //NEAR chain
      account_id: tokenDeployer.accountId,
    })

    // Convert the `alice` account to a NEAR wallet
    const keys = await alice.getKey()
    const keyStore = new keyStores.InMemoryKeyStore()
    await keyStore.setKey("local", alice.accountId, keys as KeyPair)
    const config = {
      networkId: "local",
      nodeUrl: worker.provider.connection.url,
      keyStore: keyStore,
      headers: {},
    }
    const near = await connect(config)
    wallet = await near.account(alice.accountId)

    // Initialize NearDeployer with our test wallet
    deployer = new NearDeployer(wallet, "testnet", locker.accountId)
  })

  afterAll(async () => {
    await worker.tearDown()
  })

  test("initDeployToken should successfully log metadata", async () => {
    const tokenAddress: OmniAddress = `near:${token.accountId}`
    const deployment = await deployer.initDeployToken(tokenAddress, Chain.Near)

    expect(deployment).toBeDefined()
    expect(deployment.status).toBe("pending")

    // Check the transaction logs to see if an event was emitted
    const result = await wallet.connection.provider.txStatusReceipts(
      deployment.id,
      wallet.accountId,
      "FINAL",
    )

    let foundLogMetadataEvent = false
    for (const receipt of result.receipts_outcome) {
      for (const log of receipt.outcome.logs) {
        if (log.includes("LogMetadataEvent")) {
          foundLogMetadataEvent = true
        }
      }
    }

    expect(foundLogMetadataEvent).toBe(true)
  })

  test.only("finDeployToken should finalize deployment with proof", async () => {
    const tokenAddress: OmniAddress = "near:fungible-token"
    const mockDeployment: TokenDeployment = {
      id: "mock-tx-hash",
      tokenAddress,
      sourceChain: Chain.Near,
      destinationChain: Chain.Ethereum,
      status: "ready_for_finalize" as const,
      proof: {
        proof_kind: "DeployToken",
        vaa: "mock-vaa",
      },
      logMetadata: {
        name: "Mock Fungible Token",
        symbol: "MOCK",
        decimals: 8,
        emitter_address: `near:${factory.accountId}`,
        token_address: tokenAddress,
      },
    }

    const finalizedDeployment = await deployer.finDeployToken(mockDeployment)

    // Wait for the transaction to be finalized
    if (!finalizedDeployment.deploymentTx) {
      throw new Error("Deployment transaction not found")
    }
    await wallet.connection.provider.txStatus(
      finalizedDeployment.deploymentTx,
      wallet.accountId,
      "FINAL",
    )

    // Check that the token was deployed
    expect(async () => {
      await wallet.connection.provider.query({
        request_type: "view_account",
        finality: "final",
        account_id: `${tokenAddress.replace(":", "-")}.${tokenDeployer.accountId}`,
      })
    }).not.toThrow()

    expect(finalizedDeployment).toBeDefined()
    expect(finalizedDeployment.status).toBe("finalized")
    expect(finalizedDeployment.deploymentTx).toBeDefined()
  })

  test("bindToken should complete token binding with proof", async () => {
    const tokenAddress: OmniAddress = `near:${token.accountId}`
    const mockDeployment: TokenDeployment = {
      id: "mock-tx-hash",
      tokenAddress,
      sourceChain: Chain.Near,
      destinationChain: Chain.Ethereum,
      status: "ready_for_bind" as const,
      proof: {
        proof_kind: "DeployToken",
        vaa: "mock-vaa",
      },
      logMetadata: {
        name: "Mock Fungible Token",
        symbol: "MOCK",
        decimals: 8,
        emitter_address: tokenAddress,
        token_address: tokenAddress,
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
    const tokenAddress: OmniAddress = `near:${token.accountId}`
    const invalidDeployment: TokenDeployment = {
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
    const tokenAddress: OmniAddress = `near:${token.accountId}`
    const invalidDeployment: TokenDeployment = {
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
