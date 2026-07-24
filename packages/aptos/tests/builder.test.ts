import { ChainKind } from "@omni-bridge/core"
import { beforeEach, describe, expect, it } from "vitest"
import { type AptosBuilder, createAptosBuilder } from "../src/builder.js"

const BRIDGE = "0x05558831a603eca8cd69a42d4251f08de3573039b69f23972265cac76639f1cf"
const TOKEN = "0x2ebb2ccac5e027a87fa0e2e5f656a3a4238d6a48d93ec9b610d570fc0aa0df12"
// Canonical APT Fungible Asset metadata object address.
const APT = "0x000000000000000000000000000000000000000000000000000000000000000a"

describe("createAptosBuilder", () => {
  it("throws when no bridge address is configured for the network", () => {
    // The Aptos bridge contract is not deployed yet — config has no address.
    expect(() => createAptosBuilder({ network: "testnet" })).toThrow(
      "No Aptos bridge address configured for testnet",
    )
  })

  it("creates builder with custom bridge address", () => {
    const builder = createAptosBuilder({ network: "testnet", bridgeAddress: BRIDGE })
    expect(builder.bridgeAddress).toBe(BRIDGE)
  })

  it("normalizes short-form bridge addresses", () => {
    const builder = createAptosBuilder({ network: "testnet", bridgeAddress: "0xCAFE" })
    expect(builder.bridgeAddress).toBe(
      "0x000000000000000000000000000000000000000000000000000000000000cafe",
    )
  })
})

describe("AptosBuilder.buildTransfer", () => {
  let builder: AptosBuilder

  beforeEach(() => {
    builder = createAptosBuilder({ network: "testnet", bridgeAddress: BRIDGE })
  })

  it("builds an init_transfer payload with arguments in Move signature order", () => {
    const payload = builder.buildTransfer({
      token: TOKEN,
      amount: 1000n,
      fee: 10n,
      nativeFee: 5n,
      recipient: "near:alice.testnet",
    })

    expect(payload.function).toBe(`${BRIDGE}::omni_bridge::init_transfer`)
    expect(payload.typeArguments).toEqual([])
    expect(payload.functionArguments).toEqual([
      TOKEN,
      "1000",
      "10",
      "5",
      "near:alice.testnet",
      [], // empty message
    ])
  })

  it("encodes the message as UTF-8 bytes", () => {
    const payload = builder.buildTransfer({
      token: APT,
      amount: 100n,
      fee: 0n,
      nativeFee: 0n,
      recipient: "near:alice.testnet",
      message: "hello",
    })

    expect(payload.functionArguments[5]).toEqual([0x68, 0x65, 0x6c, 0x6c, 0x6f])
  })

  it("normalizes short-form token addresses", () => {
    const payload = builder.buildTransfer({
      token: "0xa",
      amount: 100n,
      fee: 0n,
      nativeFee: 0n,
      recipient: "near:alice.testnet",
    })

    expect(payload.functionArguments[0]).toBe(APT)
  })
})

describe("AptosBuilder.buildLogMetadata", () => {
  it("builds a log_metadata payload", () => {
    const builder = createAptosBuilder({ network: "testnet", bridgeAddress: BRIDGE })
    const payload = builder.buildLogMetadata(TOKEN)

    expect(payload.function).toBe(`${BRIDGE}::omni_bridge::log_metadata`)
    expect(payload.typeArguments).toEqual([])
    expect(payload.functionArguments).toEqual([TOKEN])
  })
})

