import { base64 } from "@scure/base"
import { describe, expect, it } from "vitest"
import { createNearBuilder } from "../src/builder.js"
import depositTx from "./fixtures/verify-deposit-v2.onchain.json"
import withdrawTx from "./fixtures/verify-withdraw-v2.onchain.json"

/**
 * Golden-master tests: feed the proof data from real, successful on-chain v2
 * transactions into the builder and assert it reproduces the exact args the
 * contract accepted. Unlike the unit tests (which encode our own assumptions
 * about the wire format), these pin the builder to ground truth and guard
 * against silent serialization drift — the failure mode that broke the v1
 * methods. The fixtures are static (no network); regenerate them from `source`
 * if the contract interface changes.
 */
describe("buildUtxoDepositFinalization — on-chain golden master", () => {
  const builder = createNearBuilder({ network: "mainnet" })

  it("reproduces the live verify_deposit_v2 transaction", () => {
    const onchain = depositTx.args

    // Reconstruct the inputs exactly as a relayer would from getDepositProof +
    // the original deposit message.
    const tx = builder.buildUtxoDepositFinalization({
      chain: "btc",
      depositMsg: {
        recipient_id: onchain.deposit_msg.recipient_id,
        safe_deposit: onchain.deposit_msg.safe_deposit,
        refund_address: onchain.deposit_msg.refund_address,
      },
      txBytes: Array.from(base64.decode(onchain.tx_bytes)),
      vout: onchain.vout,
      txBlockBlockhash: onchain.proof.tx_block_blockhash,
      txIndex: onchain.proof.tx_index,
      merkleProof: onchain.proof.merkle_proof,
      coinbaseTxId: onchain.proof.coinbase_tx_id,
      coinbaseMerkleProof: onchain.proof.coinbase_merkle_proof,
      signerId: depositTx.signerId,
    })

    const action = tx.actions[0]
    expect(tx.receiverId).toBe(depositTx.receiverId)
    expect(action?.methodName).toBe(depositTx.method)
    expect(action?.deposit).toBe(BigInt(depositTx.depositYocto))
    expect(action?.gas).toBe(BigInt(depositTx.gas))

    // The decisive check: the encoded args deep-equal the on-chain args (key
    // order is irrelevant to the contract, so compare parsed objects). This
    // covers the base64 tx_bytes round-trip, the nested proof object with both
    // coinbase fields, and the deposit_msg passthrough.
    const produced = JSON.parse(new TextDecoder().decode(action?.args))
    expect(produced).toEqual(onchain)
  })
})

describe("buildUtxoWithdrawalVerify — on-chain golden master", () => {
  const builder = createNearBuilder({ network: "mainnet" })

  it("reproduces the live verify_withdraw_v2 transaction", () => {
    const onchain = withdrawTx.args

    // Reconstruct the inputs exactly as a relayer would from getWithdrawProof.
    const tx = builder.buildUtxoWithdrawalVerify({
      chain: "btc",
      txId: onchain.tx_id,
      txBlockBlockhash: onchain.proof.tx_block_blockhash,
      txIndex: onchain.proof.tx_index,
      merkleProof: onchain.proof.merkle_proof,
      coinbaseTxId: onchain.proof.coinbase_tx_id,
      coinbaseMerkleProof: onchain.proof.coinbase_merkle_proof,
      signerId: withdrawTx.signerId,
    })

    const action = tx.actions[0]
    expect(tx.receiverId).toBe(withdrawTx.receiverId)
    expect(action?.methodName).toBe(withdrawTx.method)
    // verify_withdraw_v2 is not payable
    expect(action?.deposit).toBe(BigInt(withdrawTx.depositYocto))
    expect(action?.gas).toBe(BigInt(withdrawTx.gas))

    // The encoded args deep-equal the on-chain args (key order is irrelevant to
    // the contract). Covers the nested proof object with both coinbase fields.
    const produced = JSON.parse(new TextDecoder().decode(action?.args))
    expect(produced).toEqual(onchain)
  })
})
