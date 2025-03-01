import { describe, expect, test } from "vitest"
import {
  type BindTokenArgs,
  BindTokenArgsSchema,
  ChainKind,
  type ClaimFeeArgs,
  ClaimFeeArgsSchema,
  type DeployTokenArgs,
  DeployTokenArgsSchema,
  type FinTransferArgs,
  FinTransferArgsSchema,
  type StorageDepositAction,
  StorageDepositActionSchema,
} from "../../src/types"

describe("Chain Kind Types", () => {
  describe("StorageDepositAction", () => {
    test("should serialize and deserialize with storage deposit amount", () => {
      const action: StorageDepositAction = {
        token_id: "token.near",
        account_id: "user.near",
        storage_deposit_amount: 1000000n,
      }

      const serialized = StorageDepositActionSchema.serialize(action)
      const deserialized = StorageDepositActionSchema.deserialize(serialized)

      expect(deserialized).toEqual(action)
    })

    test("should handle null storage deposit amount", () => {
      const action: StorageDepositAction = {
        token_id: "token.near",
        account_id: "user.near",
        storage_deposit_amount: null,
      }

      const serialized = StorageDepositActionSchema.serialize(action)
      const deserialized = StorageDepositActionSchema.deserialize(serialized)

      expect(deserialized).toEqual(action)
    })

    test("should handle long account IDs", () => {
      const action: StorageDepositAction = {
        token_id: "very.long.token.name.near",
        account_id: "very.long.account.name.near",
        storage_deposit_amount: 1000000n,
      }

      const serialized = StorageDepositActionSchema.serialize(action)
      const deserialized = StorageDepositActionSchema.deserialize(serialized)

      expect(deserialized).toEqual(action)
    })
  })

  describe("FinTransferArgs", () => {
    test("should serialize and deserialize with multiple storage deposit actions", () => {
      const args: FinTransferArgs = {
        chain_kind: ChainKind.Near,
        storage_deposit_actions: [
          {
            token_id: "token1.near",
            account_id: "user1.near",
            storage_deposit_amount: 1000000n,
          },
          {
            token_id: "token2.near",
            account_id: "user2.near",
            storage_deposit_amount: null,
          },
        ],
        prover_args: new Uint8Array([1, 2, 3]),
      }

      const serialized = FinTransferArgsSchema.serialize(args)
      const deserialized = FinTransferArgsSchema.deserialize(serialized)

      expect({
        ...deserialized,
        prover_args: Uint8Array.from(deserialized.prover_args),
      }).toEqual(args)
    })

    test("should handle empty storage deposit actions array", () => {
      const args: FinTransferArgs = {
        chain_kind: ChainKind.Near,
        storage_deposit_actions: [],
        prover_args: new Uint8Array([1, 2, 3]),
      }

      const serialized = FinTransferArgsSchema.serialize(args)
      const deserialized = FinTransferArgsSchema.deserialize(serialized)

      expect({
        ...deserialized,
        prover_args: Uint8Array.from(deserialized.prover_args),
      }).toEqual(args)
    })

    test("should handle different chain kinds", () => {
      const chainKinds = [
        ChainKind.Eth,
        ChainKind.Near,
        ChainKind.Sol,
        ChainKind.Arb,
        ChainKind.Base,
      ]

      for (const chainKind of chainKinds) {
        const args: FinTransferArgs = {
          chain_kind: chainKind,
          storage_deposit_actions: [],
          prover_args: new Uint8Array([1, 2, 3]),
        }

        const serialized = FinTransferArgsSchema.serialize(args)
        const deserialized = FinTransferArgsSchema.deserialize(serialized)
        expect({
          ...deserialized,
          prover_args: Uint8Array.from(deserialized.prover_args),
        }).toEqual(args)
      }
    })
  })

  describe("ClaimFeeArgs", () => {
    test("should serialize and deserialize with different chain kinds", () => {
      const args: ClaimFeeArgs = {
        chain_kind: ChainKind.Eth,
        prover_args: new Uint8Array([1, 2, 3]),
      }

      const serialized = ClaimFeeArgsSchema.serialize(args)
      const deserialized = ClaimFeeArgsSchema.deserialize(serialized)

      expect({
        ...deserialized,
        prover_args: Uint8Array.from(deserialized.prover_args),
      }).toEqual(args)
    })

    test("should handle empty prover args", () => {
      const args: ClaimFeeArgs = {
        chain_kind: ChainKind.Sol,
        prover_args: new Uint8Array([]),
      }

      const serialized = ClaimFeeArgsSchema.serialize(args)
      const deserialized = ClaimFeeArgsSchema.deserialize(serialized)

      expect({
        ...deserialized,
        prover_args: Uint8Array.from(deserialized.prover_args),
      }).toEqual(args)
    })
  })

  describe("BindTokenArgs", () => {
    test("should serialize and deserialize correctly", () => {
      const args: BindTokenArgs = {
        chain_kind: ChainKind.Eth,
        prover_args: new Uint8Array([1, 2, 3]),
      }

      const serialized = BindTokenArgsSchema.serialize(args)
      const deserialized = BindTokenArgsSchema.deserialize(serialized)
      expect({
        ...deserialized,
        prover_args: Uint8Array.from(deserialized.prover_args),
      }).toEqual(args)
    })
  })

  describe("DeployTokenArgs", () => {
    test("should serialize and deserialize correctly", () => {
      const args: DeployTokenArgs = {
        chain_kind: ChainKind.Base,
        prover_args: new Uint8Array([1, 2, 3]),
      }

      const serialized = DeployTokenArgsSchema.serialize(args)
      const deserialized = DeployTokenArgsSchema.deserialize(serialized)
      expect({
        ...deserialized,
        prover_args: Uint8Array.from(deserialized.prover_args),
      }).toEqual(args)
    })
  })

  describe("Edge Cases", () => {
    test("should handle large storage deposit amounts", () => {
      const action: StorageDepositAction = {
        token_id: "token.near",
        account_id: "user.near",
        storage_deposit_amount: BigInt("340282366920938463463374607431768211455"), // u128 max
      }

      const serialized = StorageDepositActionSchema.serialize(action)
      const deserialized = StorageDepositActionSchema.deserialize(serialized)

      expect(deserialized).toEqual(action)
    })

    test("should handle large prover args", () => {
      const largeProverArgs = new Uint8Array(1000).fill(1)
      const args: FinTransferArgs = {
        chain_kind: ChainKind.Near,
        storage_deposit_actions: [],
        prover_args: largeProverArgs,
      }

      const serialized = FinTransferArgsSchema.serialize(args)
      const deserialized = FinTransferArgsSchema.deserialize(serialized)
      expect({
        ...deserialized,
        prover_args: Uint8Array.from(deserialized.prover_args),
      }).toEqual(args)
    })

    test("should handle maximum length account IDs", () => {
      // NEAR account IDs have a maximum length of 64 characters
      const maxLengthAccountId = "a".repeat(64)
      const action: StorageDepositAction = {
        token_id: maxLengthAccountId,
        account_id: maxLengthAccountId,
        storage_deposit_amount: 1000000n,
      }

      const serialized = StorageDepositActionSchema.serialize(action)
      const deserialized = StorageDepositActionSchema.deserialize(serialized)

      expect(deserialized).toEqual(action)
    })
  })
})
