import { describe, expect, it } from "vitest"
import { type ProverResult, ProverResultSchema } from "../../src/types"

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
      const serialized = ProverResultSchema.serialize(initTransfer)
      const deserialized = ProverResultSchema.deserialize(serialized)
      expect(deserialized).toEqual(initTransfer)
    })

    it("should maintain bigint precision", () => {
      const largeAmount: ProverResult = {
        InitTransfer: {
          ...initTransfer.InitTransfer,
          amount: 9007199254740991n, // Number.MAX_SAFE_INTEGER
        },
      }
      const serialized = ProverResultSchema.serialize(largeAmount)
      const deserialized = ProverResultSchema.deserialize(serialized)
      if ("InitTransfer" in deserialized) {
        expect(deserialized.InitTransfer.amount).toBe(9007199254740991n)
      } else {
        throw new Error("Expected InitTransfer variant")
      }
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
      const serialized = ProverResultSchema.serialize(finTransfer)
      const deserialized = ProverResultSchema.deserialize(serialized)
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
      const serialized = ProverResultSchema.serialize(deployToken)
      const deserialized = ProverResultSchema.deserialize(serialized)
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
      const serialized = ProverResultSchema.serialize(logMetadata)
      const deserialized = ProverResultSchema.deserialize(serialized)
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
      const serialized = ProverResultSchema.serialize(zeroValuesMsg)
      const deserialized = ProverResultSchema.deserialize(serialized)
      expect(deserialized).toEqual(zeroValuesMsg)
    })
  })
})
