import { type KeyPair, connect, keyStores } from "near-api-js"
import { Gas, NEAR, type SandboxWorker, Worker } from "near-workspaces"

async function main() {
  const worker = (await Worker.init()) as SandboxWorker
  const root = worker.rootAccount

  // Create test accounts
  const alice = await root.createSubAccount("alice")

  // Create a mock MPC signer
  const signer = await root.devDeploy("tests/mocks/signer.wasm")

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

  // Import the real omni-locker contract from testnet
  const locker = await root.importContract({
    testnetContract: "omni-locker.testnet",
  })
  await root.call(
    locker,
    "new",
    {
      prover_account: "omni-prover.testnet",
      mpc_signer: signer.accountId,
      nonce: 0,
      wnear_account_id: "wnear.testnet",
    },
    {
      gas: Gas.parse("300 Tgas").toBigInt(),
    },
  )

  // Setup Fungible Token wNEAR
  console.log("Importing wNEAR")
  const _wNEAR = await root.importContract({
    testnetContract: "wrap.testnet",
  })

  console.log("log_metadata initiated")
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
  const response = await account.functionCall({
    contractId: locker.accountId,
    methodName: "log_metadata",
    args: { token_id: ft.accountId },
    gas: Gas.parse("300 Tgas").toBigInt(),
    attachedDeposit: NEAR.parse("1 N").toBigInt(),
  })
  //console.log(response)
  console.log(response.transaction_outcome.outcome.logs)
  // Print logs from all receipt outcomes
  console.log("Receipt logs:")
  response.receipts_outcome.forEach((receipt, index) => {
    if (receipt.outcome.logs.length > 0) {
      console.log(`Receipt ${index} logs:`, receipt.outcome.logs)
    }
  })

  const result = await near.connection.provider.txStatusReceipts(
    response.transaction.hash,
    account.accountId,
    "FINAL",
  )
  result.receipts_outcome.forEach((receipt, index) => {
    if (receipt.outcome.logs.length > 0) {
      console.log(`Receipt ${index} logs:`, receipt.outcome.logs)
    }
  })

  await worker.tearDown()
}

main()
