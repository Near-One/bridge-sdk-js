// chains/solana.ts
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js"
import { Chain, type ChainDeployer, type OmniAddress, type TokenDeployment } from "../types"
import { getChain } from "../utils"

// Program ID constants
const PROGRAM_ID = new PublicKey(process.env.OMNI_PROGRAM_ID || "")

interface SolanaWallet {
  publicKey: PublicKey
  signTransaction(tx: Transaction): Promise<Transaction>
}

export class SolanaDeployer implements ChainDeployer {
  private connection: Connection

  constructor(
    private wallet: SolanaWallet,
    private network: "testnet" | "mainnet",
  ) {
    this.connection = new Connection(
      network === "testnet"
        ? "https://api.testnet.solana.com"
        : "https://api.mainnet-beta.solana.com",
      "confirmed",
    )
  }

  async initDeployToken(
    tokenAddress: OmniAddress,
    destinationChain: Chain,
  ): Promise<TokenDeployment> {
    // Validate source chain is Solana
    if (getChain(tokenAddress) !== Chain.Solana) {
      throw new Error("Token address must be on Solana chain")
    }

    // Extract token mint address from OmniAddress
    const [_, tokenMint] = tokenAddress.split(":")
    const mintPubkey = new PublicKey(tokenMint)

    try {
      // Derive PDA accounts
      const [authorityPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("authority")],
        PROGRAM_ID,
      )

      const [vaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), mintPubkey.toBuffer()],
        PROGRAM_ID,
      )

      // Get metadata account (optional)
      const metadataAccount = await this.connection.getProgramAccounts(
        new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"), // Metaplex program
        {
          filters: [{ memcmp: { offset: 33, bytes: mintPubkey.toBase58() } }],
        },
      )

      // Create log_metadata instruction
      const logMetadataIx = new TransactionInstruction({
        keys: [
          // All accounts from the Rust struct
          { pubkey: authorityPDA, isSigner: false, isWritable: false },
          { pubkey: mintPubkey, isSigner: false, isWritable: false },
          {
            pubkey: metadataAccount[0]?.pubkey || PublicKey.default,
            isSigner: false,
            isWritable: true,
          },
          { pubkey: vaultPDA, isSigner: false, isWritable: true },
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true }, // wormhole.payer
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          {
            pubkey: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
            isSigner: false,
            isWritable: false,
          }, // Token program
          {
            pubkey: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
            isSigner: false,
            isWritable: false,
          }, // Associated Token program
        ],
        programId: PROGRAM_ID,
        data: Buffer.from([0]), // Instruction discriminator for log_metadata
      })

      // Create and sign transaction
      const tx = new Transaction().add(logMetadataIx)
      const signedTx = await this.wallet.signTransaction(tx)

      // Send and confirm
      const signature = await sendAndConfirmTransaction(this.connection, signedTx, [
        /* additional signers if needed */
      ])

      return {
        id: signature,
        tokenAddress,
        sourceChain: Chain.Solana,
        destinationChain,
        status: "pending",
      }
    } catch (error) {
      throw new Error(`Failed to initialize token deployment: ${error}`)
    }
  }

  async finDeployToken(deployment: TokenDeployment): Promise<TokenDeployment> {
    if (deployment.status !== "ready_for_finalize") {
      throw new Error(`Invalid deployment status: ${deployment.status}`)
    }

    if (!deployment.proof) {
      throw new Error("Deployment proof missing")
    }

    try {
      // Parse proof data
      const { signedPayload, payload } = JSON.parse(deployment.proof)

      // Derive required PDAs
      const [authorityPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("authority")],
        PROGRAM_ID,
      )

      const [mintPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("wrapped_mint"), Buffer.from(payload.token)],
        PROGRAM_ID,
      )

      // Derive metadata account according to Metaplex standard
      const METAPLEX_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), mintPDA.toBuffer()],
        METAPLEX_PROGRAM_ID,
      )

      // Create deploy_token instruction
      const deployTokenIx = new TransactionInstruction({
        keys: [
          // All accounts from the Rust struct
          { pubkey: authorityPDA, isSigner: false, isWritable: false },
          { pubkey: mintPDA, isSigner: false, isWritable: true },
          { pubkey: metadataPDA, isSigner: false, isWritable: true },
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true }, // wormhole.payer
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          {
            pubkey: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
            isSigner: false,
            isWritable: false,
          }, // Token program
          { pubkey: METAPLEX_PROGRAM_ID, isSigner: false, isWritable: false }, // Token Metadata program
        ],
        programId: PROGRAM_ID,
        // Instruction data includes signed payload
        data: Buffer.from([1, ...signedPayload]), // 1 = discriminator for deploy_token
      })

      // Create and sign transaction
      const tx = new Transaction().add(deployTokenIx)
      const signedTx = await this.wallet.signTransaction(tx)

      // Send and confirm
      const signature = await sendAndConfirmTransaction(this.connection, signedTx, [
        /* no additional signers needed since PDAs are derived */
      ])

      return {
        ...deployment,
        status: "finalized",
        deploymentTx: signature,
      }
    } catch (error) {
      throw new Error(`Failed to finalize token deployment: ${error}`)
    }
  }

  async bindToken(deployment: TokenDeployment): Promise<TokenDeployment> {
    // Like Ethereum, Solana tokens are usable immediately after deployment
    if (deployment.status !== "ready_for_bind") {
      throw new Error(`Invalid deployment status: ${deployment.status}`)
    }

    return {
      ...deployment,
      status: "completed",
    }
  }

  // Helper to validate Solana public key format
  private validateSolanaAddress(address: string): void {
    try {
      new PublicKey(address)
    } catch {
      throw new Error(`Invalid Solana address format: ${address}`)
    }
  }
}
