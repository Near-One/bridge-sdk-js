import { Program, type Provider } from "@coral-xyz/anchor"
import { TOKEN_PROGRAM_ID } from "@solana/spl-token"
import {
  Keypair,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
} from "@solana/web3.js"
import type { MPCSignature, TokenMetadata } from "../types"
import type { BridgeTokenFactory } from "../types/solana/bridge_token_factory"
import * as BridgeTokenFactoryIdl from "../types/solana/bridge_token_factory.json"

const MPL_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")

export class SolanaDeployer {
  private readonly wormholeProgramId: PublicKey
  private readonly program: Program<BridgeTokenFactory>

  private static readonly SEEDS = {
    CONFIG: new Uint8Array([99, 111, 110, 102, 105, 103]),
    AUTHORITY: new Uint8Array([97, 117, 116, 104, 111, 114, 105, 116, 121]),
    WRAPPED_MINT: new Uint8Array([119, 114, 97, 112, 112, 101, 100, 95, 109, 105, 110, 116]),
    VAULT: new Uint8Array([118, 97, 117, 108, 116]),
  }

  constructor(provider: Provider, wormholeProgramId: PublicKey) {
    this.wormholeProgramId = wormholeProgramId
    this.program = new Program(BridgeTokenFactoryIdl as BridgeTokenFactory, provider)
  }

  private configId(): [PublicKey, number] {
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
      [Buffer.from("Sequence", "utf-8"), this.configId()[0].toBuffer()],
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

  /**
   * Logs metadata for a token
   * @param token - The token's public key
   * @param payer - Optional payer public key
   * @returns Promise resolving to transaction signature
   */
  async logMetadata(token: PublicKey, payer?: PublicKey): Promise<string> {
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
            payer: payer || this.program.provider.publicKey,
            config: this.configId()[0],
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
          associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
        })
        .signers([wormholeMessage])
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
    payer?: PublicKey,
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
            payer: payer || this.program.provider.publicKey,
            config: this.configId()[0],
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
        .signers([wormholeMessage])
        .rpc()

      return {
        txHash: tx,
        tokenAddress: mint.toString(),
      }
    } catch (e) {
      throw new Error(`Failed to deploy token: ${e}`)
    }
  }
}
