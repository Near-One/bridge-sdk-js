import { describe, expect, it, vi } from "vitest"
import { createBtcBuilder } from "../src/builder.js"
import type { UTXO } from "../src/types.js"
import * as zcashUtils from "../src/zcash.js"

describe("ZcashBuilder", () => {
  const builder = createBtcBuilder({ network: "testnet", chain: "zcash" })

  describe("buildWithdrawalPlan", () => {
    it("creates plan with change output when needed", () => {
      const scriptSpy = vi.spyOn(zcashUtils, "getZcashScript").mockImplementation((address) => {
        return `script:${address}`
      })

      const utxos: UTXO[] = [
        {
          path: "m/44'/133'/0'/0/0",
          tx_bytes: new Uint8Array([1, 2, 3]),
          vout: 0,
          balance: "60000",
          txid: "a".repeat(64),
        },
      ]

      const targetAddress = "tmSiwS1U9MGa9kSDS8Ei5iqe9Tzw9uQWGW3"
      const changeAddress = "tmJoaTx3Ljpsp8dkUBaRd7egrX6UoSB9Lob"

      const plan = builder.buildWithdrawalPlan(utxos, 40_000n, targetAddress, changeAddress)

      expect(plan.inputs).toEqual([
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:0",
      ])
      expect(plan.outputs).toHaveLength(2)
      expect(plan.fee).toBeGreaterThan(0n)
      expect(plan.outputs[0]?.script_pubkey).toBe(`script:${targetAddress}`)
      expect(plan.outputs[1]?.script_pubkey).toBe(`script:${changeAddress}`)

      scriptSpy.mockRestore()
    })

    it("throws when no UTXOs provided", () => {
      expect(() =>
        builder.buildWithdrawalPlan(
          [],
          20_000n,
          "tmSiwS1U9MGa9kSDS8Ei5iqe9Tzw9uQWGW3",
          "tmJoaTx3Ljpsp8dkUBaRd7egrX6UoSB9Lob",
        ),
      ).toThrow("Zcash: No UTXOs available for transaction")
    })
  })
})

describe("Zcash utilities", () => {
  describe("getZcashScript", () => {
    it("throws on invalid address", () => {
      expect(() => zcashUtils.getZcashScript("invalid_address")).toThrow()
    })
  })

  describe("calculateZcashFee", () => {
    it("calculates minimum fee for small transactions", () => {
      // With 1 input and 1 output, logical actions = 1
      // Fee = 5000 * max(2, 1) = 10000
      const fee = zcashUtils.calculateZcashFee(1, 1)
      expect(fee).toBe(10000n)
    })

    it("calculates fee for larger transactions", () => {
      // With 3 inputs and 2 outputs, logical actions = 3
      // Fee = 5000 * max(2, 3) = 15000
      const fee = zcashUtils.calculateZcashFee(3, 2)
      expect(fee).toBe(15000n)
    })

    it("uses grace actions for small transactions", () => {
      // With 1 input and 1 output, should use grace actions (2)
      const fee = zcashUtils.calculateZcashFee(1, 1)
      expect(fee).toBe(10000n) // 5000 * 2
    })
  })

  describe("zcashFeeCalculator", () => {
    it("creates a callable fee calculator", () => {
      const calc = zcashUtils.zcashFeeCalculator()
      expect(typeof calc).toBe("function")
      expect(calc(1, 1)).toBe(10000n)
    })
  })

  describe("ZCASH_DUST_THRESHOLD", () => {
    it("is defined as 5000", () => {
      expect(zcashUtils.ZCASH_DUST_THRESHOLD).toBe(5000n)
    })
  })
})
