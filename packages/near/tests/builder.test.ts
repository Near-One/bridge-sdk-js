import { beforeEach, describe, expect, it, vi } from "vitest"
import { ChainKind, type ValidatedTransfer } from "@omni-bridge/core"
import { createNearBuilder, type NearBuilder } from "../src/builder.js"
import { ProofKind } from "../src/types.js"

// Mock near-kit
const mockNearView = vi.fn()
const mockNearConstructor = vi.fn()
vi.mock("near-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("near-kit")>()
  return {
    ...actual,
    Near: class {
      constructor(config: unknown) {
        mockNearConstructor(config)
      }
      view = mockNearView
    },
  }
})

describe("createNearBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("creates builder with testnet config", () => {
    const builder = createNearBuilder({ network: "testnet" })
    expect(builder).toBeDefined()
  })

  it("creates builder with mainnet config", () => {
    const builder = createNearBuilder({ network: "mainnet" })
    expect(builder).toBeDefined()
  })

  it("uses default RPC when rpcUrl not provided", async () => {
    const builder = createNearBuilder({ network: "mainnet" })
    // Trigger an RPC call to verify the Near client config
    mockNearView.mockResolvedValue({ min: "0", max: "0" })
    try {
      await builder.getRequiredStorageDeposit("alice.near")
    } catch {
      // Ignore errors, we just want to verify the Near constructor was called
    }

    expect(mockNearConstructor).toHaveBeenCalledWith({ network: "mainnet" })
  })

  it("uses custom RPC URL when provided", async () => {
    const builder = createNearBuilder({
      network: "mainnet",
      rpcUrl: "https://custom-rpc.example.com",
    })
    // Trigger an RPC call to verify the Near client config
    mockNearView.mockResolvedValue({ min: "0", max: "0" })
    try {
      await builder.getRequiredStorageDeposit("alice.near")
    } catch {
      // Ignore errors, we just want to verify the Near constructor was called
    }

    expect(mockNearConstructor).toHaveBeenCalledWith({
      rpcUrl: "https://custom-rpc.example.com",
      network: "mainnet",
    })
  })
})

describe("NearBuilder.buildTransfer", () => {
  let builder: NearBuilder

  beforeEach(() => {
    builder = createNearBuilder({ network: "testnet" })
  })

  it("builds transfer transaction", () => {
    const validated: ValidatedTransfer = {
      params: {
        token: "near:wrap.testnet",
        amount: 1000000000000000000000000n, // 1 NEAR (24 decimals)
        fee: 0n,
        nativeFee: 0n,
        sender: "near:alice.testnet",
        recipient: "eth:0xABCDEF0123456789ABCDEF0123456789ABCDEF01",
      },
      sourceChain: ChainKind.Near,
      destChain: ChainKind.Eth,
      normalizedAmount: 1000000000000000000000000n,
      normalizedFee: 0n,
      contractAddress: "omni.n-bridge.testnet",
    }

    const tx = builder.buildTransfer(validated, "alice.testnet")

    expect(tx.signerId).toBe("alice.testnet")
    expect(tx.receiverId).toBe("wrap.testnet")
    expect(tx.actions).toHaveLength(1)
    expect(tx.actions[0].type).toBe("FunctionCall")
    expect(tx.actions[0].methodName).toBe("ft_transfer_call")
  })

  it("includes message in transfer", () => {
    const validated: ValidatedTransfer = {
      params: {
        token: "near:wrap.testnet",
        amount: 1000000000000000000000000n,
        fee: 0n,
        nativeFee: 0n,
        sender: "near:alice.testnet",
        recipient: "eth:0xABCDEF0123456789ABCDEF0123456789ABCDEF01",
        message: "Hello from NEAR!",
      },
      sourceChain: ChainKind.Near,
      destChain: ChainKind.Eth,
      normalizedAmount: 1000000000000000000000000n,
      normalizedFee: 0n,
      contractAddress: "omni.n-bridge.testnet",
    }

    const tx = builder.buildTransfer(validated, "alice.testnet")

    // Message should be included in the args
    const args = JSON.parse(new TextDecoder().decode(tx.actions[0].args as Uint8Array))
    expect(args.msg).toContain("Hello from NEAR!")
  })

  it("throws for non-NEAR source chain", () => {
    const validated: ValidatedTransfer = {
      params: {
        token: "eth:0x1234567890123456789012345678901234567890",
        amount: 1000000000000000000n,
        fee: 0n,
        nativeFee: 0n,
        sender: "eth:0xABCDEF0123456789ABCDEF0123456789ABCDEF01",
        recipient: "near:alice.testnet",
      },
      sourceChain: ChainKind.Eth,
      destChain: ChainKind.Near,
      normalizedAmount: 1000000000000000000n,
      normalizedFee: 0n,
      contractAddress: "0x1111111111111111111111111111111111111111",
    }

    expect(() => builder.buildTransfer(validated, "alice.testnet")).toThrow("is not NEAR")
  })

  it("throws for invalid token address format", () => {
    const validated: ValidatedTransfer = {
      params: {
        token: "near:" as any, // Invalid - empty address
        amount: 1000000000000000000000000n,
        fee: 0n,
        nativeFee: 0n,
        sender: "near:alice.testnet",
        recipient: "eth:0xABCDEF0123456789ABCDEF0123456789ABCDEF01",
      },
      sourceChain: ChainKind.Near,
      destChain: ChainKind.Eth,
      normalizedAmount: 1000000000000000000000000n,
      normalizedFee: 0n,
      contractAddress: "omni.n-bridge.testnet",
    }

    expect(() => builder.buildTransfer(validated, "alice.testnet")).toThrow(
      "Invalid token address format",
    )
  })
})

