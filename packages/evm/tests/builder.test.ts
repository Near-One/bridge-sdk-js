import { beforeEach, describe, expect, it } from "vitest"
import { ChainKind, type ValidatedTransfer } from "@omni-bridge/core"
import {
  createEvmBuilder,
  type EvmBuilder,
  type TokenMetadata,
  type TransferPayload,
} from "../src/builder.js"

describe("createEvmBuilder", () => {
  it("creates builder with testnet config for Ethereum", () => {
    const builder = createEvmBuilder({ network: "testnet", chain: ChainKind.Eth })
    expect(builder).toBeDefined()
    expect(builder.chainId).toBe(11155111) // Sepolia
    expect(builder.bridgeAddress).toBe("0x68a86e0Ea5B1d39F385c1326e4d493526dFe4401")
  })

  it("creates builder with mainnet config for Ethereum", () => {
    const builder = createEvmBuilder({ network: "mainnet", chain: ChainKind.Eth })
    expect(builder).toBeDefined()
    expect(builder.chainId).toBe(1)
    expect(builder.bridgeAddress).toBe("0xe00c629afaccb0510995a2b95560e446a24c85b9")
  })

  it("creates builder for Base testnet", () => {
    const builder = createEvmBuilder({ network: "testnet", chain: ChainKind.Base })
    expect(builder.chainId).toBe(84532) // Base Sepolia
    expect(builder.bridgeAddress).toBe("0xa56b860017152cD296ad723E8409Abd6e5D86d4d")
  })

  it("creates builder for Arbitrum testnet", () => {
    const builder = createEvmBuilder({ network: "testnet", chain: ChainKind.Arb })
    expect(builder.chainId).toBe(421614) // Arbitrum Sepolia
    expect(builder.bridgeAddress).toBe("0x0C981337fFe39a555d3A40dbb32f21aD0eF33FFA")
  })

  it("creates builder for BNB testnet", () => {
    const builder = createEvmBuilder({ network: "testnet", chain: ChainKind.Bnb })
    expect(builder.chainId).toBe(97) // BSC Testnet
    expect(builder.bridgeAddress).toBe("0x7Fd1E9F9ed48ebb64476ba9E06e5F1a90e31DA74")
  })

  it("creates builder for Polygon testnet", () => {
    const builder = createEvmBuilder({ network: "testnet", chain: ChainKind.Pol })
    expect(builder.chainId).toBe(80002) // Polygon Amoy
    expect(builder.bridgeAddress).toBe("0xEC81aFc3485a425347Ac03316675e58a680b283A")
  })
})

describe("EvmBuilder.buildTransfer", () => {
  let builder: EvmBuilder

  beforeEach(() => {
    builder = createEvmBuilder({ network: "testnet", chain: ChainKind.Eth })
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
      contractAddress: "0x68a86e0Ea5B1d39F385c1326e4d493526dFe4401",
    }

    const tx = builder.buildTransfer(validated)

    expect(tx.to).toBe("0x68a86e0Ea5B1d39F385c1326e4d493526dFe4401")
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
      contractAddress: "0x68a86e0Ea5B1d39F385c1326e4d493526dFe4401",
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
      contractAddress: "0x68a86e0Ea5B1d39F385c1326e4d493526dFe4401",
    }

    const tx = builder.buildTransfer(validated)

    // For native token, value = amount + nativeFee
    expect(tx.value).toBe(1000000000000000000n)
  })

  it("builds transfer for Base chain", () => {
    const baseBuilder = createEvmBuilder({ network: "testnet", chain: ChainKind.Base })

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
      contractAddress: "0xa56b860017152cD296ad723E8409Abd6e5D86d4d",
    }

    const tx = baseBuilder.buildTransfer(validated)

    expect(tx.chainId).toBe(84532) // Base Sepolia
    expect(tx.to).toBe("0xa56b860017152cD296ad723E8409Abd6e5D86d4d")
  })

  it("builds transfer for Arbitrum chain", () => {
    const arbBuilder = createEvmBuilder({ network: "testnet", chain: ChainKind.Arb })

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
      contractAddress: "0x0C981337fFe39a555d3A40dbb32f21aD0eF33FFA",
    }

    const tx = arbBuilder.buildTransfer(validated)

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

  it("throws when source chain doesn't match builder chain", () => {
    const validated: ValidatedTransfer = {
      params: {
        token: "base:0x1234567890123456789012345678901234567890",
        amount: 1000000n,
        fee: 0n,
        nativeFee: 0n,
        sender: "base:0xABCDEF0123456789ABCDEF0123456789ABCDEF01",
        recipient: "near:alice.testnet",
      },
      sourceChain: ChainKind.Base, // Doesn't match Eth builder
      destChain: ChainKind.Near,
      normalizedAmount: 1000000n,
      normalizedFee: 0n,
      contractAddress: "0xa56b860017152cD296ad723E8409Abd6e5D86d4d",
    }

    expect(() => builder.buildTransfer(validated)).toThrow("does not match builder chain")
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
      contractAddress: "0x68a86e0Ea5B1d39F385c1326e4d493526dFe4401",
    }

    const tx = builder.buildTransfer(validated)

    // Message is encoded in the data
    expect(tx.data.length).toBeGreaterThan(100)
  })
})

