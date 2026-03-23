import { beforeEach, describe, expect, it } from "vitest"
import { ChainKind } from "@omni-bridge/core"
import { createStarknetBuilder, type StarknetBuilder } from "../src/builder.js"

const BRIDGE = "0x02830785fd87b181c5391819f4a5e6a0b2d76c49d92b7f748a2433495eead162"
const TOKEN = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
const BRIDGE_DEC = BigInt(BRIDGE).toString()
const TOKEN_DEC = BigInt(TOKEN).toString()

describe("createStarknetBuilder", () => {
  it("creates builder with testnet config", () => {
    const builder = createStarknetBuilder({ network: "testnet" })
    expect(builder.bridgeAddress).toBe(BRIDGE)
  })

  it("creates builder with custom bridge address", () => {
    const builder = createStarknetBuilder({ network: "testnet", bridgeAddress: "0x1234" })
    expect(builder.bridgeAddress).toBe("0x1234")
  })
})

describe("StarknetBuilder.buildTransfer", () => {
  let builder: StarknetBuilder

  beforeEach(() => {
    builder = createStarknetBuilder({ network: "testnet", bridgeAddress: BRIDGE })
  })

  it("returns Call[] directly passable to account.execute()", () => {
    const calls = builder.buildTransfer({
      token: TOKEN,
      amount: 1000n,
      fee: 10n,
      nativeFee: 5n,
      recipient: "near:alice.testnet",
    })

    // Returns Call[] — no wrapper object
    expect(Array.isArray(calls)).toBe(true)
    expect(calls.length).toBe(2)

    // approve
    expect(calls[0]!.contractAddress).toBe(TOKEN)
    expect(calls[0]!.entrypoint).toBe("approve")
    expect(calls[0]!.calldata).toEqual([BRIDGE_DEC, "1000", "0"])

    // init_transfer — calldata verified against Rust vectors
    expect(calls[1]!.contractAddress).toBe(BRIDGE)
    expect(calls[1]!.entrypoint).toBe("init_transfer")
    expect(calls[1]!.calldata).toEqual([
      TOKEN_DEC,
      "1000", "10", "5",
      "0", "9616849499774173366311784142897139239773556", "18", // recipient
      "0", "0", "0", // empty message
    ])
  })

  it("calldata has __compiled__ flag", () => {
    const calls = builder.buildTransfer({
      token: TOKEN,
      amount: 100n,
      fee: 0n,
      nativeFee: 0n,
      recipient: "near:alice.testnet",
    })

    const calldata = calls[1]!.calldata as string[] & { __compiled__?: boolean }
    expect(calldata.__compiled__).toBe(true)
  })

  it("includes message in calldata", () => {
    const calls = builder.buildTransfer({
      token: TOKEN,
      amount: 100n,
      fee: 0n,
      nativeFee: 0n,
      recipient: "near:alice.testnet",
      message: "hello",
    })

    // Last 3 felts are "hello" ByteArray (verified against Rust)
    const calldata = calls[1]!.calldata as string[]
    expect(calldata.slice(-3)).toEqual(["0", "448378203247", "5"])
  })
})

describe("StarknetBuilder.buildLogMetadata", () => {
  it("returns single-call array", () => {
    const builder = createStarknetBuilder({ network: "testnet", bridgeAddress: BRIDGE })
    const calls = builder.buildLogMetadata(TOKEN)
    expect(calls.length).toBe(1)
    expect(calls[0]!.entrypoint).toBe("log_metadata")
    expect(calls[0]!.calldata).toEqual([TOKEN_DEC])
  })
})

describe("StarknetBuilder.buildDeployToken", () => {
  it("encodes signature and metadata correctly", () => {
    const builder = createStarknetBuilder({ network: "testnet", bridgeAddress: BRIDGE })

    const signature = new Uint8Array(65)
    signature[31] = 0xff
    signature[63] = 0xaa
    signature[64] = 27

    const calls = builder.buildDeployToken(signature, {
      token: "near:wrap.testnet",
      name: "Wrapped NEAR",
      symbol: "wNEAR",
      decimals: 24,
    })

    const calldata = calls[0]!.calldata as string[]
    // Signature (verified against Rust)
    expect(calldata.slice(0, 5)).toEqual(["255", "0", "170", "0", "27"])
    expect(calldata[calldata.length - 1]).toBe("24")
  })
})

describe("StarknetBuilder.buildFinalization", () => {
  it("encodes fee_recipient as Some and message as None", () => {
    const builder = createStarknetBuilder({ network: "testnet", bridgeAddress: BRIDGE })

    const signature = new Uint8Array(65)
    signature[31] = 0xff
    signature[63] = 0xaa
    signature[64] = 27

    const tokenAddr = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"

    const calls = builder.buildFinalization(signature, {
      destinationNonce: 1n,
      originChain: ChainKind.Near,
      originNonce: 123n,
      tokenAddress: tokenAddr,
      amount: 1000000n,
      recipient: "0x0123456789abcdef0123456789abcdef01234567",
      feeRecipient: "relayer.near",
    })

    const calldata = calls[0]!.calldata as string[]
    expect(calldata.slice(0, 5)).toEqual(["255", "0", "170", "0", "27"])
    expect(calldata[5]).toBe("1") // destinationNonce
    expect(calldata[6]).toBe("1") // originChain = Near
    expect(calldata[7]).toBe("123") // originNonce
    expect(calldata[11]).toBe("0") // fee_recipient: Some
    expect(calldata[calldata.length - 1]).toBe("1") // message: None
  })

  it("encodes both options as None", () => {
    const builder = createStarknetBuilder({ network: "testnet", bridgeAddress: BRIDGE })
    const calls = builder.buildFinalization(new Uint8Array(65), {
      destinationNonce: 1n,
      originChain: ChainKind.Near,
      originNonce: 456n,
      tokenAddress: "0x1",
      amount: 500n,
      recipient: "0x2",
    })

    const calldata = calls[0]!.calldata as string[]
    expect(calldata.slice(-2)).toEqual(["1", "1"])
  })
})
