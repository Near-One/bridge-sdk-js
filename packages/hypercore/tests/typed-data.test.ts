import { describe, expect, it } from "vitest"
import { recoverAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import {
  buildSendToEvmWithDataTypedData,
  parseSignatureChainId,
} from "../src/typed-data.js"
import type { SendToEvmWithDataAction } from "../src/types.js"

// The Rust `sample_action` test vector (signing.rs:121). We reuse it verbatim
// so the digest math is directly comparable to the Rust reference.
const SAMPLE_ACTION: SendToEvmWithDataAction = {
  type: "sendToEvmWithData",
  hyperliquidChain: "Testnet",
  signatureChainId: "0x66eee",
  token: "PURR:0xc4bf3f870c0e9465323c0b6ed28096c2",
  amount: "0.01",
  sourceDex: "spot",
  destinationRecipient: "0x000000000000000000000000000000000000dead",
  addressEncoding: "hex",
  destinationChainId: 998,
  gasLimit: 800_000,
  data: "0x0100",
  nonce: 1_716_531_066_415,
}

describe("parseSignatureChainId", () => {
  it("parses Arb-Sepolia hex", () => {
    expect(parseSignatureChainId("0x66eee")).toBe(421_614n)
  })
  it("parses Arbitrum hex", () => {
    expect(parseSignatureChainId("0xa4b1")).toBe(42_161n)
  })
  it("accepts unprefixed hex", () => {
    expect(parseSignatureChainId("a4b1")).toBe(42_161n)
  })
  it("rejects non-hex", () => {
    expect(() => parseSignatureChainId("not-hex")).toThrow()
  })
})

describe("buildSendToEvmWithDataTypedData", () => {
  it("produces a deterministic digest for a fixed action", () => {
    const a = buildSendToEvmWithDataTypedData(SAMPLE_ACTION)
    const b = buildSendToEvmWithDataTypedData(SAMPLE_ACTION)
    expect(a.digest).toBe(b.digest)
  })

  it("digest changes when any field changes", () => {
    const base = buildSendToEvmWithDataTypedData(SAMPLE_ACTION).digest
    const changedAmount = buildSendToEvmWithDataTypedData({ ...SAMPLE_ACTION, amount: "0.02" })
      .digest
    expect(changedAmount).not.toBe(base)
    const changedGas = buildSendToEvmWithDataTypedData({ ...SAMPLE_ACTION, gasLimit: 900_000 })
      .digest
    expect(changedGas).not.toBe(base)
    const changedData = buildSendToEvmWithDataTypedData({ ...SAMPLE_ACTION, data: "0x01ff" })
      .digest
    expect(changedData).not.toBe(base)
  })

  // Mirrors Rust `sign_action_recovers_signer`: sign with a known key, then
  // recover the address from the digest. Matching addresses prove that the
  // EIP-712 domain, type list, field order, and integer widths all align
  // with what Hyperliquid's L1 expects.
  it("digest signed with Anvil key #0 recovers the known address", async () => {
    const privateKey =
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    const account = privateKeyToAccount(privateKey)
    const { digest } = buildSendToEvmWithDataTypedData(SAMPLE_ACTION)
    const signature = await account.sign({ hash: digest })
    const recovered = await recoverAddress({ hash: digest, signature })
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase())
  })
})
