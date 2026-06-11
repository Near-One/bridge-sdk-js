import { afterEach, describe, expect, it, vi } from "vitest"
import {
  getEventLog,
  getInitTransferEvent,
  isTransferFinalised,
  parseInitTransferEvent,
} from "../src/events.js"

const BRIDGE = "0x05558831a603eca8cd69a42d4251f08de3573039b69f23972265cac76639f1cf"
const RPC = "https://fullnode.testnet.aptoslabs.com/v1"
const TX_HASH = "0x01cdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"

const initTransferData = {
  sender: "0xabc",
  token_address: "0xa",
  origin_nonce: "7",
  amount: "1000000",
  fee: "100",
  native_fee: "50",
  recipient: "near:alice.near",
  message: "0x",
}

function mockFetchJson(body: unknown, ok = true, status = 200) {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("parseInitTransferEvent", () => {
  it("parses and normalizes all fields", () => {
    const event = parseInitTransferEvent(initTransferData)

    expect(event.sender).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000abc",
    )
    expect(event.tokenAddress).toBe(
      "0x000000000000000000000000000000000000000000000000000000000000000a",
    )
    expect(event.originNonce).toBe(7n)
    expect(event.amount).toBe(1000000n)
    expect(event.fee).toBe(100n)
    expect(event.nativeFee).toBe(50n)
    expect(event.recipient).toBe("near:alice.near")
    expect(event.message).toBe("")
  })

  it("decodes UTF-8 messages", () => {
    const event = parseInitTransferEvent({ ...initTransferData, message: "0x68656c6c6f" })
    expect(event.message).toBe("hello")
  })

  it("rejects missing fields", () => {
    const { amount: _amount, ...withoutAmount } = initTransferData
    expect(() => parseInitTransferEvent(withoutAmount)).toThrow(
      "InitTransfer event missing string field amount",
    )
    expect(() => parseInitTransferEvent(null)).toThrow("InitTransfer event data is not an object")
  })

  it("rejects non-integer numeric fields", () => {
    expect(() => parseInitTransferEvent({ ...initTransferData, amount: "12.5" })).toThrow(
      "InitTransfer event field amount is not an integer",
    )
  })

  it("rejects non-canonical decimal strings BigInt would otherwise accept", () => {
    // u64/u128 REST fields are always plain decimal; hex/signed/empty forms
    // must error like the Rust SDK's u128 parse instead of fabricating values.
    for (const amount of ["0x10", "-5", "", " 7 ", "0b101"]) {
      expect(() => parseInitTransferEvent({ ...initTransferData, amount })).toThrow(
        "InitTransfer event field amount is not an integer",
      )
    }
  })
})

describe("getEventLog", () => {
  const committedTx = {
    hash: TX_HASH,
    success: true,
    events: [
      {
        guid: { account_address: "0x0" },
        sequence_number: "0",
        type: "0x1::other::InitTransfer",
        data: {},
      },
      {
        guid: { account_address: "0x0" },
        sequence_number: "5",
        // Short-form address must still match the canonical bridge address.
        type: `0x5558831a603eca8cd69a42d4251f08de3573039b69f23972265cac76639f1cf::omni_bridge::InitTransfer`,
        data: { z: "1", a: "2" },
      },
    ],
  }

  it("finds the bridge event and returns canonical metadata", async () => {
    vi.stubGlobal("fetch", mockFetchJson(committedTx))

    const log = await getEventLog(RPC, BRIDGE, TX_HASH, "InitTransfer")

    expect(log.eventIndex).toBe(1)
    expect(log.sequenceNumber).toBe(5n)
    expect(log.accountAddress).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    )
    expect(log.typeTag).toBe(
      "0x5558831a603eca8cd69a42d4251f08de3573039b69f23972265cac76639f1cf::omni_bridge::InitTransfer",
    )
    // Canonical sorted-key JSON.
    expect(log.data).toBe('{"a":"2","z":"1"}')
  })

  it("throws when the event is missing", async () => {
    vi.stubGlobal("fetch", mockFetchJson({ hash: TX_HASH, success: true, events: [] }))
    await expect(getEventLog(RPC, BRIDGE, TX_HASH, "InitTransfer")).rejects.toThrow(
      "InitTransfer event not found",
    )
  })

  it("throws on failed transactions", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({ hash: TX_HASH, success: false, vm_status: "ABORTED", events: [] }),
    )
    await expect(getEventLog(RPC, BRIDGE, TX_HASH, "InitTransfer")).rejects.toThrow(
      `Transaction ${TX_HASH} failed: ABORTED`,
    )
  })

  it("throws on pending transactions", async () => {
    vi.stubGlobal("fetch", mockFetchJson({ hash: TX_HASH, type: "pending_transaction" }))
    await expect(getEventLog(RPC, BRIDGE, TX_HASH, "InitTransfer")).rejects.toThrow(
      `Transaction ${TX_HASH} is still pending`,
    )
  })

  it("rejects malformed transaction hashes before building the request URL", async () => {
    const fetchMock = mockFetchJson({})
    vi.stubGlobal("fetch", fetchMock)

    for (const hash of ["0xabc", "../by_version/42", `${TX_HASH}?x=1`, "not-a-hash"]) {
      await expect(getEventLog(RPC, BRIDGE, hash, "InitTransfer")).rejects.toThrow(
        "Invalid Aptos transaction hash",
      )
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("throws when the matched event has no data field", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({
        hash: TX_HASH,
        success: true,
        events: [
          {
            guid: { account_address: "0x0" },
            sequence_number: "5",
            type: `${BRIDGE}::omni_bridge::InitTransfer`,
          },
        ],
      }),
    )
    await expect(getEventLog(RPC, BRIDGE, TX_HASH, "InitTransfer")).rejects.toThrow(
      "InitTransfer event in transaction",
    )
  })
})

describe("getInitTransferEvent", () => {
  it("extracts and parses the InitTransfer event", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({
        hash: TX_HASH,
        success: true,
        events: [
          {
            guid: { account_address: "0x0" },
            sequence_number: "0",
            type: `${BRIDGE}::omni_bridge::InitTransfer`,
            data: initTransferData,
          },
        ],
      }),
    )

    const event = await getInitTransferEvent(RPC, BRIDGE, TX_HASH)
    expect(event.amount).toBe(1000000n)
    expect(event.recipient).toBe("near:alice.near")
  })
})

describe("isTransferFinalised", () => {
  it("calls the view function and returns the boolean", async () => {
    const fetchMock = mockFetchJson([true])
    vi.stubGlobal("fetch", fetchMock)

    await expect(isTransferFinalised(RPC, BRIDGE, 42n)).resolves.toBe(true)

    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${RPC}/view`)
    expect(JSON.parse(init.body as string)).toEqual({
      function: `${BRIDGE}::omni_bridge::is_transfer_finalised`,
      type_arguments: [],
      arguments: ["42"],
    })
  })

  it("throws when the view returns no boolean", async () => {
    vi.stubGlobal("fetch", mockFetchJson([]))
    await expect(isTransferFinalised(RPC, BRIDGE, 42n)).rejects.toThrow(
      "is_transfer_finalised view returned no boolean",
    )
  })
})
