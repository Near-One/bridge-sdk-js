import { type KeyPair, connect, keyStores } from "near-api-js"
import { Gas, NEAR, type SandboxWorker, Worker } from "near-workspaces"

async function main() {
  const worker = (await Worker.init()) as SandboxWorker
  const root = worker.rootAccount

  // Create test accounts
  const wallet = await root.createSubAccount("wallet")
  //const token = await root.createSubAccount("token")

  // Import the real omni-locker contract from testnet
  const locker = await root.importContract({
    testnetContract: "omni-locker.testnet",
    withData: true,
  })

  // Log the existing contract state
  locker.patchStateRecords
  const state = await locker.viewState()
  const data: Buffer = state.getRaw("STATE")
  const hex = data.toString("hex")
  console.log("STATE:", hex)
  return

  // Create a `v1.signer-prod.testnet` account
  const signer = await root.devDeploy("build/contract.wasm")

  // Setup Fungible Token wNEAR
  console.log("Importing wNEAR")
  const wNEAR = await root.importContract({
    testnetContract: "wrap.testnet",
  })

  console.log("Creating wNEAR")
  await root.call(wNEAR, "new", {
    owner_id: root,
    total_supply: NEAR.parse("1,000,000,000 N").toString(),
  })

  console.log("Storage Depositing wNEAR")
  await root.call(
    wNEAR,
    "storage_deposit",
    {},
    {
      attachedDeposit: NEAR.parse("0.008 N"),
    },
  )

  console.log("Near Depositing wNEAR")
  await root.call(
    wNEAR,
    "near_deposit",
    {},
    {
      attachedDeposit: NEAR.parse("200 N"),
    },
  )

  console.log("log_metadata initiated")
  const keys = await wallet.getKey()
  const keyStore = new keyStores.InMemoryKeyStore()
  await keyStore.setKey("local", wallet.accountId, keys as KeyPair)

  const config = {
    networkId: "local",
    nodeUrl: worker.provider.connection.url,
    keyStore: keyStore,
    headers: {},
  }
  const near = await connect(config)
  const account = await near.account(wallet.accountId)
  const result = await account.functionCall({
    contractId: locker.accountId,
    methodName: "log_metadata",
    args: { token_id: "wrap.testnet" },
    gas: Gas.parse("300 Tgas").toBigInt(),
    attachedDeposit: NEAR.parse("1 N").toBigInt(),
  })
  console.log(result)

  //   const result = await wallet.callRaw(
  //     locker.accountId,
  //     "log_metadata",
  //     { token_id: "wrap.testnet" },
  //     { attachedDeposit: "1 yN", gas: "300 Tgas" },
  //   )
  //   console.log("result here...")
  //   console.log(result.result.receipts_outcome)
  await worker.tearDown()
}

main()
