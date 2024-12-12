import { type KeyPair, connect, keyStores } from "near-api-js"
import { Gas, NEAR, type SandboxWorker, Worker } from "near-workspaces"
import { serializeDeployTokenArgs } from "./src/borsh"
import { Chain, type FinDeployTokenArgs } from "./src/types"

async function main() {
  const worker = (await Worker.init()) as SandboxWorker
  const root = worker.rootAccount
  // Create test accounts
  const alice = await root.createSubAccount("alice")
  // Create a mock MPC signer
  const signer = await root.devDeploy("tests/mocks/signer.wasm")
  // Create a mock Prover
  const prover = await root.devDeploy("tests/mocks/prover.wasm")
  // Create a mock Fungible Token
  const ft = await root.devDeploy("tests/mocks/ft.wasm", {
    initialBalance: NEAR.parse("3 N").toJSON(),
  })
  await root.call(ft, "new_default_meta", {
    total_supply: NEAR.parse("1,000,000,000 N").toString(),
    owner_id: root,
    metadata: JSON.stringify({
      spec: "ft-1.0.0",
      name: "Mock Fungible Token",
      symbol: "MOCK",
      decimals: 8,
    }),
  })
  // Setup Fungible Token wNEAR
  console.log("Importing wNEAR")
  const wNEAR = await root.importContract({
    testnetContract: "wrap.testnet",
  })
  // Import the real omni-locker contract from testnet
  const locker = await root.importContract({
    testnetContract: "omni-locker.testnet",
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
  console.log("Calling log_metadata")
  await account.functionCall({
    contractId: locker.accountId,
    methodName: "log_metadata",
    args: { token_id: ft.accountId },
    gas: Gas.parse("300 Tgas").toBigInt(),
    attachedDeposit: NEAR.parse("1 N").toBigInt(),
  })
  console.log("Calling deploy_token")
  const args: FinDeployTokenArgs = {
    chain_kind: Chain.Near,
    prover_args: {
      token_address: `near:${ft.accountId}`,
      name: "Mock Fungible Token",
      symbol: "MOCK",
      decimals: 8,
      emitter_address: `near:${ft.accountId}`,
    },
  }

  const serializedArgs = serializeDeployTokenArgs(args)
  const response = await account.functionCall({
    contractId: locker.accountId,
    methodName: "deploy_token",
    args: serializedArgs,
    gas: Gas.parse("300 Tgas").toBigInt(),
    attachedDeposit: NEAR.parse("1 N").toBigInt(),
  })

  console.log(response.receipts)
  await worker.tearDown()
}

main()
