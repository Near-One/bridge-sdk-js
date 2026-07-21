import { describe, expect, it } from "vitest"
import { decodeAbiParameters } from "viem"
import {
  ACTION_INIT_TRANSFER,
  ACTION_TRANSFER,
  encodeInitTransferAction,
  encodeTransferAction,
} from "../src/encoders.js"

describe("encodeTransferAction", () => {
  it("round-trips a recipient address", () => {
    const recipient = "0x00000000000000000000000000000000DeaDBeef"
    const encoded = encodeTransferAction(recipient)
    expect(encoded.slice(0, 4)).toBe(`0x0${ACTION_TRANSFER}`)
    const [decoded] = decodeAbiParameters([{ type: "address" }], `0x${encoded.slice(4)}`)
    expect(decoded.toLowerCase()).toBe(recipient.toLowerCase())
  })
})

describe("encodeInitTransferAction", () => {
  it("round-trips fee, recipient, message", () => {
    const fee = 10n
    const recipient = "near:alice.near"
    const message = "ref=hypercore"
    const encoded = encodeInitTransferAction(fee, recipient, message)
    expect(encoded.slice(0, 4)).toBe(`0x0${ACTION_INIT_TRANSFER}`)
    const [decodedFee, decodedRecipient, decodedMessage] = decodeAbiParameters(
      [{ type: "uint128" }, { type: "string" }, { type: "string" }],
      `0x${encoded.slice(4)}`,
    )
    expect(decodedFee).toBe(fee)
    expect(decodedRecipient).toBe(recipient)
    expect(decodedMessage).toBe(message)
  })

  it("supports empty message", () => {
    const encoded = encodeInitTransferAction(
      0n,
      "sol:11111111111111111111111111111111",
      "",
    )
    const [fee, recipient, message] = decodeAbiParameters(
      [{ type: "uint128" }, { type: "string" }, { type: "string" }],
      `0x${encoded.slice(4)}`,
    )
    expect(fee).toBe(0n)
    expect(recipient).toBe("sol:11111111111111111111111111111111")
    expect(message).toBe("")
  })
})
