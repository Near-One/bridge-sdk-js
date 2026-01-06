/**
 * Solana transaction builder for Omni Bridge
 */

import { Program } from "@coral-xyz/anchor"
import { sha256 } from "@noble/hashes/sha2.js"
import {
  ChainKind,
  getAddresses,
  getChain,
  type Network,
  type OmniAddress,
  type ValidatedTransfer,
} from "@omni-bridge/core"
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token"
import {
  Connection,
  type ParsedAccountData,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js"
import BN from "bn.js"

import type { BridgeTokenFactory } from "./idl.js"
// biome-ignore lint/correctness/useImportExtensions: JSON imports require .json extension
import BRIDGE_TOKEN_FACTORY_IDL from "./idl.json" with { type: "json" }
import type {
  SolanaDepositPayload,
  SolanaMPCSignature,
  SolanaTokenMetadata,
  SolanaTransferMessagePayload,
} from "./types.js"

const MPL_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")

/**
 * Default RPC endpoints per network
 */
const DEFAULT_RPC_URLS: Record<Network, string> = {
  mainnet: "https://api.mainnet-beta.solana.com",
  testnet: "https://api.devnet.solana.com",
}

export interface SolanaBuilderConfig {
  network: Network
  /** Optional - uses public RPC endpoint if not provided */
  connection?: Connection
}

/**
 * Solana transaction builder interface
 */
export interface SolanaBuilder {
  /**
   * Build transfer instructions for bridging tokens from Solana
   */
  buildTransfer(validated: ValidatedTransfer, payer: PublicKey): Promise<TransactionInstruction[]>

  /**
   * Build finalization instructions for receiving tokens on Solana
   */
  buildFinalization(
    payload: SolanaTransferMessagePayload,
    signature: SolanaMPCSignature,
    payer: PublicKey,
  ): Promise<TransactionInstruction[]>

  /**
   * Build log metadata instructions for registering a token
   */
  buildLogMetadata(token: PublicKey, payer: PublicKey): Promise<TransactionInstruction[]>

  /**
   * Build deploy token instructions for deploying a wrapped token
   */
  buildDeployToken(
    signature: SolanaMPCSignature,
    metadata: SolanaTokenMetadata,
    payer: PublicKey,
  ): Promise<TransactionInstruction[]>

  /**
   * Derive the config PDA
   */
  deriveConfig(): PublicKey

  /**
   * Derive the authority PDA
   */
  deriveAuthority(): PublicKey

  /**
   * Derive wrapped mint PDA for a token
   */
  deriveWrappedMint(token: string): PublicKey

  /**
   * Derive vault PDA for a mint
   */
  deriveVault(mint: PublicKey): PublicKey

  /**
   * Derive SOL vault PDA
   */
  deriveSolVault(): PublicKey
}

/**
 * Get a constant from the IDL
 */
function getConstant(name: string): Uint8Array {
  const value = BRIDGE_TOKEN_FACTORY_IDL.constants.find(
    (c: { name: string }) => c.name === name,
  )?.value
  if (!value) throw new Error(`Missing constant: ${name}`)
  const numbers = JSON.parse(value as string)
  return new Uint8Array(numbers)
}

const SEEDS = {
  CONFIG: getConstant("CONFIG_SEED"),
  AUTHORITY: getConstant("AUTHORITY_SEED"),
  WRAPPED_MINT: getConstant("WRAPPED_MINT_SEED"),
  VAULT: getConstant("VAULT_SEED"),
  SOL_VAULT: getConstant("SOL_VAULT_SEED"),
  USED_NONCES: getConstant("USED_NONCES_SEED"),
}

const USED_NONCES_PER_ACCOUNT = 1024

/**
 * Hash token address if longer than 32 bytes (mirrors Anchor program logic)
 */
function tokenSeedBytes(token: string): Uint8Array {
  const tokenBytes = new TextEncoder().encode(token)
  if (tokenBytes.length > 32) {
    return sha256(tokenBytes)
  }
  const padded = new Uint8Array(32)
  padded.set(tokenBytes)
  return padded
}

/**
 * Extract address from OmniAddress format (e.g., "sol:...")
 */
function extractSolanaAddress(address: OmniAddress | string): string {
  if (getChain(address as OmniAddress) !== ChainKind.Sol) {
    throw new Error("Address must be on Solana")
  }
  const parts = address.split(":")
  const solAddress = parts[1]
  if (!solAddress) {
    throw new Error("Invalid Solana address format")
  }
  return solAddress
}

class SolanaBuilderImpl implements SolanaBuilder {
  private readonly connection: Connection
  private readonly programId: PublicKey
  private readonly wormholeProgramId: PublicKey
  private readonly shimProgramId: PublicKey
  private readonly eventAuthorityId: PublicKey

  constructor(config: SolanaBuilderConfig) {
    this.connection = config.connection ?? new Connection(DEFAULT_RPC_URLS[config.network])

    const addresses = getAddresses(config.network)
    this.programId = new PublicKey(addresses.sol.locker)
    this.wormholeProgramId = new PublicKey(addresses.sol.wormhole)
    this.shimProgramId = new PublicKey(addresses.sol.shimProgram)
    this.eventAuthorityId = new PublicKey(addresses.sol.eventAuthority)
  }

  private getProgram(): Program<BridgeTokenFactory> {
    const idl = BRIDGE_TOKEN_FACTORY_IDL as BridgeTokenFactory
    // @ts-expect-error Override address for network-specific deployment
    idl.address = this.programId.toBase58()
    return new Program(idl, { connection: this.connection })
  }

  deriveConfig(): PublicKey {
    const [config] = PublicKey.findProgramAddressSync([SEEDS.CONFIG], this.programId)
    return config
  }

  deriveAuthority(): PublicKey {
    const [authority] = PublicKey.findProgramAddressSync([SEEDS.AUTHORITY], this.programId)
    return authority
  }

  deriveWrappedMint(token: string): PublicKey {
    const [mint] = PublicKey.findProgramAddressSync(
      [SEEDS.WRAPPED_MINT, tokenSeedBytes(token)],
      this.programId,
    )
    return mint
  }

  deriveVault(mint: PublicKey): PublicKey {
    const [vault] = PublicKey.findProgramAddressSync([SEEDS.VAULT, mint.toBuffer()], this.programId)
    return vault
  }

  deriveSolVault(): PublicKey {
    const [solVault] = PublicKey.findProgramAddressSync([SEEDS.SOL_VAULT], this.programId)
    return solVault
  }

  private deriveWormholeBridge(): PublicKey {
    const [bridge] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("Bridge")],
      this.wormholeProgramId,
    )
    return bridge
  }

  private deriveWormholeFeeCollector(): PublicKey {
    const [feeCollector] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("fee_collector")],
      this.wormholeProgramId,
    )
    return feeCollector
  }

  private deriveWormholeSequence(): PublicKey {
    const config = this.deriveConfig()
    const [sequence] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("Sequence"), config.toBuffer()],
      this.wormholeProgramId,
    )
    return sequence
  }

  private deriveShimMessage(): PublicKey {
    const config = this.deriveConfig()
    const [message] = PublicKey.findProgramAddressSync([config.toBuffer()], this.shimProgramId)
    return message
  }

  private deriveUsedNonces(destinationNonce: BN): PublicKey {
    const nonceGroup = destinationNonce.div(new BN(USED_NONCES_PER_ACCOUNT))
    const [usedNonces] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("used_nonces"), new Uint8Array(nonceGroup.toArray("le", 8))],
      this.programId,
    )
    return usedNonces
  }

  private async isBridgedToken(token: PublicKey): Promise<boolean> {
    const mintInfo = await this.connection.getParsedAccountInfo(token)

    if (!mintInfo.value) {
      throw new Error("Failed to find mint account")
    }

    const data = mintInfo.value.data as ParsedAccountData
    if (
      !data.parsed ||
      (data.program !== "spl-token" && data.program !== "spl-token-2022") ||
      data.parsed.type !== "mint"
    ) {
      throw new Error("Not a valid SPL token mint")
    }

    const authority = this.deriveAuthority()
    return (
      data.parsed.info.mintAuthority &&
      data.parsed.info.mintAuthority.toString() === authority.toString()
    )
  }

  private async getTokenProgramForMint(mint: PublicKey): Promise<PublicKey> {
    const accountInfo = await this.connection.getAccountInfo(mint)
    if (!accountInfo) {
      throw new Error("Failed to find mint account")
    }

    if (accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      return TOKEN_2022_PROGRAM_ID
    }
    return TOKEN_PROGRAM_ID
  }

  async buildTransfer(
    validated: ValidatedTransfer,
    payer: PublicKey,
  ): Promise<TransactionInstruction[]> {
    if (validated.sourceChain !== ChainKind.Sol) {
      throw new Error(`Source chain ${validated.sourceChain} is not Solana`)
    }

    const program = this.getProgram()
    const solVault = this.deriveSolVault()
    const config = this.deriveConfig()
    const authority = this.deriveAuthority()

    const tokenAddress = extractSolanaAddress(validated.params.token)
    const isNativeSol = tokenAddress === PublicKey.default.toBase58()

    const payload = {
      amount: new BN(validated.params.amount.toString()),
      recipient: validated.params.recipient,
      fee: new BN(validated.params.fee.toString()),
      nativeFee: new BN(validated.params.nativeFee.toString()),
      message: validated.params.message || "",
    }

    const commonAccounts = {
      payer,
      config,
      bridge: this.deriveWormholeBridge(),
      feeCollector: this.deriveWormholeFeeCollector(),
      sequence: this.deriveWormholeSequence(),
      clock: SYSVAR_CLOCK_PUBKEY,
      rent: SYSVAR_RENT_PUBKEY,
      systemProgram: SystemProgram.programId,
      wormholeProgram: this.wormholeProgramId,
      message: this.deriveShimMessage(),
      wormholePostMessageShim: this.shimProgramId,
      wormholePostMessageShimEa: this.eventAuthorityId,
    }

    if (isNativeSol) {
      const instruction = await program.methods
        .initTransferSol(payload)
        .accountsStrict({
          solVault,
          user: payer,
          common: commonAccounts,
        })
        .instruction()

      return [instruction]
    }

    const mint = new PublicKey(tokenAddress)
    const tokenProgram = await this.getTokenProgramForMint(mint)
    const [from] = PublicKey.findProgramAddressSync(
      [payer.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID,
    )
    const vault = (await this.isBridgedToken(mint)) ? null : this.deriveVault(mint)

    const instruction = await program.methods
      .initTransfer(payload)
      .accountsStrict({
        authority,
        mint,
        from,
        vault,
        solVault,
        user: payer,
        common: commonAccounts,
        tokenProgram,
      })
      .instruction()

    return [instruction]
  }

  async buildFinalization(
    transferMessage: SolanaTransferMessagePayload,
    signature: SolanaMPCSignature,
    payer: PublicKey,
  ): Promise<TransactionInstruction[]> {
    const program = this.getProgram()

    const originChain =
      typeof transferMessage.transfer_id.origin_chain === "string"
        ? ChainKind[transferMessage.transfer_id.origin_chain as keyof typeof ChainKind]
        : transferMessage.transfer_id.origin_chain

    const destinationNonce = new BN(transferMessage.destination_nonce.toString())
    const originNonce = new BN(transferMessage.transfer_id.origin_nonce.toString())
    const amount = new BN(transferMessage.amount.toString())

    const payload: SolanaDepositPayload = {
      destinationNonce,
      transferId: {
        originChain: Number(originChain),
        originNonce,
      },
      amount,
      feeRecipient: transferMessage.fee_recipient ?? "",
    }

    const recipientAddress = extractSolanaAddress(transferMessage.recipient)
    const tokenAddress = extractSolanaAddress(transferMessage.token_address)

    const recipientPubkey = new PublicKey(recipientAddress)
    const tokenPubkey = new PublicKey(tokenAddress)

    const config = this.deriveConfig()
    const authority = this.deriveAuthority()
    const usedNonces = this.deriveUsedNonces(destinationNonce)

    const tokenProgram = await this.getTokenProgramForMint(tokenPubkey)
    const [recipientATA] = PublicKey.findProgramAddressSync(
      [recipientPubkey.toBuffer(), tokenProgram.toBuffer(), tokenPubkey.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID,
    )

    const vault = (await this.isBridgedToken(tokenPubkey))
      ? this.programId
      : this.deriveVault(tokenPubkey)

    const commonAccounts = {
      payer,
      config,
      bridge: this.deriveWormholeBridge(),
      feeCollector: this.deriveWormholeFeeCollector(),
      sequence: this.deriveWormholeSequence(),
      clock: SYSVAR_CLOCK_PUBKEY,
      rent: SYSVAR_RENT_PUBKEY,
      systemProgram: SystemProgram.programId,
      wormholeProgram: this.wormholeProgramId,
      message: this.deriveShimMessage(),
      wormholePostMessageShim: this.shimProgramId,
      wormholePostMessageShimEa: this.eventAuthorityId,
    }

    const instruction = await program.methods
      .finalizeTransfer({
        payload,
        signature: [...signature.toBytes()],
      })
      .accountsStrict({
        usedNonces,
        authority,
        recipient: recipientPubkey,
        mint: tokenPubkey,
        vault,
        tokenAccount: recipientATA,
        common: commonAccounts,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        tokenProgram,
      })
      .instruction()

    return [instruction]
  }

  async buildLogMetadata(token: PublicKey, payer: PublicKey): Promise<TransactionInstruction[]> {
    const program = this.getProgram()

    const tokenProgram = await this.getTokenProgramForMint(token)

    const [metadata] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("metadata"), MPL_PROGRAM_ID.toBuffer(), token.toBuffer()],
      MPL_PROGRAM_ID,
    )
    const vault = this.deriveVault(token)
    const config = this.deriveConfig()
    const authority = this.deriveAuthority()

    const commonAccounts = {
      payer,
      config,
      bridge: this.deriveWormholeBridge(),
      feeCollector: this.deriveWormholeFeeCollector(),
      sequence: this.deriveWormholeSequence(),
      clock: SYSVAR_CLOCK_PUBKEY,
      rent: SYSVAR_RENT_PUBKEY,
      systemProgram: SystemProgram.programId,
      wormholeProgram: this.wormholeProgramId,
      message: this.deriveShimMessage(),
      wormholePostMessageShim: this.shimProgramId,
      wormholePostMessageShimEa: this.eventAuthorityId,
    }

    const instruction = await program.methods
      .logMetadata()
      .accountsStrict({
        authority,
        mint: token,
        metadata,
        vault,
        common: commonAccounts,
        systemProgram: SystemProgram.programId,
        tokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .instruction()

    return [instruction]
  }

  async buildDeployToken(
    signature: SolanaMPCSignature,
    metadata: SolanaTokenMetadata,
    payer: PublicKey,
  ): Promise<TransactionInstruction[]> {
    const program = this.getProgram()

    const mint = this.deriveWrappedMint(metadata.token)
    const [tokenMetadata] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("metadata"), MPL_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      MPL_PROGRAM_ID,
    )

    const config = this.deriveConfig()
    const authority = this.deriveAuthority()

    const commonAccounts = {
      payer,
      config,
      bridge: this.deriveWormholeBridge(),
      feeCollector: this.deriveWormholeFeeCollector(),
      sequence: this.deriveWormholeSequence(),
      clock: SYSVAR_CLOCK_PUBKEY,
      rent: SYSVAR_RENT_PUBKEY,
      systemProgram: SystemProgram.programId,
      wormholeProgram: this.wormholeProgramId,
      message: this.deriveShimMessage(),
      wormholePostMessageShim: this.shimProgramId,
      wormholePostMessageShimEa: this.eventAuthorityId,
    }

    const instruction = await program.methods
      .deployToken({
        payload: metadata,
        signature: [...signature.toBytes()],
      })
      .accountsStrict({
        authority,
        mint,
        metadata: tokenMetadata,
        common: commonAccounts,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenMetadataProgram: MPL_PROGRAM_ID,
      })
      .instruction()

    return [instruction]
  }
}

/**
 * Create a Solana transaction builder
 */
export function createSolanaBuilder(config: SolanaBuilderConfig): SolanaBuilder {
  return new SolanaBuilderImpl(config)
}
