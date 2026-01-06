import { describe, expect, it } from "vitest"
import { linearFeeCalculator, type NormalizedUTXO, selectUtxos } from "../../src/utxo/index.js"

const feeCalculator = linearFeeCalculator({ base: 10, input: 68, output: 31, rate: 1 })

const makeUtxo = (id: string, amount: bigint, vout = 0): NormalizedUTXO => ({
  txid: id,
  vout,
  amount,
})

describe("selectUtxos", () => {
  it("selects inputs and returns change when available", () => {
    const utxos = [makeUtxo("a".repeat(64), 70000n)]

    const result = selectUtxos(utxos, 60000n, {
      feeCalculator,
      dustThreshold: 546n,
      minChange: 1000n,
    })

    expect(result.inputs).toHaveLength(1)
    expect(result.totalInput).toBe(70000n)
    expect(result.change).toBeGreaterThan(0n)
    expect(result.outputs).toBe(2)
    expect(result.fee).toBe(140n)
  })

  it("throws when funds are insufficient", () => {
    const utxos = [makeUtxo("b".repeat(64), 20000n)]

    expect(() =>
      selectUtxos(utxos, 50000n, {
        feeCalculator,
        dustThreshold: 546n,
        minChange: 1000n,
      }),
    ).toThrow("Insufficient funds for requested amount and fees")
  })

  it("enforces the maximum input count", () => {
    const utxos = [makeUtxo("c".repeat(64), 30000n, 0), makeUtxo("d".repeat(64), 30000n, 1)]

    expect(() =>
      selectUtxos(utxos, 50000n, {
        feeCalculator,
        dustThreshold: 546n,
        minChange: 1000n,
        maxInputs: 1,
      }),
    ).toThrow("Exceeded maximum input count of 1")
  })
})
