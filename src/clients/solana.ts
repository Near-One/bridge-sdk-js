import { AnchorProvider, BN, Program } from "@coral-xyz/anchor"
import type { MethodsBuilder } from "@coral-xyz/anchor/dist/cjs/program/namespace/methods"
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token"
import type { SignerWalletAdapter } from "@solana/wallet-adapter-base"
import {
  type Commitment,
  Connection,
  Keypair,
  type ParsedAccountData,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
} from "@solana/web3.js"
import { addresses, getNetwork } from "../config"
import {
  ChainKind,
  type DepositPayload,
  type MPCSignature,
  type OmniAddress,
  type OmniTransferMessage,
  type TokenMetadata,
  type TransferMessagePayload,
} from "../types"
import type { BridgeTokenFactory } from "../types/solana/bridge_token_factory"
import BRIDGE_TOKEN_FACTORY_IDL from "../types/solana/bridge_token_factory.json"
import { getChain } from "../utils"

const MPL_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")

export class SolanaBridgeClient {
  private readonly wormholeProgramId: PublicKey
  private readonly program: Program<BridgeTokenFactory>
  private readonly wallet: SignerWalletAdapter
  private readonly connection: Connection

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
    wallet: SignerWalletAdapter,
    wormholeProgramId: PublicKey = new PublicKey(addresses.sol.wormhole),
  ) {
    this.wormholeProgramId = wormholeProgramId
    this.wallet = wallet

    const url =
      getNetwork() === "testnet"
        ? "https://api.devnet.solana.com"
        : "https://api.mainnet-beta.solana.com"
    this.connection = new Connection(url, "confirmed")

    // Create an AnchorProvider with the wallet adapter
    if (!wallet.publicKey) {
      throw new Error("Wallet must have a public key")
    }

    const provider = new AnchorProvider(
      this.connection,
      {
        signTransaction: async () => {
          throw new Error("Should not be called")
        },
        signAllTransactions: async () => {
          throw new Error("Should not be called")
        },
        publicKey: wallet.publicKey,
      },
      AnchorProvider.defaultOptions(),
    )

    const bridgeTokenFactory = BRIDGE_TOKEN_FACTORY_IDL as BridgeTokenFactory
    // @ts-ignore We have to override the address for Mainnet/Testnet
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

  private debugTransaction(transaction: Transaction): void {
    console.log("==== Transaction Debug Info ====")
    console.log(`Instructions count: ${transaction.instructions.length}`)
    console.log(`Recent blockhash: ${transaction.recentBlockhash || "Not set"}`)
    console.log(`Fee payer: ${transaction.feePayer?.toBase58() || "Not set"}`)

    // Log each instruction
    transaction.instructions.forEach((ix, index) => {
      console.log(`\nInstruction #${index}:`)
      console.log(`Program ID: ${ix.programId.toBase58()}`)
      console.log(`Data length: ${ix.data.length} bytes`)
      console.log(`Data (hex): ${Buffer.from(ix.data).toString("hex").slice(0, 50)}...`)
      console.log("Keys:")
      ix.keys.forEach((key, keyIndex) => {
        console.log(
          `  ${keyIndex}: ${key.pubkey.toBase58()} (${key.isSigner ? "signer" : "not-signer"}, ${key.isWritable ? "writable" : "readonly"})`,
        )
      })
    })

    // Check for signer issues
    const signerKeys = transaction.instructions
      .flatMap((ix) => ix.keys.filter((key) => key.isSigner))
      .map((key) => key.pubkey.toBase58())

    const uniqueSigners = [...new Set(signerKeys)]
    console.log("\nRequired signers:", uniqueSigners)

    // Check for potential issues
    const serializedSize = transaction.serialize({ verifySignatures: false }).length
    console.log(`\nTransaction size: ${serializedSize} bytes`)
  }

  /**
   * Uses wallet adapter to sign and send a transaction with improved error handling
   * @param transaction The transaction to sign and send
   * @param signers Additional signers to include (like generated message keypairs)
   * @returns Promise resolving to transaction signature
   */
  private async signAndSendTransaction(
    transaction: Transaction,
    signers: Keypair[] = [],
  ): Promise<string> {
    if (!this.wallet.connected || !this.wallet.publicKey) {
      throw new Error("Wallet not connected")
    }

    try {
      // Set the feePayer to the wallet's public key
      transaction.feePayer = this.wallet.publicKey

      // Get the latest blockhash if not already set
      if (!transaction.recentBlockhash) {
        const { blockhash } = await this.connection.getLatestBlockhash()
        transaction.recentBlockhash = blockhash
      }

      // Partially sign with any additional signers (like wormhole message)
      if (signers.length > 0) {
        console.log(`Partially signing with ${signers.length} additional signer(s)...`)
        transaction.partialSign(...signers)
      }

      // Try with skipPreflight option to avoid client-side validation errors
      const sendOptions = {
        skipPreflight: true, // Skip preflight checks
        preflightCommitment: "processed" as Commitment,
      }

      try {
        console.log("Sending transaction to wallet for signing...")
        const signature = await this.wallet.sendTransaction(
          transaction,
          this.connection,
          sendOptions,
        )
        console.log("Transaction signed successfully, signature:", signature)

        // Improved confirmation strategy - use simple commitment-based confirmation
        try {
          console.log("Waiting for transaction confirmation...")
          // Use a simpler confirmation method with just the signature
          await this.connection.confirmTransaction(signature, "confirmed")
          console.log("Transaction confirmed successfully")
          return signature
        } catch (confirmError) {
          // If confirmation fails, check transaction status directly
          console.warn("Confirmation error:", confirmError)
          console.log("Checking transaction status directly...")

          const status = await this.connection.getSignatureStatus(signature)
          if (status?.value?.err) {
            console.error("Transaction failed:", status.value.err)
            throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`)
          }

          if (
            status?.value?.confirmationStatus === "confirmed" ||
            status?.value?.confirmationStatus === "finalized"
          ) {
            console.log("Transaction status check: Confirmed!")
            return signature
          }

          // If we can't confirm, but transaction was sent, return signature anyway
          console.warn(
            "Unable to confirm transaction, but it was submitted. Status:",
            status?.value?.confirmationStatus,
          )
          return signature
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("Unexpected error")) {
          // Specific handling for Phantom's "Unexpected error"
          console.error("Phantom wallet returned 'Unexpected error'")
          console.log("Trying alternative approach...")

          // Create a fresh transaction with the same instructions
          const freshTx = new Transaction()
          for (const ix of transaction.instructions) {
            freshTx.add(ix)
          }
          freshTx.feePayer = this.wallet.publicKey

          // Get a fresh blockhash for the retry
          const { blockhash } = await this.connection.getLatestBlockhash()
          freshTx.recentBlockhash = blockhash

          if (signers.length > 0) {
            freshTx.partialSign(...signers)
          }

          // Try with alternative send options
          const altSendOptions = {
            skipPreflight: true,
            maxRetries: 3,
          }

          console.log("Retrying with alternative transaction...")
          const signature = await this.wallet.sendTransaction(
            freshTx,
            this.connection,
            altSendOptions,
          )
          console.log("Alternative approach successful, signature:", signature)

          // Use simpler confirmation for the retry too
          await this.connection.confirmTransaction(signature, "processed")
          return signature
        }

        // If it's not the specific Phantom error, rethrow
        throw error
      }
    } catch (error) {
      console.error("Transaction error:", error)

      // Check for specific error messages
      if (error instanceof Error) {
        if (error.message.includes("insufficient funds")) {
          throw new Error("Insufficient SOL balance to pay for transaction fees")
        }

        if (error.message.includes("Transaction too large")) {
          throw new Error("Transaction is too large")
        }

        if (error.message.includes("Unexpected error")) {
          throw new Error(
            "Phantom wallet error: Try disconnecting and reconnecting your wallet, or using a different wallet like Solflare",
          )
        }

        if (error.message.includes("block height exceeded")) {
          throw new Error(
            "Transaction confirmation timed out, but it may have still processed. Check your wallet for changes before trying again.",
          )
        }
      }

      throw new Error(`Failed to sign and send transaction: ${error}`)
    }
  }

  /**
   * Builds transaction using Anchor Program methods
   * @param methodBuilder The Anchor method builder
   * @returns Promise resolving to Transaction object
   */
  private async buildTransaction(
    // biome-ignore lint/suspicious/noExplicitAny: Arbitrary types
    methodBuilder: MethodsBuilder<BridgeTokenFactory, any, any>,
  ): Promise<Transaction> {
    // We don't add signers here - we'll do that in signAndSendTransaction
    return await methodBuilder.transaction()
  }

  /**
   * Logs metadata for a token
   * @param token - The token's public key
   * @returns Promise resolving to transaction signature
   */
  async logMetadata(token: OmniAddress): Promise<string> {
    const tokenPublicKey = new PublicKey(token.split(":")[1])
    const tokenProgram = await this.getTokenProgramForMint(tokenPublicKey)

    const wormholeMessage = Keypair.generate()
    const [metadata] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata", "utf-8"), MPL_PROGRAM_ID.toBuffer(), tokenPublicKey.toBuffer()],
      MPL_PROGRAM_ID,
    )
    const [vault] = this.vaultId(tokenPublicKey)

    try {
      // Build the transaction using Anchor
      const methodBuilder = this.program.methods.logMetadata().accountsStrict({
        authority: this.authority()[0],
        mint: tokenPublicKey,
        metadata,
        vault,
        common: {
          payer: this.program.provider.publicKey,
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

      // Build the transaction
      const transaction = await this.buildTransaction(methodBuilder)

      // Send to wallet for signing and submission
      return await this.signAndSendTransaction(transaction, [wormholeMessage])
    } catch (e) {
      console.error("logMetadata error:", e)
      throw new Error(`Failed to log metadata: ${e}`)
    }
  }

  /**
   * Deploys a new wrapped token
   * @param signature - MPC signature authorizing the deployment
   * @param tokenMetadata - Token metadata
   * @returns Promise resolving to transaction hash and token address
   */
  async deployToken(
    signature: MPCSignature,
    payload: TokenMetadata,
  ): Promise<{ txHash: string; tokenAddress: string }> {
    const wormholeMessage = Keypair.generate()
    const [mint] = this.wrappedMintId(payload.token)
    const [metadata] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata", "utf-8"), MPL_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      MPL_PROGRAM_ID,
    )

    try {
      // Build the transaction using Anchor
      const methodBuilder = this.program.methods
        .deployToken({
          payload,
          signature: [...signature.toBytes()],
        })
        .accountsStrict({
          authority: this.authority()[0],
          common: {
            payer: this.program.provider.publicKey,
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

      // Convert to transaction
      const transaction = await this.buildTransaction(methodBuilder)

      // Send to wallet for signing and submission
      const txHash = await this.signAndSendTransaction(transaction, [wormholeMessage])

      return {
        txHash,
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
   * @param transfer - The transfer details
   * @throws {Error} If token address is not on Solana
   * @returns Promise resolving to transaction hash
   */
  async initTransfer(transfer: OmniTransferMessage): Promise<string> {
    if (getChain(transfer.tokenAddress) !== ChainKind.Sol) {
      throw new Error("Token address must be on Solana")
    }

    // Generate a keypair for the wormhole message
    const wormholeMessage = Keypair.generate()
    console.log("Generated wormhole message keypair:", wormholeMessage.publicKey.toBase58())

    if (!this.wallet.publicKey) {
      throw new Error("Wallet is not connected")
    }

    const payerPubKey = this.wallet.publicKey
    const [solVault] = this.solVaultId()

    try {
      // biome-ignore lint/suspicious/noExplicitAny: initTransfer or initTransferSol
      let methodBuilder: MethodsBuilder<BridgeTokenFactory, any, any>

      if (transfer.tokenAddress === `sol:${PublicKey.default.toBase58()}`) {
        console.log("Processing SOL native token transfer")
        // SOL transfer implementation...
        methodBuilder = this.program.methods
          .initTransferSol({
            amount: new BN(transfer.amount.valueOf().toString()),
            recipient: transfer.recipient,
            fee: new BN(transfer.fee.valueOf().toString()),
            nativeFee: new BN(transfer.nativeFee.valueOf().toString()),
            message: "",
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
        console.log("Processing SPL token transfer")
        const mint = new PublicKey(transfer.tokenAddress.split(":")[1])
        console.log("Mint address:", mint.toBase58())

        const tokenProgram = await this.getTokenProgramForMint(mint)
        console.log("Token program:", tokenProgram.toBase58())

        // Find associated token account
        const [from] = PublicKey.findProgramAddressSync(
          [payerPubKey.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
          ASSOCIATED_TOKEN_PROGRAM_ID,
        )
        console.log("From ATA address:", from.toBase58())

        // Check if token account exists
        const tokenAccountInfo = await this.connection.getAccountInfo(from)
        if (!tokenAccountInfo) {
          throw new Error(
            `Token account ${from.toBase58()} does not exist. Please create it first.`,
          )
        }

        // Check token balance
        const tokenBalance = await this.connection.getTokenAccountBalance(from)
        const amountBigInt = BigInt(transfer.amount.valueOf().toString())

        if (BigInt(tokenBalance.value.amount) < amountBigInt) {
          throw new Error(
            `Insufficient token balance. You have ${tokenBalance.value.amount} but are trying to transfer ${amountBigInt}`,
          )
        }

        // Check if the token is a bridged token
        const isBridged = await this.isBridgedToken(mint)
        console.log("Is bridged token:", isBridged)

        const vault = isBridged ? null : this.vaultId(mint)[0]
        if (vault) {
          console.log("Using vault:", vault.toBase58())
        } else {
          console.log("No vault needed for bridged token")
        }

        // Build with Anchor
        methodBuilder = this.program.methods
          .initTransfer({
            amount: new BN(transfer.amount.valueOf().toString()),
            recipient: transfer.recipient,
            fee: new BN(transfer.fee.valueOf().toString()),
            nativeFee: new BN(transfer.nativeFee.valueOf().toString()),
            message: "",
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

      // Build transaction
      console.log("Building transaction...")
      const transaction = await this.buildTransaction(methodBuilder)

      // Add feePayer and recentBlockhash to transaction
      const { blockhash } = await this.connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = payerPubKey

      // Debug the transaction
      this.debugTransaction(transaction)

      // Skip simulation since it requires signatures not available during simulation
      console.log("Skipping simulation due to signature requirements")

      // Add the wormhole message as a signer
      console.log("Signing transaction with wormhole message keypair...")

      // IMPORTANT: Send the transaction with the wormhole message as a signer
      return await this.signAndSendTransaction(transaction, [wormholeMessage])
    } catch (e) {
      console.error("initTransfer error:", e)
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
  ): Promise<string> {
    // Convert the payload into the expected format
    const payload: DepositPayload = {
      destination_nonce: BigInt(transferMessage.destination_nonce),
      transfer_id: {
        origin_chain: transferMessage.transfer_id.origin_chain,
        origin_nonce: transferMessage.transfer_id.origin_nonce,
      },
      token: this.extractSolanaAddress(transferMessage.token_address),
      amount: BigInt(transferMessage.amount),
      recipient: this.extractSolanaAddress(transferMessage.recipient),
      fee_recipient: transferMessage.fee_recipient ?? "",
    }

    const wormholeMessage = Keypair.generate()
    const recipientPubkey = new PublicKey(payload.recipient)
    const tokenPubkey = new PublicKey(payload.token)

    // Calculate all the required PDAs
    const [config] = this.config()
    const [authority] = this.authority()
    // Removed unused solVault declaration

    // Calculate nonce account
    const USED_NONCES_PER_ACCOUNT = 1024
    const nonceGroup = payload.destination_nonce / BigInt(USED_NONCES_PER_ACCOUNT)
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
    const vault = (await this.isBridgedToken(tokenPubkey)) ? null : this.vaultId(tokenPubkey)[0]

    try {
      // Build the transaction using Anchor
      const methodBuilder = this.program.methods
        .finalizeTransfer({
          payload: {
            destinationNonce: new BN(payload.destination_nonce.toString()),
            transferId: {
              originChain: payload.transfer_id.origin_chain,
              originNonce: new BN(payload.transfer_id.origin_nonce.toString()),
            },
            amount: new BN(payload.amount.toString()),
            feeRecipient: payload.fee_recipient,
          },
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
            payer: this.program.provider.publicKey,
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

      // Convert to transaction
      const transaction = await this.buildTransaction(methodBuilder)

      // Send to wallet for signing and submission
      return await this.signAndSendTransaction(transaction, [wormholeMessage])
    } catch (e) {
      throw new Error(`Failed to finalize transfer: ${e}`)
    }
  }

  private extractSolanaAddress(address: OmniAddress): string {
    if (getChain(address) !== ChainKind.Sol) {
      throw new Error("Token address must be on Solana")
    }
    return address.split(":")[1]
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

    return (
      data.parsed.info.mintAuthority &&
      data.parsed.info.mintAuthority.toString() === this.authority()[0].toString()
    )
  }

  private async getTokenProgramForMint(mint: PublicKey): Promise<PublicKey> {
    const accountInfo = await this.connection.getAccountInfo(mint)
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
