import { describe, expect, it } from "vitest"
import { ChainKind, type ValidatedTransfer } from "@omni-bridge/core"
import {
  createEvmBuilder,
  type EvmBuilder,
  type TokenMetadata,
  type TransferPayload,
} from "../src/builder.js"

describe("createEvmBuilder", () => {
  it("creates builder with testnet config", () => {
    const builder = createEvmBuilder({ network: "testnet" })
    expect(builder).toBeDefined()
  })

  it("creates builder with mainnet config", () => {
    const builder = createEvmBuilder({ network: "mainnet" })
    expect(builder).toBeDefined()
  })
})

describe("EvmBuilder.buildTransfer", () => {
  let builder: EvmBuilder

  beforeEach(() => {
    builder = createEvmBuilder({ network: "testnet" })
  })

  it("builds transfer for ERC20 token", () => {
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

    const tx = builder.buildTransfer(validated)

    expect(tx.to).toBe("0x1111111111111111111111111111111111111111")
    expect(tx.chainId).toBe(11155111) // Sepolia
    expect(tx.value).toBe(0n) // ERC20 transfer has no native value (nativeFee is 0)
    expect(tx.data).toMatch(/^0x/) // Has encoded data
  })

  it("builds transfer with native fee", () => {
    const validated: ValidatedTransfer = {
      params: {
        token: "eth:0x1234567890123456789012345678901234567890",
        amount: 1000000000000000000n,
        fee: 0n,
        nativeFee: 100000000000000000n, // 0.1 ETH native fee
        sender: "eth:0xABCDEF0123456789ABCDEF0123456789ABCDEF01",
        recipient: "near:alice.testnet",
      },
      sourceChain: ChainKind.Eth,
      destChain: ChainKind.Near,
      normalizedAmount: 1000000000000000000n,
      normalizedFee: 0n,
      contractAddress: "0x1111111111111111111111111111111111111111",
    }

    const tx = builder.buildTransfer(validated)

    expect(tx.value).toBe(100000000000000000n) // Native fee included in value
  })

  it("builds transfer for native token (ETH)", () => {
    const validated: ValidatedTransfer = {
      params: {
        token: "eth:0x0000000000000000000000000000000000000000", // Native token
        amount: 1000000000000000000n, // 1 ETH
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

    const tx = builder.buildTransfer(validated)

    // For native token, value = amount + nativeFee
    expect(tx.value).toBe(1000000000000000000n)
  })

  it("builds transfer for Base chain", () => {
    const validated: ValidatedTransfer = {
      params: {
        token: "base:0x1234567890123456789012345678901234567890",
        amount: 1000000n,
        fee: 0n,
        nativeFee: 0n,
        sender: "base:0xABCDEF0123456789ABCDEF0123456789ABCDEF01",
        recipient: "near:alice.testnet",
      },
      sourceChain: ChainKind.Base,
      destChain: ChainKind.Near,
      normalizedAmount: 1000000n,
      normalizedFee: 0n,
      contractAddress: "0x2222222222222222222222222222222222222222",
    }

    const tx = builder.buildTransfer(validated)

    expect(tx.chainId).toBe(84532) // Base Sepolia
  })

  it("builds transfer for Arbitrum chain", () => {
    const validated: ValidatedTransfer = {
      params: {
        token: "arb:0x1234567890123456789012345678901234567890",
        amount: 1000000n,
        fee: 0n,
        nativeFee: 0n,
        sender: "arb:0xABCDEF0123456789ABCDEF0123456789ABCDEF01",
        recipient: "near:alice.testnet",
      },
      sourceChain: ChainKind.Arb,
      destChain: ChainKind.Near,
      normalizedAmount: 1000000n,
      normalizedFee: 0n,
      contractAddress: "0x3333333333333333333333333333333333333333",
    }

    const tx = builder.buildTransfer(validated)

    expect(tx.chainId).toBe(421614) // Arbitrum Sepolia
  })

  it("throws for non-EVM source chain", () => {
    const validated: ValidatedTransfer = {
      params: {
        token: "near:wrap.testnet",
        amount: 1000000000000000000n,
        fee: 0n,
        nativeFee: 0n,
        sender: "near:alice.testnet",
        recipient: "eth:0xABCDEF0123456789ABCDEF0123456789ABCDEF01",
      },
      sourceChain: ChainKind.Near,
      destChain: ChainKind.Eth,
      normalizedAmount: 1000000000000000000n,
      normalizedFee: 0n,
      contractAddress: "omni-locker.testnet",
    }

    expect(() => builder.buildTransfer(validated)).toThrow("is not an EVM chain")
  })

  it("includes message in transfer", () => {
    const validated: ValidatedTransfer = {
      params: {
        token: "eth:0x1234567890123456789012345678901234567890",
        amount: 1000000000000000000n,
        fee: 0n,
        nativeFee: 0n,
        sender: "eth:0xABCDEF0123456789ABCDEF0123456789ABCDEF01",
        recipient: "near:alice.testnet",
        message: "Hello from Ethereum!",
      },
      sourceChain: ChainKind.Eth,
      destChain: ChainKind.Near,
      normalizedAmount: 1000000000000000000n,
      normalizedFee: 0n,
      contractAddress: "0x1111111111111111111111111111111111111111",
    }

    const tx = builder.buildTransfer(validated)

    // Message is encoded in the data
    expect(tx.data.length).toBeGreaterThan(100)
  })
})

describe("EvmBuilder.buildApproval", () => {
  let builder: EvmBuilder

  beforeEach(() => {
    builder = createEvmBuilder({ network: "testnet" })
  })

  it("builds approval transaction", () => {
    const tx = builder.buildApproval(
      "0x1234567890123456789012345678901234567890",
      "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", // Valid checksummed address
      1000000000000000000n,
    )

    expect(tx.to).toBe("0x1234567890123456789012345678901234567890")
    expect(tx.value).toBe(0n)
    expect(tx.data).toMatch(/^0x095ea7b3/) // approve(address,uint256) selector
  })

  it("builds max approval transaction", () => {
    const tx = builder.buildMaxApproval(
      "0x1234567890123456789012345678901234567890",
      "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", // Valid checksummed address
    )

    expect(tx.to).toBe("0x1234567890123456789012345678901234567890")
    expect(tx.value).toBe(0n)
    expect(tx.data).toMatch(/^0x095ea7b3/) // approve selector
    // Max uint256 value should be in the data
    expect(tx.data).toContain("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
  })
})

describe("EvmBuilder.buildFinalization", () => {
  let builder: EvmBuilder

  beforeEach(() => {
    builder = createEvmBuilder({ network: "testnet" })
  })

  it("builds finalization transaction", () => {
    const payload: TransferPayload = {
      destinationNonce: 1n,
      originChain: ChainKind.Near,
      originNonce: 123n,
      tokenAddress: "0x1234567890123456789012345678901234567890",
      amount: 1000000000000000000n,
      recipient: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", // Valid checksummed address
      feeRecipient: "relayer.near",
    }

    const signature = new Uint8Array(65).fill(1)

    const tx = builder.buildFinalization(payload, signature, 11155111)

    expect(tx.chainId).toBe(11155111)
    expect(tx.value).toBe(0n)
    expect(tx.data).toMatch(/^0x/) // Has encoded data
  })
})

describe("EvmBuilder.buildLogMetadata", () => {
  let builder: EvmBuilder

  beforeEach(() => {
    builder = createEvmBuilder({ network: "testnet" })
  })

  it("builds log metadata transaction", () => {
    const tx = builder.buildLogMetadata(
      "0x1234567890123456789012345678901234567890",
      "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      11155111,
    )

    expect(tx.to).toBe("0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB")
    expect(tx.chainId).toBe(11155111)
    expect(tx.value).toBe(0n)
    expect(tx.data).toMatch(/^0x/)
  })
})

describe("EvmBuilder.buildDeployToken", () => {
  let builder: EvmBuilder

  beforeEach(() => {
    builder = createEvmBuilder({ network: "testnet" })
  })

  it("builds deploy token transaction", () => {
    const metadata: TokenMetadata = {
      token: "near:wrap.testnet",
      name: "Wrapped NEAR",
      symbol: "wNEAR",
      decimals: 24,
    }

    const signature = new Uint8Array(65).fill(2)

    const tx = builder.buildDeployToken(
      signature,
      metadata,
      "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
      11155111,
    )

    expect(tx.to).toBe("0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC")
    expect(tx.chainId).toBe(11155111)
    expect(tx.value).toBe(0n)
    expect(tx.data).toMatch(/^0x/)
  })
})

// Import beforeEach
import { beforeEach } from "vitest"
