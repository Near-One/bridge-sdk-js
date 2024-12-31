import { BN, Program, type Provider } from "@coral-xyz/anchor"
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import {
  Keypair,
  type ParsedAccountData,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
} from "@solana/web3.js"
import {
  ChainKind,
  type MPCSignature,
  type OmniAddress,
  type TokenMetadata,
  type U128,
} from "../types"
import type { BridgeTokenFactory } from "../types/solana/bridge_token_factory"
import BRIDGE_TOKEN_FACTORY_IDL from "../types/solana/bridge_token_factory.json"
import { getChain } from "../utils"

const MPL_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")

export class SolanaDeployer {
  private readonly wormholeProgramId: PublicKey
  private readonly program: Program<BridgeTokenFactory>

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

  constructor(provider: Provider, wormholeProgramId: PublicKey) {
    this.wormholeProgramId = wormholeProgramId
    this.program = new Program(BRIDGE_TOKEN_FACTORY_IDL as BridgeTokenFactory, provider)
  }

  private config(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([SolanaDeployer.SEEDS.CONFIG], this.program.programId)
  }

  private authority(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SolanaDeployer.SEEDS.AUTHORITY],
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
      [SolanaDeployer.SEEDS.WRAPPED_MINT, Buffer.from(token, "utf-8")],
      this.program.programId,
    )
  }

  private vaultId(mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SolanaDeployer.SEEDS.VAULT, mint.toBuffer()],
      this.program.programId,
    )
  }

  private solVaultId(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SolanaDeployer.SEEDS.SOL_VAULT],
      this.program.programId,
    )
  }

  /**
   * Logs metadata for a token
   * @param token - The token's public key
   * @param payer - Optional payer keypair
   * @returns Promise resolving to transaction signature
   */
  async logMetadata(token: PublicKey, payer?: Keypair): Promise<string> {
    const wormholeMessage = Keypair.generate()
    const [metadata] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata", "utf-8"), MPL_PROGRAM_ID.toBuffer(), token.toBuffer()],
      MPL_PROGRAM_ID,
    )
    const [vault] = this.vaultId(token)

    try {
      const tx = await this.program.methods
        .logMetadata()
        .accountsStrict({
          authority: this.authority()[0],
          mint: token,
          metadata,
          vault,
          wormhole: {
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
          tokenProgram: TOKEN_PROGRAM_ID,
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
          signature: signature.toBytes(),
        })
        .accountsStrict({
          authority: this.authority()[0],
          wormhole: {
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
   * @returns Promise resolving to object containing transaction hash and nonce
   */
  async initTransfer(
    token: OmniAddress,
    recipient: OmniAddress,
    amount: U128,
    payer?: Keypair,
  ): Promise<{ hash: string; nonce: number }> {
    if (getChain(token) !== ChainKind.Sol) {
      throw new Error("Token address must be on Solana")
    }
    const wormholeMessage = Keypair.generate()

    const payerPubKey = payer?.publicKey || this.program.provider.publicKey
    if (!payerPubKey) {
      throw new Error("Payer is not configured")
    }

    const mint = new PublicKey(token.split(":")[1])
    const [from] = PublicKey.findProgramAddressSync(
      [payerPubKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID,
    )
    const vault = (await this.isBridgedToken(mint)) ? null : this.vaultId(mint)[0]
    const [solVault] = this.solVaultId()

    try {
      const tx = await this.program.methods
        .initTransfer({
          amount: new BN(amount.valueOf()),
          recipient,
          fee: new BN(0),
          nativeFee: new BN(0),
        })
        .accountsStrict({
          authority: this.authority()[0],
          mint,
          from,
          vault,
          solVault,
          user: payerPubKey,
          wormhole: {
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
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers(payer instanceof Keypair ? [wormholeMessage, payer] : [wormholeMessage])
        .rpc()

      return {
        hash: tx,
        nonce: 0,
      }
    } catch (e) {
      throw new Error(`Failed to init transfer: ${e}`)
    }
  }

  private async isBridgedToken(token: PublicKey): Promise<boolean> {
    const mintInfo = await this.program.provider.connection.getParsedAccountInfo(token)

    if (!mintInfo.value) {
      throw new Error("Failed to find mint account")
    }

    const data = mintInfo.value.data as ParsedAccountData
    if (!data.parsed || data.program !== "spl-token" || data.parsed.type !== "mint") {
      throw new Error("Not a valid SPL token mint")
    }

    return data.parsed.info.mintAuthority.toString() === this.authority()[0].toString()
  }
}
