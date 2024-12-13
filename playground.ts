import { type KeyPair, connect, keyStores } from "near-api-js"
import { Gas, NEAR, type SandboxWorker, Worker } from "near-workspaces"
import { serializeDeployTokenArgs } from "./src/borsh"
import { Chain, type FinDeployTokenArgs } from "./src/types"

async function main() {
  const worker = (await Worker.init({ rootAccountId: "test.near" })) as SandboxWorker
  const root = worker.rootAccount

  // Create test accounts
  const alice = await root.createSubAccount("alice")
  const factory = await root.createSubAccount("factory")

  // Set up existing contracts
  const deployer = await root.devDeploy("tests/mocks/deployer.wasm", {
    initialBalance: NEAR.parse("300 N").toJSON(),
  })
  const signer = await root.devDeploy("tests/mocks/signer.wasm")
  const prover = await root.devDeploy("tests/mocks/prover.wasm")
  const wNEAR = await root.importContract({
    testnetContract: "wrap.testnet",
  })

  // Import and setup the omni-locker contract from testnet
  const locker = await root.importContract({
    testnetContract: "omni-locker.testnet",
  })
  await root.call(deployer, "new", {
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
      gas: Gas.parse("300 Tgas").toBigInt(),
    },
  )
  await root.call(locker, "add_factory", {
    address: `near:${factory.accountId}`,
  })
  await root.call(locker, "add_token_deployer", {
    chain: "Near", //NEAR chain
    account_id: deployer.accountId,
  })
  console.log("Setup finished")
  console.log("Creating NEAR Connection/keys")
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
  const account = await near.account(alice.accountId)

  console.log("Checking storage deposit for token")
  const response = await account.viewFunction({
    contractId: locker.accountId,
    methodName: "required_balance_for_deploy_token",
  })
  console.log(response)

  console.log("Calling deploy_token")
  const args: FinDeployTokenArgs = {
    chain_kind: Chain.Near,
    prover_args: {
      token_address: "near:ft",
      name: "Mock Fungible Token",
      symbol: "MOCK",
      decimals: 8,
      emitter_address: `near:${factory.accountId}`,
    },
  }

  const serializedArgs = serializeDeployTokenArgs(args)
  const returnSameInput = (args: Uint8Array) => Buffer.from(args)

  try {
    const response = await account.functionCall({
      contractId: locker.accountId,
      methodName: "deploy_token",
      args: serializedArgs,
      gas: Gas.parse("300 Tgas").toBigInt(),
      attachedDeposit: NEAR.parse("5 N").toBigInt(),
      stringify: returnSameInput,
    })
    const receipts = await account.connection.provider.txStatusReceipts(
      response.transaction_outcome.id,
      account.accountId,
      "FINAL",
    )
    //console.log(JSON.stringify(receipts, null, 2))

    // Check if address was created successfully. It should be `near-ft.${deployer.AccountId}`
    // Check if this address exists
    const result = await account.connection.provider.query({
      request_type: "view_account",
      finality: "final",
      account_id: `near-ft1.${deployer.accountId}`,
    })
    console.log("Here: ", result)
  } catch (error: any) {
    console.log(error.transaction_outcome.id) // @ts-ignore
    const receipts = await account.connection.provider.txStatusReceipts(
      error.transaction_outcome.id,
      account.accountId,
      "FINAL",
    )
    console.log(JSON.stringify(receipts, null, 2))
    //console.log(formatError("ServerTransactionError", error))
  }

  await worker.tearDown()
}

main()
