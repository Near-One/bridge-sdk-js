import { describe, expect, it } from "vitest"
import { OmniBridgeError, ProofError, RpcError, ValidationError } from "../src/errors.js"

describe("OmniBridgeError", () => {
  it("should create error with message, code, and details", () => {
    const error = new OmniBridgeError("Test error", "TEST_CODE", { foo: "bar" })

    expect(error.message).toBe("Test error")
    expect(error.code).toBe("TEST_CODE")
    expect(error.details).toEqual({ foo: "bar" })
    expect(error.name).toBe("OmniBridgeError")
    expect(error).toBeInstanceOf(Error)
  })

  it("should create error without details", () => {
    const error = new OmniBridgeError("Test error", "TEST_CODE")

    expect(error.message).toBe("Test error")
    expect(error.code).toBe("TEST_CODE")
    expect(error.details).toBeUndefined()
  })
})

describe("ValidationError", () => {
  it("should create validation error with correct properties", () => {
    const error = new ValidationError("Invalid amount", "INVALID_AMOUNT", { amount: "0" })

    expect(error.message).toBe("Invalid amount")
    expect(error.code).toBe("INVALID_AMOUNT")
    expect(error.details).toEqual({ amount: "0" })
    expect(error.name).toBe("ValidationError")
    expect(error).toBeInstanceOf(OmniBridgeError)
  })

  it("should support all validation error codes", () => {
    const codes = [
      "INVALID_AMOUNT",
      "INVALID_ADDRESS",
      "INVALID_CHAIN",
      "TOKEN_NOT_REGISTERED",
      "DECIMAL_OVERFLOW",
      "AMOUNT_TOO_SMALL",
      "INVALID_CHECKSUM",
    ] as const

    for (const code of codes) {
      const error = new ValidationError("Test", code)
      expect(error.code).toBe(code)
    }
  })
})

describe("RpcError", () => {
  it("should create RPC error with retry count", () => {
    const error = new RpcError("Connection failed", 3, { endpoint: "https://rpc.example.com" })

    expect(error.message).toBe("Connection failed")
    expect(error.code).toBe("RPC_ERROR")
    expect(error.retryCount).toBe(3)
    expect(error.details).toEqual({ endpoint: "https://rpc.example.com" })
    expect(error.name).toBe("RpcError")
    expect(error).toBeInstanceOf(OmniBridgeError)
  })

  it("should create RPC error without details", () => {
    const error = new RpcError("Timeout", 5)

    expect(error.retryCount).toBe(5)
    expect(error.details).toBeUndefined()
  })
})

describe("ProofError", () => {
  it("should create proof error with PROOF_NOT_READY code", () => {
    const error = new ProofError("Proof not available yet", "PROOF_NOT_READY", { txHash: "0x123" })

    expect(error.message).toBe("Proof not available yet")
    expect(error.code).toBe("PROOF_NOT_READY")
    expect(error.details).toEqual({ txHash: "0x123" })
    expect(error.name).toBe("ProofError")
    expect(error).toBeInstanceOf(OmniBridgeError)
  })

  it("should create proof error with PROOF_FETCH_FAILED code", () => {
    const error = new ProofError("Failed to fetch proof", "PROOF_FETCH_FAILED")

    expect(error.code).toBe("PROOF_FETCH_FAILED")
    expect(error.details).toBeUndefined()
  })
})