describe("EvmBuilder.buildApproval", () => {
  let builder: EvmBuilder

  beforeEach(() => {
    builder = createEvmBuilder({ network: "testnet", chain: ChainKind.Eth })
  })

  it("builds approval transaction for bridge contract", () => {
    const tx = builder.buildApproval(
      "0x1234567890123456789012345678901234567890",
      1000000000000000000n,
    )

    expect(tx.to).toBe("0x1234567890123456789012345678901234567890")
    expect(tx.chainId).toBe(11155111) // Sepolia
    expect(tx.value).toBe(0n)
    expect(tx.data).toMatch(/^0x095ea7b3/) // approve(address,uint256) selector
    // Verify bridge address is in the approval data
    expect(tx.data.toLowerCase()).toContain("68a86e0ea5b1d39f385c1326e4d493526dfe4401")
  })

  it("builds max approval transaction for bridge contract", () => {
    const tx = builder.buildMaxApproval("0x1234567890123456789012345678901234567890")

    expect(tx.to).toBe("0x1234567890123456789012345678901234567890")
    expect(tx.chainId).toBe(11155111) // Sepolia
    expect(tx.value).toBe(0n)
    expect(tx.data).toMatch(/^0x095ea7b3/) // approve selector
    // Max uint256 value should be in the data
    expect(tx.data).toContain("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
  })
})

describe("EvmBuilder.buildFinalization", () => {
  let builder: EvmBuilder

  beforeEach(() => {
    builder = createEvmBuilder({ network: "testnet", chain: ChainKind.Eth })
  })

  it("builds finalization transaction", () => {
    const payload: TransferPayload = {
      destinationNonce: 1n,
      originChain: ChainKind.Near,
      originNonce: 123n,
      tokenAddress: "0x1234567890123456789012345678901234567890",
      amount: 1000000000000000000n,
      recipient: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      feeRecipient: "relayer.near",
    }

    const signature = new Uint8Array(65).fill(1)

    const tx = builder.buildFinalization(payload, signature)

    expect(tx.chainId).toBe(11155111) // Sepolia
    expect(tx.to).toBe("0x68a86e0Ea5B1d39F385c1326e4d493526dFe4401") // Bridge address
    expect(tx.value).toBe(0n)
    expect(tx.data).toMatch(/^0x/) // Has encoded data
  })
})

describe("EvmBuilder.buildLogMetadata", () => {
  let builder: EvmBuilder

  beforeEach(() => {
    builder = createEvmBuilder({ network: "testnet", chain: ChainKind.Eth })
  })

  it("builds log metadata transaction", () => {
    const tx = builder.buildLogMetadata("0x1234567890123456789012345678901234567890")

    expect(tx.to).toBe("0x68a86e0Ea5B1d39F385c1326e4d493526dFe4401") // Bridge address
    expect(tx.chainId).toBe(11155111) // Sepolia
    expect(tx.value).toBe(0n)
    expect(tx.data).toMatch(/^0x/)
  })
})

describe("EvmBuilder.buildDeployToken", () => {
  let builder: EvmBuilder

  beforeEach(() => {
    builder = createEvmBuilder({ network: "testnet", chain: ChainKind.Eth })
  })

  it("builds deploy token transaction", () => {
    const metadata: TokenMetadata = {
      token: "near:wrap.testnet",
      name: "Wrapped NEAR",
      symbol: "wNEAR",
      decimals: 24,
    }

    const signature = new Uint8Array(65).fill(2)

    const tx = builder.buildDeployToken(signature, metadata)

    expect(tx.to).toBe("0x68a86e0Ea5B1d39F385c1326e4d493526dFe4401") // Bridge address
    expect(tx.chainId).toBe(11155111) // Sepolia
    expect(tx.value).toBe(0n)
    expect(tx.data).toMatch(/^0x/)
  })
})
