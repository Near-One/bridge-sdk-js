import { Program, type Provider } from "@coral-xyz/anchor"
import { sha256 } from "@noble/hashes/sha2.js"
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
import type { BridgeTokenFactory } from "../types/solana/bridge_token_factory_shim.js"
// biome-ignore lint/correctness/useImportExtensions: JSON import requires .json extension
import BRIDGE_TOKEN_FACTORY_IDL from "../types/solana/bridge_token_factory_shim.json" with {
  type: "json",
}
import { getChain } from "../utils/index.js"

const MPL_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")

export class SolanaBridgeClient {
  private readonly wormholeProgramId: PublicKey
  private readonly shimProgramId: PublicKey
  private readonly eventAuthorityId: PublicKey
  private readonly program: Program<BridgeTokenFactory>

  private static getConstant(name: string) {
    const value = BRIDGE_TOKEN_FACTORY_IDL.constants.find(
      (c: { name: string }) => c.name === name,
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
      [new TextEncoder().encode("Bridge")],
      this.wormholeProgramId,
    )
  }

  private wormholeFeeCollectorId(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("fee_collector")],
      this.wormholeProgramId,
    )
  }

  private wormholeSequenceId(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("Sequence"), this.config()[0].toBuffer()],
      this.wormholeProgramId,
    )
  }

  private static tokenSeedBytes(token: string): Uint8Array {
    const tokenBytes = new TextEncoder().encode(token)
    if (tokenBytes.length > 32) {
      // Mirror Anchor program logic: hash addresses longer than 32 bytes
      return sha256(tokenBytes)
    }

    const padded = new Uint8Array(32)
    padded.set(tokenBytes)
    return padded
  }

  private wrappedMintId(token: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SolanaBridgeClient.SEEDS.WRAPPED_MINT, SolanaBridgeClient.tokenSeedBytes(token)],
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
   * Logs metadata for a token
   * @param token - The token's public key
   * @param payer - Optional payer keypair
   * @returns Promise resolving to transaction signature
   */
  async logMetadata(token: OmniAddress, payer?: Keypair): Promise<string> {
    const parts = token.split(":")
    const tokenAddress = parts[1]
    if (!tokenAddress) {
      throw new Error("Invalid token address format")
    }
    const tokenPublicKey = new PublicKey(tokenAddress)
    const tokenProgram = await this.getTokenProgramForMint(tokenPublicKey)

    const [metadata] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("metadata"), MPL_PROGRAM_ID.toBuffer(), tokenPublicKey.toBuffer()],
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
      throw new Error(`Failed to log metadata: ${e}`)
    }
  }

  /**
   * Deploys a new wrapped token using the wormhole shim
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
    const [mint] = this.wrappedMintId(payload.token)
    const [metadata] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("metadata"), MPL_PROGRAM_ID.toBuffer(), mint.toBuffer()],
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
      const message = e instanceof Error ? e.message : String(e)
      if (
        message.includes("already in use") ||
        message.includes("AccountNotSystemOwned") ||
        message.includes("account already exists")
      ) {
        throw new Error(
          `Token already deployed on Solana (metadata account exists; replay is safe): ${mint.toString()}`,
        )
      }
      throw new Error(`Failed to deploy token with shim: ${message}`)
    }
  }

  /**
   * Transfers SPL tokens to the bridge contract using the wormhole shim
   * @param transfer - Transfer message details
   * @param payer - Optional payer keypair
   * @returns Promise resolving to transaction hash
   */
  async initTransfer(transfer: OmniTransferMessage, payer?: Keypair): Promise<string> {
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
      const method = this.program.methods
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
      const parts = transfer.tokenAddress.split(":")
      const mintAddress = parts[1]
      if (!mintAddress) {
        throw new Error("Invalid token address format")
      }
      const mint = new PublicKey(mintAddress)
      const tokenProgram = await this.getTokenProgramForMint(mint)
      const [from] = PublicKey.findProgramAddressSync(
        [payerPubKey.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
        ASSOCIATED_TOKEN_PROGRAM_ID,
      )
      const vault = (await this.isBridgedToken(mint)) ? null : this.vaultId(mint)[0]

      const method = this.program.methods
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
        new TextEncoder().encode("used_nonces"),
        new Uint8Array(new BN(nonceGroup.toString()).toArray("le", 8)),
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
          message: this.shimMessageId()[0],
          wormholePostMessageShim: this.shimProgramId,
          wormholePostMessageShimEa: this.eventAuthorityId,
        },
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: tokenProgram,
      })
      .signers(payer instanceof Keypair ? [payer] : [])

    return tx.rpc()
  }

  private extractSolanaAddress(address: OmniAddress): string {
    if (getChain(address) !== ChainKind.Sol) {
      throw new Error("Token address must be on Solana")
    }
    const parts = address.split(":")
    const solAddress = parts[1]
    if (!solAddress) {
      throw new Error("Invalid Solana address format")
    }
    return solAddress
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
