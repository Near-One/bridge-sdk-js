import { describe, expect, it } from "vitest"
import type { EvmProof } from "../types"
import { ProofGenerator } from "./evm"

describe("ProofGenerator", () => {
  const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

  const formatProof = (proof: EvmProof) => ({
    log_index: proof.log_index.toString(),
    receipt_index: proof.receipt_index.toString(),
    receipt_data: Buffer.from(proof.receipt_data).toString("hex"),
    log_entry_data: Buffer.from(proof.log_entry_data).toString("hex"),
    header_data: Buffer.from(proof.header_data).toString("hex"),
    proof: proof.proof.map((p: WithImplicitCoercion<ArrayBuffer | SharedArrayBuffer>) =>
      Buffer.from(p).toString("hex"),
    ),
  })

  it("should generate proof for pre-Shapella transaction", async () => {
    const proofGenerator = new ProofGenerator("ethereum")
    const txHash = "0xc4a6c5cde1d243b26b013f805f71f6de91536f66c993abfee746f373203b68cc"

    const proof = await proofGenerator.generateProof(txHash, ERC20_TRANSFER_TOPIC)
    expect(formatProof(proof)).toMatchSnapshot()
  })

  it("should generate proof for post-Shapella transaction", async () => {
    const proofGenerator = new ProofGenerator("ethereum")
    const txHash = "0xd6ae351d6946f98c4b63589e2154db668e703e8c09fbd4e5c6807b5d356453c3"

    const proof = await proofGenerator.generateProof(txHash, ERC20_TRANSFER_TOPIC)
    expect(formatProof(proof)).toMatchSnapshot()
  })

  it("should generate proof for post-Dencun transaction", async () => {
    const proofGenerator = new ProofGenerator("ethereum")
    const txHash = "0x42639810a1238a76ca947b848f5b88a854ac36471d1c4f6a15631393790f89af"

    const proof = await proofGenerator.generateProof(txHash, ERC20_TRANSFER_TOPIC)
    expect(formatProof(proof)).toMatchSnapshot()
  })

  it("should throw error for non-existent transaction", async () => {
    const proofGenerator = new ProofGenerator("ethereum")
    const txHash = "0x0000000000000000000000000000000000000000000000000000000000000000"

    await expect(proofGenerator.generateProof(txHash, ERC20_TRANSFER_TOPIC)).rejects.toThrow(
      "Transaction receipt not found on ethereum",
    )
  })

  it("should throw error for invalid topic", async () => {
    const proofGenerator = new ProofGenerator("ethereum")
    const txHash = "0xc4a6c5cde1d243b26b013f805f71f6de91536f66c993abfee746f373203b68cc"
    const invalidTopic = "0x0000000000000000000000000000000000000000000000000000000000000000"

    await expect(proofGenerator.generateProof(txHash, invalidTopic)).rejects.toThrow(
      "Log entry not found for the given topic",
    )
  })

  it("should throw error for unsupported network", () => {
    // biome-ignore lint/suspicious/noExplicitAny: Testing purposes
    expect(() => new ProofGenerator("invalid" as any)).toThrow("Unsupported network: invalid")
  })
})