describe("NearBuilder.buildStorageDeposit", () => {
  let builder: NearBuilder

  beforeEach(() => {
    builder = createNearBuilder({ network: "testnet" })
  })

  it("builds storage deposit transaction", () => {
    const tx = builder.buildStorageDeposit("alice.testnet", 1250000000000000000000n)

    expect(tx.signerId).toBe("alice.testnet")
    expect(tx.receiverId).toBe("omni.n-bridge.testnet")
    expect(tx.actions).toHaveLength(1)
    expect(tx.actions[0].type).toBe("FunctionCall")
    expect(tx.actions[0].methodName).toBe("storage_deposit")
    expect(tx.actions[0].deposit).toBe(1250000000000000000000n)
  })
})

describe("NearBuilder.buildFinalization", () => {
  let builder: NearBuilder

  beforeEach(() => {
    builder = createNearBuilder({ network: "testnet" })
  })

  it("builds finalization with Wormhole VAA", () => {
    const tx = builder.buildFinalization({
      sourceChain: ChainKind.Sol,
      signerId: "alice.testnet",
      vaa: "AQAAAAMNAG1vY2tfdmFh", // Mock base64 VAA
      storageDepositActions: [
        { token_id: "token.testnet", account_id: "alice.testnet", storage_deposit_amount: null },
      ],
    })

    expect(tx.signerId).toBe("alice.testnet")
    expect(tx.receiverId).toBe("omni.n-bridge.testnet")
    expect(tx.actions).toHaveLength(1)
    expect(tx.actions[0].type).toBe("FunctionCall")
    expect(tx.actions[0].methodName).toBe("fin_transfer")
  })

  it("builds finalization with EVM proof", () => {
    const tx = builder.buildFinalization({
      sourceChain: ChainKind.Eth,
      signerId: "alice.testnet",
      evmProof: {
        proof_kind: ProofKind.InitTransfer,
        proof: {
          log_index: 0n,
          log_entry_data: new Uint8Array([1, 2, 3]),
          receipt_index: 0n,
          receipt_data: new Uint8Array([4, 5, 6]),
          header_data: new Uint8Array([7, 8, 9]),
          proof: [new Uint8Array([10, 11, 12])],
        },
      },
      storageDepositActions: [],
    })

    expect(tx.signerId).toBe("alice.testnet")
    expect(tx.actions[0].methodName).toBe("fin_transfer")
  })

  it("throws when neither VAA nor EVM proof provided", () => {
    expect(() =>
      builder.buildFinalization({
        sourceChain: ChainKind.Sol,
        signerId: "alice.testnet",
        storageDepositActions: [],
      }),
    ).toThrow("Must provide either VAA or EVM proof")
  })
})

describe("NearBuilder.buildLogMetadata", () => {
  let builder: NearBuilder

  beforeEach(() => {
    builder = createNearBuilder({ network: "testnet" })
  })

  it("builds log metadata transaction", () => {
    const tx = builder.buildLogMetadata("wrap.testnet", "alice.testnet")

    expect(tx.signerId).toBe("alice.testnet")
    expect(tx.receiverId).toBe("omni.n-bridge.testnet")
    expect(tx.actions).toHaveLength(1)
    expect(tx.actions[0].type).toBe("FunctionCall")
    expect(tx.actions[0].methodName).toBe("log_metadata")

    const args = JSON.parse(new TextDecoder().decode(tx.actions[0].args as Uint8Array))
    expect(args.token_id).toBe("wrap.testnet")
  })
})

