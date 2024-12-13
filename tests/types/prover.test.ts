import { borshDeserialize, borshSerialize } from "borsher"
import { describe, expect, it } from "vitest"
import { type InitTransferResult, type ProverResult, ProverResultSchema } from "./prover"

describe("Borsh Serialization", () => {
  describe("InitTransfer", () => {
    const initTransfer: ProverResult = {
      InitTransfer: {
        origin_nonce: 1234n,
        token: "near:token.near",
        amount: 1000000n,
        recipient: "near:recipient.near",
        fee: 100n,
        sender: "near:sender.near",
        msg: "transfer message",
        emitter_address: "near:emitter.near",
      },
    }

    it("should correctly serialize and deserialize InitTransfer", () => {
      const serialized = borshSerialize(ProverResultSchema, initTransfer)
      const deserialized = borshDeserialize<ProverResult>(ProverResultSchema, serialized)
      expect(deserialized).toEqual(initTransfer)
    })

    it("should maintain bigint precision", () => {
      const largeAmount: ProverResult = {
        InitTransfer: {
          ...initTransfer.InitTransfer,
          amount: 9007199254740991n, // Number.MAX_SAFE_INTEGER
        },
      }
      const serialized = borshSerialize(ProverResultSchema, largeAmount)
      const deserialized = borshDeserialize<InitTransferResult>(ProverResultSchema, serialized)
      expect(deserialized.InitTransfer.amount).toBe(9007199254740991n)
    })
  })

  describe("FinTransfer", () => {
    const finTransfer: ProverResult = {
      FinTransfer: {
        transfer_id: "transfer123",
        fee_recipient: "fee.near",
        amount: 500000n,
        emitter_address: "near:emitter.near",
      },
    }

    it("should correctly serialize and deserialize FinTransfer", () => {
      const serialized = borshSerialize(ProverResultSchema, finTransfer)
      const deserialized = borshDeserialize<ProverResult>(ProverResultSchema, serialized)
      expect(deserialized).toEqual(finTransfer)
    })
  })

  describe("DeployToken", () => {
    const deployToken: ProverResult = {
      DeployToken: {
        token: "token.near",
        token_address: "eth:0x1234567890",
        emitter_address: "near:emitter.near",
      },
    }

    it("should correctly serialize and deserialize DeployToken", () => {
      const serialized = borshSerialize(ProverResultSchema, deployToken)
      const deserialized = borshDeserialize<ProverResult>(ProverResultSchema, serialized)
      expect(deserialized).toEqual(deployToken)
    })
  })

  describe("LogMetadata", () => {
    const logMetadata: ProverResult = {
      LogMetadata: {
        token_address: "eth:0x1234567890",
        name: "Test Token",
        symbol: "TEST",
        decimals: 18,
        emitter_address: "near:emitter.near",
      },
    }

    it("should correctly serialize and deserialize LogMetadata", () => {
      const serialized = borshSerialize(ProverResultSchema, logMetadata)
      const deserialized = borshDeserialize<ProverResult>(ProverResultSchema, serialized)
      expect(deserialized).toEqual(logMetadata)
    })
  })

  describe("Edge Cases", () => {
    it("should handle zero values", () => {
      const zeroValuesMsg: ProverResult = {
        InitTransfer: {
          origin_nonce: 0n,
          token: "near:token.near",
          amount: 0n,
          recipient: "near:recipient.near",
          fee: 0n,
          sender: "near:sender.near",
          msg: "message",
          emitter_address: "near:emitter.near",
        },
      }
      const serialized = borshSerialize(ProverResultSchema, zeroValuesMsg)
      const deserialized = borshDeserialize<ProverResult>(ProverResultSchema, serialized)
      expect(deserialized).toEqual(zeroValuesMsg)
    })
  })
})
