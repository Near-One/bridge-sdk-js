import { Program, type Provider, web3 } from "@coral-xyz/anchor"
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token"
import {
  Keypair,
  type ParsedAccountData,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
} from "@solana/web3.js"
import { BN } from "bn.js"
import { addresses } from "../config.js"
import {
  ChainKind,
  type DepositPayload,
  type MPCSignature,
  type OmniAddress,
  type OmniTransferMessage,
  type TokenMetadata,
  type TransferMessagePayload,
} from "../types/index.js"
import type { BridgeTokenFactory } from "../types/solana/bridge_token_factory.js"
import BRIDGE_TOKEN_FACTORY_IDL from "../types/solana/bridge_token_factory.json" with {
  type: "json",
}
import type { BridgeTokenFactory as BridgeTokenFactoryShim } from "../types/solana/bridge_token_factory_shim.js"
import BRIDGE_TOKEN_FACTORY_SHIM_IDL from "../types/solana/bridge_token_factory_shim.json" with {
  type: "json",
}
import { getChain } from "../utils/index.js"

const MPL_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")

// Version detection constants
const GET_VERSION_DISCRIMINATOR = new Uint8Array([168, 85, 244, 45, 81, 56, 130, 50])
const OLD_WORMHOLE_VERSION = "0.2.4"

export class SolanaBridgeClient {
  private readonly wormholeProgramId: PublicKey
  private readonly shimProgramId: PublicKey
  private readonly eventAuthorityId: PublicKey
  private readonly program: Program<BridgeTokenFactory>
  private readonly shimProgram: Program<BridgeTokenFactoryShim>
  private cachedVersion: string | null = null

  private static getConstant(name: string) {
    const value = (BRIDGE_TOKEN_FACTORY_IDL as BridgeTokenFactory).constants.find(
      (c) => c.name === name,
    )?.value
    if (!value) throw new Error(`Missing constant: ${name}`)
    // Parse the string array format "[x, y, z]" into actual numbers
    const numbers = JSON.parse(value as string)
    return new Uint8Array(numbers)
  }

  private static readonly SEEDS = {
    CONFIG: this.getConstant("CONFIG_SEED"),
    AUTHORITY: this.getConstant("AUTHORITY_SEED"),
    WRAPPED_MINT: this.getConstant("WRAPPED_MINT_SEED"),
    VAULT: this.getConstant("VAULT_SEED"),
    SOL_VAULT: this.getConstant("SOL_VAULT_SEED"),
  }

  constructor(
    provider: Provider,
    wormholeProgramId: PublicKey = new PublicKey(addresses.sol.wormhole),
    shimProgramId: PublicKey = new PublicKey(addresses.sol.shimProgram),
    eventAuthorityId: PublicKey = new PublicKey(addresses.sol.eventAuthority),
  ) {
    this.wormholeProgramId = wormholeProgramId
    this.shimProgramId = shimProgramId
    this.eventAuthorityId = eventAuthorityId
    const bridgeTokenFactory = BRIDGE_TOKEN_FACTORY_IDL as BridgeTokenFactory
    // @ts-expect-error We have to override the address for Mainnet/Testnet
    bridgeTokenFactory.address = addresses.sol.locker
    this.program = new Program(bridgeTokenFactory, provider)

    // Initialize shim program
    const bridgeTokenFactoryShim = BRIDGE_TOKEN_FACTORY_SHIM_IDL as BridgeTokenFactoryShim
    // @ts-expect-error We have to override the address for Mainnet/Testnet
    bridgeTokenFactoryShim.address = addresses.sol.locker
    this.shimProgram = new Program(bridgeTokenFactoryShim, provider)
  }