describe("NearBuilder.buildDeployToken", () => {
  let builder: NearBuilder

  beforeEach(() => {
    builder = createNearBuilder({ network: "testnet" })
  })

  it("builds deploy token transaction", () => {
    const proverArgs = new Uint8Array([1, 2, 3, 4])

    const tx = builder.buildDeployToken(
      ChainKind.Eth,
      proverArgs,
      "alice.testnet",
      2000000000000000000000000n,
    )

    expect(tx.signerId).toBe("alice.testnet")
    expect(tx.receiverId).toBe("omni.n-bridge.testnet")
    expect(tx.actions).toHaveLength(1)
    expect(tx.actions[0].type).toBe("FunctionCall")
    expect(tx.actions[0].methodName).toBe("deploy_token")
    expect(tx.actions[0].deposit).toBe(2000000000000000000000000n)
  })
})

describe("NearBuilder.buildBindToken", () => {
  let builder: NearBuilder

  beforeEach(() => {
    builder = createNearBuilder({ network: "testnet" })
  })

  it("builds bind token transaction", () => {
    const proverArgs = new Uint8Array([5, 6, 7, 8])

    const tx = builder.buildBindToken(
      ChainKind.Eth,
      proverArgs,
      "alice.testnet",
      3000000000000000000000000n,
    )

    expect(tx.signerId).toBe("alice.testnet")
    expect(tx.receiverId).toBe("omni.n-bridge.testnet")
    expect(tx.actions).toHaveLength(1)
    expect(tx.actions[0].type).toBe("FunctionCall")
    expect(tx.actions[0].methodName).toBe("bind_token")
    expect(tx.actions[0].deposit).toBe(3000000000000000000000000n)
  })
})

describe("NearBuilder.buildSignTransfer", () => {
  let builder: NearBuilder

  beforeEach(() => {
    builder = createNearBuilder({ network: "testnet" })
  })

  it("builds sign transfer transaction with numeric chain", () => {
    const tx = builder.buildSignTransfer(
      { origin_chain: ChainKind.Near, origin_nonce: 123n },
      "relayer.testnet",
      { fee: "1000000", native_fee: "0" },
      "alice.testnet",
    )

    expect(tx.signerId).toBe("alice.testnet")
    expect(tx.receiverId).toBe("omni.n-bridge.testnet")
    expect(tx.actions).toHaveLength(1)
    expect(tx.actions[0].type).toBe("FunctionCall")
    expect(tx.actions[0].methodName).toBe("sign_transfer")

    const args = JSON.parse(new TextDecoder().decode(tx.actions[0].args as Uint8Array))
    expect(args.transfer_id.origin_chain).toBe("Near")
    expect(args.transfer_id.origin_nonce).toBe(123)
    expect(args.fee_recipient).toBe("relayer.testnet")
  })

  it("builds sign transfer transaction with string chain", () => {
    const tx = builder.buildSignTransfer(
      { origin_chain: "Eth" as any, origin_nonce: 456n },
      "relayer.testnet",
      { fee: "2000000", native_fee: "1000000" },
      "bob.testnet",
    )

    const args = JSON.parse(new TextDecoder().decode(tx.actions[0].args as Uint8Array))
    expect(args.transfer_id.origin_chain).toBe("Eth")
    expect(args.transfer_id.origin_nonce).toBe(456)
  })
})

describe("NearBuilder.buildFastFinTransfer", () => {
  let builder: NearBuilder

  beforeEach(() => {
    builder = createNearBuilder({ network: "testnet" })
  })

  it("builds fast fin transfer transaction", () => {
    const tx = builder.buildFastFinTransfer(
      {
        tokenId: "wrap.testnet",
        amount: "1000000000000000000000000",
        amountToSend: "900000000000000000000000",
        transferId: { origin_chain: ChainKind.Eth, origin_nonce: 789n },
        recipient: "near:bob.testnet",
        fee: { fee: "100000000000000000000000", native_fee: "0" },
        storageDepositAmount: "1250000000000000000000",
        relayer: "relayer.testnet",
      },
      "alice.testnet",
    )

    expect(tx.signerId).toBe("alice.testnet")
    expect(tx.receiverId).toBe("wrap.testnet")
    expect(tx.actions).toHaveLength(1)
    expect(tx.actions[0].type).toBe("FunctionCall")
    expect(tx.actions[0].methodName).toBe("ft_transfer_call")
  })
})

