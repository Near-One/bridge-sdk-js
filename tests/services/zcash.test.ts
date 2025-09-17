import { describe, expect, it, vi } from "vitest"
import { ZcashService } from "../../src/services/zcash.js"
import type { UTXO } from "../../src/types/bitcoin.js"
import * as zcashUtils from "../../src/utils/zcash.js"

const service = new ZcashService("https://example.com", "api-key")

describe("ZcashService buildWithdrawalPlan", () => {
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

    const plan = service.buildWithdrawalPlan(
      utxos,
      40_000n,
      targetAddress,
      changeAddress,
    )

    expect(plan.inputs).toEqual([
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:0",
    ])
    expect(plan.outputs).toHaveLength(2)
    expect(plan.fee).toBeGreaterThan(0n)
    expect(plan.outputs[0].script_pubkey).toBe(`script:${targetAddress}`)
    expect(plan.outputs[1].script_pubkey).toBe(`script:${changeAddress}`)

    scriptSpy.mockRestore()
  })

  it("throws when change address is missing", () => {
    const utxos: UTXO[] = [
      {
        path: "m/44'/133'/0'/0/0",
        tx_bytes: new Uint8Array([1, 2, 3]),
        vout: 0,
        balance: "60000",
        txid: "b".repeat(64),
      },
    ]

    expect(() =>
      service.buildWithdrawalPlan(utxos, 20_000n, "tmSiwS1U9MGa9kSDS8Ei5iqe9Tzw9uQWGW3", ""),
    ).toThrow("Zcash: Bridge configuration is missing change address")
  })
})