describe("AptosBuilder.buildDeployToken", () => {
  it("splits the 65-byte signature into rs and v", () => {
    const builder = createAptosBuilder({ network: "testnet", bridgeAddress: BRIDGE })

    const signature = new Uint8Array(65)
    signature[0] = 0xaa
    signature[63] = 0xbb
    signature[64] = 27

    const payload = builder.buildDeployToken(signature, {
      token: "wrap.testnet",
      name: "Wrapped NEAR",
      symbol: "wNEAR",
      decimals: 24,
    })

    expect(payload.function).toBe(`${BRIDGE}::omni_bridge::deploy_token`)
    const rs = payload.functionArguments[0] as number[]
    expect(rs.length).toBe(64)
    expect(rs[0]).toBe(0xaa)
    expect(rs[63]).toBe(0xbb)
    expect(payload.functionArguments.slice(1)).toEqual([
      27,
      "wrap.testnet",
      "Wrapped NEAR",
      "wNEAR",
      24,
    ])
  })

  it("rejects signatures that are not 65 bytes", () => {
    const builder = createAptosBuilder({ network: "testnet", bridgeAddress: BRIDGE })
    expect(() =>
      builder.buildDeployToken(new Uint8Array(64), {
        token: "wrap.testnet",
        name: "Wrapped NEAR",
        symbol: "wNEAR",
        decimals: 24,
      }),
    ).toThrow("Signature must be 65 bytes")
  })
})

describe("AptosBuilder.buildFinalization", () => {
  const RECIPIENT = "0x9c8b1b73d49e6a9e3b8e8c3d9e1f5a7b2c4d6e8f0a1b3c5d7e9f1a3b5c7d9e1f"

  it("encodes fee_recipient as Some and message as None", () => {
    const builder = createAptosBuilder({ network: "testnet", bridgeAddress: BRIDGE })

    const signature = new Uint8Array(65)
    signature[64] = 28

    const payload = builder.buildFinalization(signature, {
      destinationNonce: 1n,
      originChain: ChainKind.Near,
      originNonce: 123n,
      tokenAddress: TOKEN,
      amount: 1000000n,
      recipient: RECIPIENT,
      feeRecipient: "relayer.near",
    })

    expect(payload.function).toBe(`${BRIDGE}::omni_bridge::fin_transfer`)
    expect(payload.functionArguments).toEqual([
      new Array(64).fill(0),
      28,
      "1",
      ChainKind.Near, // 1
      "123",
      TOKEN,
      "1000000",
      RECIPIENT,
      "relayer.near",
      null, // message: None
    ])
  })

  it("encodes both options as None", () => {
    const builder = createAptosBuilder({ network: "testnet", bridgeAddress: BRIDGE })
    const payload = builder.buildFinalization(new Uint8Array(65), {
      destinationNonce: 7n,
      originChain: ChainKind.Sol,
      originNonce: 456n,
      tokenAddress: "0x1",
      amount: 500n,
      recipient: "0x2",
    })

    expect(payload.functionArguments.slice(-2)).toEqual([null, null])
    // Short-form addresses are normalized.
    expect(payload.functionArguments[5]).toBe(`0x${"0".repeat(63)}1`)
    expect(payload.functionArguments[7]).toBe(`0x${"0".repeat(63)}2`)
  })

  it("encodes a non-empty message as Some UTF-8 bytes", () => {
    const builder = createAptosBuilder({ network: "testnet", bridgeAddress: BRIDGE })
    const payload = builder.buildFinalization(new Uint8Array(65), {
      destinationNonce: 7n,
      originChain: ChainKind.Eth,
      originNonce: 456n,
      tokenAddress: "0x1",
      amount: 500n,
      recipient: "0x2",
      message: "hi",
    })

    expect(payload.functionArguments[9]).toEqual([0x68, 0x69])
  })

  it("treats an empty message as None (Rust SDK parity)", () => {
    const builder = createAptosBuilder({ network: "testnet", bridgeAddress: BRIDGE })
    const payload = builder.buildFinalization(new Uint8Array(65), {
      destinationNonce: 7n,
      originChain: ChainKind.Eth,
      originNonce: 456n,
      tokenAddress: "0x1",
      amount: 500n,
      recipient: "0x2",
      message: "",
    })

    expect(payload.functionArguments[9]).toBe(null)
  })
})