describe("NearBuilder.serializeEvmProofArgs", () => {
  let builder: NearBuilder

  beforeEach(() => {
    builder = createNearBuilder({ network: "testnet" })
  })

  it("serializes EVM proof args", () => {
    const args = {
      proof_kind: ProofKind.InitTransfer,
      proof: {
        log_index: 0n,
        log_entry_data: new Uint8Array([1, 2, 3]),
        receipt_index: 0n,
        receipt_data: new Uint8Array([4, 5, 6]),
        header_data: new Uint8Array([7, 8, 9]),
        proof: [new Uint8Array([10, 11, 12])],
      },
    }

    const serialized = builder.serializeEvmProofArgs(args)

    expect(serialized).toBeInstanceOf(Uint8Array)
    expect(serialized.length).toBeGreaterThan(0)
  })
})

describe("NearBuilder.serializeWormholeProofArgs", () => {
  let builder: NearBuilder

  beforeEach(() => {
    builder = createNearBuilder({ network: "testnet" })
  })

  it("serializes Wormhole proof args", () => {
    const args = {
      proof_kind: ProofKind.InitTransfer,
      vaa: "AQAAAAMNAG1vY2tfdmFh",
    }

    const serialized = builder.serializeWormholeProofArgs(args)

    expect(serialized).toBeInstanceOf(Uint8Array)
    expect(serialized.length).toBeGreaterThan(0)
  })
})

describe("NearBuilder view methods", () => {
  let builder: NearBuilder

  beforeEach(() => {
    vi.clearAllMocks()
    builder = createNearBuilder({ network: "testnet" })
  })

  describe("getRequiredStorageDeposit", () => {
    it("returns required deposit when storage is insufficient", async () => {
      mockNearView.mockImplementation(async (_contract: string, method: string) => {
        if (method === "required_balance_for_account") return "1000000000000000000000"
        if (method === "required_balance_for_init_transfer") return "500000000000000000000"
        if (method === "storage_balance_of") return { total: "100000000000000000000", available: "100000000000000000000" }
        return null
      })

      const required = await builder.getRequiredStorageDeposit("alice.testnet")

      // Required (1000 + 500) - available (100) = 1400
      expect(required).toBe(1400000000000000000000n)
    })

    it("returns 0 when storage is sufficient", async () => {
      mockNearView.mockImplementation(async (_contract: string, method: string) => {
        if (method === "required_balance_for_account") return "1000000000000000000000"
        if (method === "required_balance_for_init_transfer") return "500000000000000000000"
        if (method === "storage_balance_of") return { total: "2000000000000000000000", available: "2000000000000000000000" }
        return null
      })

      const required = await builder.getRequiredStorageDeposit("alice.testnet")

      expect(required).toBe(0n)
    })

    it("returns full amount when no existing storage", async () => {
      mockNearView.mockImplementation(async (_contract: string, method: string) => {
        if (method === "required_balance_for_account") return "1000000000000000000000"
        if (method === "required_balance_for_init_transfer") return "500000000000000000000"
        if (method === "storage_balance_of") return null
        return null
      })

      const required = await builder.getRequiredStorageDeposit("alice.testnet")

      expect(required).toBe(1500000000000000000000n)
    })
  })

  describe("isTokenStorageRegistered", () => {
    it("returns true when storage is registered", async () => {
      mockNearView.mockResolvedValue({ total: "1000000000000000000000", available: "1000000000000000000000" })

      const registered = await builder.isTokenStorageRegistered("wrap.testnet")

      expect(registered).toBe(true)
    })

    it("returns false when storage is not registered", async () => {
      mockNearView.mockResolvedValue(null)

      const registered = await builder.isTokenStorageRegistered("wrap.testnet")

      expect(registered).toBe(false)
    })
  })

  describe("buildTokenStorageDeposit", () => {
    it("builds token storage deposit transaction", async () => {
      mockNearView.mockResolvedValue({ min: "1250000000000000000000", max: "2500000000000000000000" })

      const tx = await builder.buildTokenStorageDeposit("wrap.testnet", "alice.testnet")

      expect(tx.signerId).toBe("alice.testnet")
      expect(tx.receiverId).toBe("wrap.testnet")
      expect(tx.actions).toHaveLength(1)
      expect(tx.actions[0].type).toBe("FunctionCall")
      expect(tx.actions[0].methodName).toBe("storage_deposit")
      expect(tx.actions[0].deposit).toBe(1250000000000000000000n)
    })

    it("throws when bounds not available", async () => {
      mockNearView.mockResolvedValue(null)

      await expect(builder.buildTokenStorageDeposit("wrap.testnet", "alice.testnet")).rejects.toThrow(
        "Failed to retrieve storage balance bounds",
      )
    })
  })
})