  private config(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SolanaBridgeClient.SEEDS.CONFIG],
      this.program.programId,
    )
  }

  private authority(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SolanaBridgeClient.SEEDS.AUTHORITY],
      this.program.programId,
    )
  }

  private wormholeBridgeId(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("Bridge", "utf-8")],
      this.wormholeProgramId,
    )
  }

  private wormholeFeeCollectorId(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("fee_collector", "utf-8")],
      this.wormholeProgramId,
    )
  }

  private wormholeSequenceId(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("Sequence", "utf-8"), this.config()[0].toBuffer()],
      this.wormholeProgramId,
    )
  }

  private wrappedMintId(token: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SolanaBridgeClient.SEEDS.WRAPPED_MINT, Buffer.from(token, "utf-8")],
      this.program.programId,
    )
  }

  private vaultId(mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SolanaBridgeClient.SEEDS.VAULT, mint.toBuffer()],
      this.program.programId,
    )
  }

  private solVaultId(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SolanaBridgeClient.SEEDS.SOL_VAULT],
      this.program.programId,
    )
  }

  private shimMessageId(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([this.config()[0].toBuffer()], this.shimProgramId)
  }

  /**
   * Gets the version of the Solana bridge program
   * @returns Promise resolving to program version string
   */
  async getVersion(): Promise<string> {
    if (this.cachedVersion) {
      return this.cachedVersion
    }

    try {
      const instruction = new web3.TransactionInstruction({
        keys: [],
        programId: this.program.programId,
        data: Buffer.from(GET_VERSION_DISCRIMINATOR),
      })

      const transaction = new web3.Transaction().add(instruction)
      const { blockhash } = await this.program.provider.connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = this.program.provider.publicKey

      const simulation = await this.program.provider.connection.simulateTransaction(
        transaction,
        undefined,
        false,
      )

      if (simulation.value.err) {
        throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`)
      }

      const returnData = simulation.value.returnData
      if (!returnData) {
        throw new Error("No return data from get_version")
      }

      const rawData = Buffer.from(returnData.data[0], "base64")
      if (rawData.length < 4) {
        throw new Error("Return data too short")
      }

      const length = rawData.readUInt32LE(0)
      if (rawData.length < 4 + length) {
        throw new Error("Return data length mismatch")
      }

      const version = rawData.subarray(4, 4 + length).toString("utf-8")
      this.cachedVersion = version
      return version
    } catch (_error) {
      // If get_version fails, assume it's an old program version
      this.cachedVersion = OLD_WORMHOLE_VERSION
      return OLD_WORMHOLE_VERSION
    }
  }

  /**
   * Detects if the bridge program supports the wormhole shim
   * @returns Promise<boolean> true if shim is supported
   */
  private async supportsWormholeShim(): Promise<boolean> {
    const version = await this.getVersion()
    return version !== OLD_WORMHOLE_VERSION
  }

  /**
   * Logs metadata for a token using the wormhole shim
   * @param token - The token's public key
   * @param payer - Optional payer keypair
   * @returns Promise resolving to transaction signature
   */
  async logMetadataWithShim(token: OmniAddress, payer?: Keypair): Promise<string> {
    const tokenPublicKey = new PublicKey(token.split(":")[1])
    const tokenProgram = await this.getTokenProgramForMint(tokenPublicKey)

    const [metadata] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata", "utf-8"), MPL_PROGRAM_ID.toBuffer(), tokenPublicKey.toBuffer()],
      MPL_PROGRAM_ID,
    )
    const [vault] = this.vaultId(tokenPublicKey)

    try {
      const tx = await this.shimProgram.methods
        .logMetadata()
        .accountsStrict({
          authority: this.authority()[0],
          mint: tokenPublicKey,
          metadata,
          vault,
          common: {
            payer: payer?.publicKey || this.shimProgram.provider.publicKey,
            config: this.config()[0],
            bridge: this.wormholeBridgeId()[0],
            feeCollector: this.wormholeFeeCollectorId()[0],
            sequence: this.wormholeSequenceId()[0],
            clock: SYSVAR_CLOCK_PUBKEY,
            rent: SYSVAR_RENT_PUBKEY,
            systemProgram: SystemProgram.programId,
            wormholeProgram: this.wormholeProgramId,
            message: this.shimMessageId()[0],
            wormholePostMessageShim: this.shimProgramId,
            wormholePostMessageShimEa: this.eventAuthorityId,
          },
          systemProgram: SystemProgram.programId,
          tokenProgram: tokenProgram,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers(payer instanceof Keypair ? [payer] : [])
        .rpc()

      return tx
    } catch (e) {
      throw new Error(`Failed to log metadata with shim: ${e}`)
    }
  }

  /**
   * Deploys a new wrapped token using the wormhole shim
   * @param signature - MPC signature authorizing the deployment
   * @param tokenMetadata - Token metadata
   * @param payer - Optional payer public key
   * @returns Promise resolving to transaction hash and token address
   */
  async deployTokenWithShim(
    signature: MPCSignature,
    payload: TokenMetadata,
    payer?: Keypair,
  ): Promise<{ txHash: string; tokenAddress: string }> {
    const [mint] = this.wrappedMintId(payload.token)
    const [metadata] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata", "utf-8"), MPL_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      MPL_PROGRAM_ID,
    )

    try {
      const tx = await this.shimProgram.methods
        .deployToken({
          payload,
          signature: [...signature.toBytes()],
        })
        .accountsStrict({
          authority: this.authority()[0],
          common: {
            payer: payer?.publicKey || this.shimProgram.provider.publicKey,
            config: this.config()[0],
            bridge: this.wormholeBridgeId()[0],
            feeCollector: this.wormholeFeeCollectorId()[0],
            sequence: this.wormholeSequenceId()[0],
            clock: SYSVAR_CLOCK_PUBKEY,
            rent: SYSVAR_RENT_PUBKEY,
            systemProgram: SystemProgram.programId,
            wormholeProgram: this.wormholeProgramId,
            message: this.shimMessageId()[0],
            wormholePostMessageShim: this.shimProgramId,
            wormholePostMessageShimEa: this.eventAuthorityId,
          },
          metadata,
          systemProgram: SystemProgram.programId,
          mint,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenMetadataProgram: MPL_PROGRAM_ID,
        })
        .signers(payer instanceof Keypair ? [payer] : [])
        .rpc()

      return {
        txHash: tx,
        tokenAddress: mint.toString(),
      }
    } catch (e) {
      throw new Error(`Failed to deploy token with shim: ${e}`)
    }
  }

  /**
   * Transfers SPL tokens to the bridge contract using the wormhole shim
   * @param transfer - Transfer message details
   * @param payer - Optional payer keypair
   * @returns Promise resolving to transaction hash
   */
  async initTransferWithShim(transfer: OmniTransferMessage, payer?: Keypair): Promise<string> {
    if (getChain(transfer.tokenAddress) !== ChainKind.Sol) {
      throw new Error("Token address must be on Solana")
    }

    const payerPubKey = payer?.publicKey || this.program.provider.publicKey
    if (!payerPubKey) {
      throw new Error("Payer is not configured")
    }
    const [solVault] = this.solVaultId()

    if (transfer.tokenAddress === `sol:${PublicKey.default.toBase58()}`) {
      // SOL transfers
      const method = this.shimProgram.methods
        .initTransferSol({
          amount: new BN(transfer.amount.valueOf().toString()),
          recipient: transfer.recipient,
          fee: new BN(transfer.fee.valueOf().toString()),
          nativeFee: new BN(transfer.nativeFee.valueOf().toString()),
          message: transfer.message || "",
        })
        .accountsStrict({
          solVault,
          user: payerPubKey,
          common: {
            payer: payerPubKey,
            config: this.config()[0],
            bridge: this.wormholeBridgeId()[0],
            feeCollector: this.wormholeFeeCollectorId()[0],
            sequence: this.wormholeSequenceId()[0],
            clock: SYSVAR_CLOCK_PUBKEY,
            rent: SYSVAR_RENT_PUBKEY,
            systemProgram: SystemProgram.programId,
            wormholeProgram: this.wormholeProgramId,
            message: this.shimMessageId()[0],
            wormholePostMessageShim: this.shimProgramId,
            wormholePostMessageShimEa: this.eventAuthorityId,
          },
        })

      try {
        const tx = await method.signers(payer instanceof Keypair ? [payer] : []).rpc()
        return tx
      } catch (e) {
        throw new Error(`Failed to init SOL transfer with shim: ${e}`)
      }
    } else {
      // SPL token transfers
      const mint = new PublicKey(transfer.tokenAddress.split(":")[1])
      const tokenProgram = await this.getTokenProgramForMint(mint)
      const [from] = PublicKey.findProgramAddressSync(
        [payerPubKey.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
        ASSOCIATED_TOKEN_PROGRAM_ID,
      )
      const vault = (await this.isBridgedToken(mint)) ? null : this.vaultId(mint)[0]

      const method = this.shimProgram.methods
        .initTransfer({
          amount: new BN(transfer.amount.valueOf().toString()),
          recipient: transfer.recipient,
          fee: new BN(transfer.fee.valueOf().toString()),
          nativeFee: new BN(transfer.nativeFee.valueOf().toString()),
          message: transfer.message || "",
        })
        .accountsStrict({
          authority: this.authority()[0],
          mint,
          from,
          vault,
          solVault,
          user: payerPubKey,
          common: {
            payer: payerPubKey,
            config: this.config()[0],
            bridge: this.wormholeBridgeId()[0],
            feeCollector: this.wormholeFeeCollectorId()[0],
            sequence: this.wormholeSequenceId()[0],
            clock: SYSVAR_CLOCK_PUBKEY,
            rent: SYSVAR_RENT_PUBKEY,
            systemProgram: SystemProgram.programId,
            wormholeProgram: this.wormholeProgramId,
            message: this.shimMessageId()[0],
            wormholePostMessageShim: this.shimProgramId,
            wormholePostMessageShimEa: this.eventAuthorityId,
          },
          tokenProgram: tokenProgram,
        })

      try {
        const tx = await method.signers(payer instanceof Keypair ? [payer] : []).rpc()
        return tx
      } catch (e) {
        throw new Error(`Failed to init token transfer with shim: ${e}`)
      }
    }
  }

  /**
   * Logs metadata for a token
   * @param token - The token's public key
   * @param payer - Optional payer keypair
   * @returns Promise resolving to transaction signature
   */
  async logMetadata(token: OmniAddress, payer?: Keypair): Promise<string> {
    const supportsShim = await this.supportsWormholeShim()

    if (supportsShim) {
      return this.logMetadataWithShim(token, payer)
    }

    return this.logMetadataLegacy(token, payer)
  }

  /**
   * Logs metadata for a token using legacy approach
   * @param token - The token's public key
   * @param payer - Optional payer keypair
   * @returns Promise resolving to transaction signature
   */
  private async logMetadataLegacy(token: OmniAddress, payer?: Keypair): Promise<string> {
    const tokenPublicKey = new PublicKey(token.split(":")[1])
    const tokenProgram = await this.getTokenProgramForMint(tokenPublicKey)

    const wormholeMessage = Keypair.generate()
    const [metadata] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata", "utf-8"), MPL_PROGRAM_ID.toBuffer(), tokenPublicKey.toBuffer()],
      MPL_PROGRAM_ID,
    )
    const [vault] = this.vaultId(tokenPublicKey)

    try {
      const tx = await this.program.methods
        .logMetadata()
        .accountsStrict({
          authority: this.authority()[0],
          mint: tokenPublicKey,
          metadata,
          vault,
          common: {
            payer: payer?.publicKey || this.program.provider.publicKey,
            config: this.config()[0],
            bridge: this.wormholeBridgeId()[0],
            feeCollector: this.wormholeFeeCollectorId()[0],
            sequence: this.wormholeSequenceId()[0],
            clock: SYSVAR_CLOCK_PUBKEY,
            rent: SYSVAR_RENT_PUBKEY,
            systemProgram: SystemProgram.programId,
            wormholeProgram: this.wormholeProgramId,
            message: wormholeMessage.publicKey,
          },
          systemProgram: SystemProgram.programId,
          tokenProgram: tokenProgram,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers(payer instanceof Keypair ? [wormholeMessage, payer] : [wormholeMessage])
        .rpc()

      return tx
    } catch (e) {
      throw new Error(`Failed to log metadata: ${e}`)
    }
  }

  /**
   * Deploys a new wrapped token
   * @param signature - MPC signature authorizing the deployment
   * @param tokenMetadata - Token metadata
   * @param payer - Optional payer public key
   * @returns Promise resolving to transaction hash and token address
   */
  async deployToken(
    signature: MPCSignature,
    payload: TokenMetadata,
    payer?: Keypair,
  ): Promise<{ txHash: string; tokenAddress: string }> {
    const supportsShim = await this.supportsWormholeShim()

    if (supportsShim) {
      return this.deployTokenWithShim(signature, payload, payer)
    }

    return this.deployTokenLegacy(signature, payload, payer)
  }

  /**
   * Deploys a new wrapped token using legacy approach
   * @param signature - MPC signature authorizing the deployment
   * @param tokenMetadata - Token metadata
   * @param payer - Optional payer public key
   * @returns Promise resolving to transaction hash and token address
   */
  private async deployTokenLegacy(
    signature: MPCSignature,
    payload: TokenMetadata,
    payer?: Keypair,
  ): Promise<{ txHash: string; tokenAddress: string }> {
    const wormholeMessage = Keypair.generate()
    const [mint] = this.wrappedMintId(payload.token)
    const [metadata] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata", "utf-8"), MPL_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      MPL_PROGRAM_ID,
    )

    try {
      const tx = await this.program.methods
        .deployToken({
          payload,
          signature: [...signature.toBytes()],
        })
        .accountsStrict({
          authority: this.authority()[0],
          common: {
            payer: payer?.publicKey || this.program.provider.publicKey,
            config: this.config()[0],
            bridge: this.wormholeBridgeId()[0],
            feeCollector: this.wormholeFeeCollectorId()[0],
            sequence: this.wormholeSequenceId()[0],
            clock: SYSVAR_CLOCK_PUBKEY,
            rent: SYSVAR_RENT_PUBKEY,
            systemProgram: SystemProgram.programId,
            wormholeProgram: this.wormholeProgramId,
            message: wormholeMessage.publicKey,
          },
          metadata,
          systemProgram: SystemProgram.programId,
          mint,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenMetadataProgram: MPL_PROGRAM_ID,
        })
        .signers(payer instanceof Keypair ? [wormholeMessage, payer] : [wormholeMessage])
        .rpc()

      return {
        txHash: tx,
        tokenAddress: mint.toString(),
      }
    } catch (e) {
      throw new Error(`Failed to deploy token: ${e}`)
    }
  }

  /**
   * Transfers SPL tokens to the bridge contract on Solana.
   * This transaction generates a proof that is subsequently used to mint/unlock
   * corresponding tokens on the destination chain.
   *
   * @param token - Omni address of the SPL token to transfer
   * @param recipient - Recipient's Omni address on the destination chain where tokens will be minted
   * @param amount - Amount of the tokens to transfer
   * @throws {Error} If token address is not on Solana
   * @returns Promise resolving to transaction hash
   */
  async initTransfer(transfer: OmniTransferMessage, payer?: Keypair): Promise<string> {
    const supportsShim = await this.supportsWormholeShim()

    if (supportsShim) {
      return this.initTransferWithShim(transfer, payer)
    }

    return this.initTransferLegacy(transfer, payer)
  }

  /**
   * Transfers SPL tokens to the bridge contract using legacy approach
   * @param transfer - Transfer message details
   * @param payer - Optional payer keypair
   * @returns Promise resolving to transaction hash
   */
  private async initTransferLegacy(
    transfer: OmniTransferMessage,
    payer?: Keypair,
  ): Promise<string> {
    if (getChain(transfer.tokenAddress) !== ChainKind.Sol) {
      throw new Error("Token address must be on Solana")
    }
    const wormholeMessage = Keypair.generate()

    const payerPubKey = payer?.publicKey || this.program.provider.publicKey
    if (!payerPubKey) {
      throw new Error("Payer is not configured")
    }
    const [solVault] = this.solVaultId()

    // biome-ignore lint/suspicious/noExplicitAny: initTransfer or initTransferSol
    let method: any
    if (transfer.tokenAddress === `sol:${PublicKey.default.toBase58()}`) {
      method = this.program.methods
        .initTransferSol({
          amount: new BN(transfer.amount.valueOf().toString()),
          recipient: transfer.recipient,
          fee: new BN(transfer.fee.valueOf().toString()),
          nativeFee: new BN(transfer.nativeFee.valueOf().toString()),
          message: transfer.message || "",
        })
        .accountsStrict({
          solVault,
          user: payerPubKey,
          common: {
            payer: payerPubKey,
            config: this.config()[0],
            bridge: this.wormholeBridgeId()[0],
            feeCollector: this.wormholeFeeCollectorId()[0],
            sequence: this.wormholeSequenceId()[0],
            clock: SYSVAR_CLOCK_PUBKEY,
            rent: SYSVAR_RENT_PUBKEY,
            systemProgram: SystemProgram.programId,
            wormholeProgram: this.wormholeProgramId,
            message: wormholeMessage.publicKey,
          },
        })
    } else {
      const mint = new PublicKey(transfer.tokenAddress.split(":")[1])
      const tokenProgram = await this.getTokenProgramForMint(mint)
      const [from] = PublicKey.findProgramAddressSync(
        [payerPubKey.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
        ASSOCIATED_TOKEN_PROGRAM_ID,
      )
      const vault = (await this.isBridgedToken(mint))
        ? this.program.programId
        : this.vaultId(mint)[0]

      method = this.program.methods
        .initTransfer({
          amount: new BN(transfer.amount.valueOf().toString()),
          recipient: transfer.recipient,
          fee: new BN(transfer.fee.valueOf().toString()),
          nativeFee: new BN(transfer.nativeFee.valueOf().toString()),
          message: transfer.message || "",
        })
        .accountsStrict({
          authority: this.authority()[0],
          mint,
          from,
          vault,
          solVault,
          user: payerPubKey,
          common: {
            payer: payerPubKey,
            config: this.config()[0],
            bridge: this.wormholeBridgeId()[0],
            feeCollector: this.wormholeFeeCollectorId()[0],
            sequence: this.wormholeSequenceId()[0],
            clock: SYSVAR_CLOCK_PUBKEY,
            rent: SYSVAR_RENT_PUBKEY,
            systemProgram: SystemProgram.programId,
            wormholeProgram: this.wormholeProgramId,
            message: wormholeMessage.publicKey,
          },
          tokenProgram: tokenProgram,
        })
    }

    try {
      const tx = await method
        .signers(payer instanceof Keypair ? [wormholeMessage, payer] : [wormholeMessage])
        .rpc()

      return tx
    } catch (e) {
      throw new Error(`Failed to init transfer: ${e}`)
    }
  }

  /**
   * Finalizes a token transfer on Solana by processing the transfer message and signature.
   * This function handles both bridged tokens (tokens that originate from another chain) and
   * native Solana tokens.
   *
   * @param transferMessage - The payload containing transfer details including:
   *   - destination_nonce: Unique identifier for the transfer on the destination chain
   *   - transfer_id: Object containing origin chain ID and nonce
   *   - token_address: The token's Omni address
   *   - amount: Amount of tokens to transfer
   *   - recipient: Recipient's Solana address in Omni format
   *   - fee_recipient: Optional fee recipient address
   * @param signature - MPC signature authorizing the transfer
   *
   * @returns Promise resolving to the transaction signature
   * @throws Error if token address is invalid, signature verification fails, or transaction fails
   */
  async finalizeTransfer(
    transferMessage: TransferMessagePayload,
    signature: MPCSignature,
    payer?: Keypair,
  ): Promise<string> {
    // Convert the payload into the expected format
    const originChain: number = Number(
      ChainKind[transferMessage.transfer_id.origin_chain.toString() as keyof typeof ChainKind],
    )
    const payerPk = payer?.publicKey ?? this.program.provider.publicKey

    const payload: DepositPayload = {
      destinationNonce: new BN(transferMessage.destination_nonce),
      transferId: {
        originChain,
        originNonce: new BN(transferMessage.transfer_id.origin_nonce),
      },
      amount: new BN(transferMessage.amount),
      feeRecipient: transferMessage.fee_recipient ?? "",
    }

    const wormholeMessage = Keypair.generate()
    const recipientPubkey = new PublicKey(this.extractSolanaAddress(transferMessage.recipient))
    const tokenPubkey = new PublicKey(this.extractSolanaAddress(transferMessage.token_address))

    // Calculate all the required PDAs
    const [config] = this.config()
    const [authority] = this.authority()

    // Calculate nonce account
    const USED_NONCES_PER_ACCOUNT = 1024
    const nonceGroup = payload.destinationNonce.div(new BN(USED_NONCES_PER_ACCOUNT))
    const [usedNonces] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("used_nonces", "utf-8"),
        Buffer.from(new BN(nonceGroup.toString()).toArray("le", 8)),
      ],
      this.program.programId,
    )

    // Calculate recipient's associated token account
    const tokenProgram = await this.getTokenProgramForMint(tokenPubkey)
    const [recipientATA] = PublicKey.findProgramAddressSync(
      [recipientPubkey.toBuffer(), tokenProgram.toBuffer(), tokenPubkey.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID,
    )

    // Calculate vault if needed
    const vault = (await this.isBridgedToken(tokenPubkey))
      ? this.program.programId
      : this.vaultId(tokenPubkey)[0]

    const tx = await this.program.methods
      .finalizeTransfer({
        payload: payload,
        signature: [...signature.toBytes()],
      })
      .accountsStrict({
        usedNonces,
        authority,
        recipient: recipientPubkey,
        mint: tokenPubkey,
        vault,
        tokenAccount: recipientATA,
        common: {
          payer: payerPk,
          config,
          bridge: this.wormholeBridgeId()[0],
          feeCollector: this.wormholeFeeCollectorId()[0],
          sequence: this.wormholeSequenceId()[0],
          clock: SYSVAR_CLOCK_PUBKEY,
          rent: SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
          wormholeProgram: this.wormholeProgramId,
          message: wormholeMessage.publicKey,
        },
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: tokenProgram,
      })
      .signers(payer instanceof Keypair ? [wormholeMessage, payer] : [wormholeMessage])

    return tx.rpc()
  }

  private extractSolanaAddress(address: OmniAddress): string {
    if (getChain(address) !== ChainKind.Sol) {
      throw new Error("Token address must be on Solana")
    }
    return address.split(":")[1]
  }

  private async isBridgedToken(token: PublicKey): Promise<boolean> {
    const mintInfo = await this.program.provider.connection.getParsedAccountInfo(token)

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

    return (
      data.parsed.info.mintAuthority &&
      data.parsed.info.mintAuthority.toString() === this.authority()[0].toString()
    )
  }

  private async getTokenProgramForMint(mint: PublicKey): Promise<PublicKey> {
    const accountInfo = await this.program.provider.connection.getAccountInfo(mint)
    if (!accountInfo) {
      throw new Error("Failed to find mint account")
    }

    // Check the owner of the mint account
    if (accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      return TOKEN_2022_PROGRAM_ID
    }
    return TOKEN_PROGRAM_ID
  }
}
