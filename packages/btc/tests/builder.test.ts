import { describe, expect, it } from "vitest"
import { createBtcBuilder, linearFeeCalculator } from "../src/builder.js"
import type { NormalizedUTXO } from "../src/types.js"

const feeCalculator = linearFeeCalculator({ base: 10, input: 68, output: 31, rate: 1 })

const makeUtxo = (id: string, amount: bigint, vout = 0): NormalizedUTXO => ({
  txid: id,
  vout,
  amount,
})

describe("linearFeeCalculator", () => {
  it("calculates correct fees for single input/output", () => {
    const fee = feeCalculator(1, 1)
    // base(10) + 1*input(68) + 1*output(31) = 109
    expect(fee).toBe(109n)
  })

  it("calculates correct fees for multiple inputs/outputs", () => {
    const fee = feeCalculator(2, 2)
    // base(10) + 2*input(68) + 2*output(31) = 10 + 136 + 62 = 208
    expect(fee).toBe(208n)
  })

  it("handles rate multiplier", () => {
    const ratedCalculator = linearFeeCalculator({ base: 10, input: 68, output: 31, rate: 2 })
    const fee = ratedCalculator(1, 1)
    // (base(10) + 1*input(68) + 1*output(31)) * rate(2) = 218
    expect(fee).toBe(218n)
  })
})

describe("BtcBuilder", () => {
  const builder = createBtcBuilder({ network: "testnet", chain: "btc" })

  describe("selectUtxos", () => {
    it("selects inputs and returns change when available", () => {
      const utxos = [makeUtxo("a".repeat(64), 70000n)]

      const result = builder.selectUtxos(utxos, 60000n, {
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
        builder.selectUtxos(utxos, 50000n, {
          feeCalculator,
          dustThreshold: 546n,
          minChange: 1000n,
        }),
      ).toThrow("Insufficient funds for requested amount and fees")
    })

    it("enforces the maximum input count", () => {
      const utxos = [makeUtxo("c".repeat(64), 30000n, 0), makeUtxo("d".repeat(64), 30000n, 1)]

      expect(() =>
        builder.selectUtxos(utxos, 50000n, {
          feeCalculator,
          dustThreshold: 546n,
          minChange: 1000n,
          maxInputs: 1,
        }),
      ).toThrow("Exceeded maximum input count of 1")
    })

    it("absorbs dust change into fee", () => {
      const utxos = [makeUtxo("e".repeat(64), 61000n)]

      const result = builder.selectUtxos(utxos, 60000n, {
        feeCalculator,
        dustThreshold: 1000n,
        minChange: 1000n,
      })

      // With amount=60000 and fee~140, remaining 860 is below minChange, so no change output
      expect(result.outputs).toBe(1)
      expect(result.change).toBe(0n)
    })
  })

  describe("buildWithdrawalPlan", () => {
    it("should create withdrawal plan with change output", () => {
      const utxos = [
        {
          txid: "a".repeat(64),
          vout: 0,
          balance: "100000",
          path: "m/44'/0'/0'/0/0",
          tx_bytes: new Uint8Array([0x02, 0x00, 0x00, 0x00]),
        },
      ]

      const plan = builder.buildWithdrawalPlan(
        utxos,
        50000n,
        "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
        "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
        2,
      )

      expect(plan.inputs.length).toBeGreaterThan(0)
      expect(plan.outputs.length).toBeGreaterThan(0)
      expect(plan.fee).toBeGreaterThan(0n)
    })

    it("throws when no UTXOs provided", () => {
      expect(() =>
        builder.buildWithdrawalPlan(
          [],
          50000n,
          "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
          "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
          2,
        ),
      ).toThrow("Bitcoin: No UTXOs available for transaction")
    })
  })

  describe("addressToScriptPubkey", () => {
    it("should convert P2WPKH address to script_pubkey", () => {
      const address = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"
      const script = builder.addressToScriptPubkey(address)

      expect(typeof script).toBe("string")
      expect(script.length).toBeGreaterThan(0)
    })

    it("should throw error for invalid address", () => {
      expect(() => builder.addressToScriptPubkey("invalid_address")).toThrow()
    })
  })
})
