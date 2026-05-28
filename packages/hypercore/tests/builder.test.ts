import type { OmniAddress } from "@omni-bridge/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { decodeAbiParameters } from "viem"
import { createHyperCoreBuilder } from "../src/builder.js"
import { ACTION_INIT_TRANSFER, ACTION_TRANSFER } from "../src/encoders.js"
import { _clearSpotMetaCache } from "../src/spot-meta.js"

const SPOT_META_RESPONSE = {
  tokens: [
    {
      name: "USDC",
      fullName: "USDC",
      szDecimals: 8,
      weiDecimals: 8,
      tokenId: "0x6d1e7cde53ba9467b783cb7c530ce054",
      evmContract: {
        address: "0x1234567890123456789012345678901234567890",
        evm_extra_wei_decimals: 0,
      },
    },
    {
      name: "PURR",
      fullName: "PURR",
      szDecimals: 8,
      weiDecimals: 8,
      tokenId: "0xc4bf3f870c0e9465323c0b6ed28096c2",
      evmContract: {
        address: "0x9999999999999999999999999999999999999999",
        evm_extra_wei_decimals: 0,
      },
    },
  ],
}

function makeFetch() {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    if (url.endsWith("/info") && init?.method === "POST") {
      return new Response(JSON.stringify(SPOT_META_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }
    throw new Error(`unexpected fetch: ${url}`)
  }) as unknown as typeof fetch
}

describe("createHyperCoreBuilder.buildTransfer", () => {
  beforeEach(() => {
    _clearSpotMetaCache()
  })
  afterEach(() => {
    _clearSpotMetaCache()
  })

  it("picks ACTION_TRANSFER for HyperEVM recipients (pool release)", async () => {
    const builder = createHyperCoreBuilder({ network: "testnet", fetch: makeFetch() })
    const unsigned = await builder.buildTransfer({
      spotToken: "USDC",
      amount: 100_000_000n, // 1 USDC at 8 decimals
      recipient: "hlevm:0x000000000000000000000000000000000000DeaD" as OmniAddress,
    })

    expect(unsigned.action.type).toBe("sendToEvmWithData")
    expect(unsigned.action.hyperliquidChain).toBe("Testnet")
    expect(unsigned.action.token).toBe("USDC:0x6d1e7cde53ba9467b783cb7c530ce054")
    expect(unsigned.action.amount).toBe("1")
    expect(unsigned.action.destinationChainId).toBe(998)
    expect(unsigned.action.destinationRecipient).toBe(
      "0x1234567890123456789012345678901234567890",
    )
    expect(unsigned.action.data.slice(0, 4)).toBe(`0x0${ACTION_TRANSFER}`)
    const [decodedRecipient] = decodeAbiParameters(
      [{ type: "address" }],
      `0x${unsigned.action.data.slice(4)}`,
    )
    expect(decodedRecipient.toLowerCase()).toBe(
      "0x000000000000000000000000000000000000dead",
    )
    expect(unsigned.hlBridgeToken).toBe("0x1234567890123456789012345678901234567890")
  })

  it("picks ACTION_INIT_TRANSFER for non-HyperEVM recipients", async () => {
    const builder = createHyperCoreBuilder({ network: "testnet", fetch: makeFetch() })
    const unsigned = await builder.buildTransfer({
      spotToken: "PURR",
      amount: 12_300_000n,
      recipient: "near:alice.near" as OmniAddress,
      fee: 7n,
      message: "ref=test",
    })

    expect(unsigned.action.data.slice(0, 4)).toBe(`0x0${ACTION_INIT_TRANSFER}`)
    const [fee, recipient, message] = decodeAbiParameters(
      [{ type: "uint128" }, { type: "string" }, { type: "string" }],
      `0x${unsigned.action.data.slice(4)}`,
    )
    expect(fee).toBe(7n)
    expect(recipient).toBe("near:alice.near")
    expect(message).toBe("ref=test")
    expect(unsigned.action.amount).toBe("0.123")
  })

  it("skips /info lookup when hlBridgeToken+decimals+spotId are supplied", async () => {
    const fetchImpl = makeFetch()
    const builder = createHyperCoreBuilder({ network: "testnet", fetch: fetchImpl })
    await builder.buildTransfer({
      spotToken: "USDC",
      amount: 1n,
      recipient: "hlevm:0x000000000000000000000000000000000000DeaD" as OmniAddress,
      hlBridgeToken: "0xAaaaaaaAAaAaaAaAAAaAaAAaAAaAaAAaaaAAaAAa",
      decimals: 6,
      spotId: "USDC:0xdeadbeef",
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("caches /info between calls", async () => {
    const fetchImpl = makeFetch()
    const builder = createHyperCoreBuilder({ network: "testnet", fetch: fetchImpl })
    await builder.buildTransfer({
      spotToken: "USDC",
      amount: 1n,
      recipient: "hlevm:0x000000000000000000000000000000000000DeaD" as OmniAddress,
    })
    await builder.buildTransfer({
      spotToken: "PURR",
      amount: 1n,
      recipient: "hlevm:0x000000000000000000000000000000000000DeaD" as OmniAddress,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("uses mainnet defaults when network=mainnet", async () => {
    const builder = createHyperCoreBuilder({ network: "mainnet", fetch: makeFetch() })
    const unsigned = await builder.buildTransfer({
      spotToken: "USDC",
      amount: 100_000_000n,
      recipient: "hlevm:0x000000000000000000000000000000000000DeaD" as OmniAddress,
    })
    expect(unsigned.action.hyperliquidChain).toBe("Mainnet")
    expect(unsigned.action.destinationChainId).toBe(999)
  })
})
