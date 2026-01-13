/**
 * Error types for Omni Bridge SDK
 */

export class OmniBridgeError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = "OmniBridgeError"
  }
}

export type ValidationErrorCode =
  | "INVALID_AMOUNT"
  | "INVALID_ADDRESS"
  | "INVALID_CHAIN"
  | "TOKEN_NOT_REGISTERED"
  | "DECIMAL_OVERFLOW"
  | "AMOUNT_TOO_SMALL"
  | "INVALID_CHECKSUM"

export class ValidationError extends OmniBridgeError {
  constructor(message: string, code: ValidationErrorCode, details?: Record<string, unknown>) {
    super(message, code, details)
    this.name = "ValidationError"
  }
}

export class RpcError extends OmniBridgeError {
  constructor(
    message: string,
    public retryCount: number,
    details?: Record<string, unknown>,
  ) {
    super(message, "RPC_ERROR", details)
    this.name = "RpcError"
  }
}

export class ProofError extends OmniBridgeError {
  constructor(
    message: string,
    code: "PROOF_NOT_READY" | "PROOF_FETCH_FAILED",
    details?: Record<string, unknown>,
  ) {
    super(message, code, details)
    this.name = "ProofError"
  }
}
