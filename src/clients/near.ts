import type { Account } from "@near-js/accounts"
import { actionCreators } from "@near-js/transactions"
import { addresses } from "../config.js"
import {
  type AccountId,
  type BindTokenArgs,
  BindTokenArgsSchema,
  ChainKind,
  type DeployTokenArgs,
  DeployTokenArgsSchema,
  type EvmVerifyProofArgs,
  EvmVerifyProofArgsSchema,
  type FastFinTransferArgs,
  type FinTransferArgs,
  FinTransferArgsSchema,
  type InitTransferEvent,
  type LogMetadataArgs,
  type LogMetadataEvent,
  type OmniAddress,
  type OmniTransferMessage,
  ProofKind,
  type SignTransferArgs,
  type SignTransferEvent,
  type TransferId,
  type U128,
  type WormholeVerifyProofArgs,
  WormholeVerifyProofArgsSchema,
} from "../types/index.js"
import { isEvmChain, omniAddress } from "../utils/chain.js"
import { getChain } from "../utils/index.js"
import { getBridgedToken } from "../utils/tokens.js"
import type { EvmBridgeClient } from "./evm.js"

/**
 * Configuration for NEAR network gas limits.
 * All values are specified in TGas (Terra Gas) units.
 * @internal
 */
const GAS = {
  LOG_METADATA: BigInt(3e14), // 3 TGas
  DEPLOY_TOKEN: BigInt(1.2e14), // 1.2 TGas
  BIND_TOKEN: BigInt(3e14), // 3 TGas
  INIT_TRANSFER: BigInt(3e14), // 3 TGas
  FIN_TRANSFER: BigInt(3e14), // 3 TGas
  SIGN_TRANSFER: BigInt(3e14), // 3 TGas
  STORAGE_DEPOSIT: BigInt(1e14), // 1 TGas
  FAST_FIN_TRANSFER: BigInt(3e14), // 3 TGas
} as const

/**
 * Configuration for NEAR network deposit amounts.
 * Values represent the amount of NEAR tokens required for each operation.
 * @internal
 */
const DEPOSIT = {
  LOG_METADATA: BigInt(1), // 1 yoctoNEAR
  SIGN_TRANSFER: BigInt(1), // 1 yoctoNEAR
  INIT_TRANSFER: BigInt(1), // 1 yoctoNEAR
} as const

/**
 * Represents the storage deposit balance for a NEAR account
 */
type StorageDeposit = {
  total: bigint
  available: bigint
} | null

interface InitTransferMessageArgs {
  receiver_id: AccountId
  memo: string | null
  amount: string
  msg: string | null
}

interface InitTransferMessage {
  recipient: OmniAddress
  fee: string
  native_token_fee: string
}

/**
 * Interface representing the results of various balance queries
 * @property regBalance - Required balance for account registration
 * @property initBalance - Required balance for initializing transfers
 * @property finBalance - Required balance for finalizing transfers
 * @property bindBalance - Required balance for binding tokens
 * @property storage - Current storage deposit balance information
 */
interface BalanceResults {
  regBalance: bigint
  initBalance: bigint
  finBalance: bigint
  bindBalance: bigint
  storage: StorageDeposit
}

/**
 * NEAR blockchain implementation of the bridge client.
 * Handles token deployment, binding, and transfer operations on the NEAR blockchain.
 */
export class NearBridgeClient {
  /**
   * Creates a new NEAR bridge client instance
   * @param wallet - NEAR account instance for transaction signing
   * @param lockerAddress - Address of the token locker contract
   * @throws {Error} If locker address is not configured
   */
  constructor(
    private wallet: Account,
    private lockerAddress: string = addresses.near,
  ) {
    if (lockerAddress) {
      this.lockerAddress = lockerAddress
      return
    }
  }

  /**
   * Logs metadata for a token on the NEAR blockchain
   * @param tokenAddress - Omni address of the token
   * @throws {Error} If token address is not on NEAR chain
   * @returns Promise resolving to the transaction hash
   */
  async logMetadata(tokenAddress: OmniAddress): Promise<LogMetadataEvent> {
    if (getChain(tokenAddress) !== ChainKind.Near) {
      throw new Error("Token address must be on NEAR")
    }

    const [_, tokenAccountId] = tokenAddress.split(":")
    const args: LogMetadataArgs = { token_id: tokenAccountId }

    const outcome = await this.wallet.signAndSendTransaction({
      receiverId: this.lockerAddress,
      actions: [
        actionCreators.functionCall(
          "log_metadata",
          args,
          BigInt(GAS.LOG_METADATA),
          BigInt(DEPOSIT.LOG_METADATA),
        ),
      ],
      waitUntil: "FINAL",
    })

    // Parse event from transaction logs
    const event = outcome.receipts_outcome
      .flatMap((receipt) => receipt.outcome.logs)
      .find((log) => log.includes("LogMetadataEvent"))

    if (!event) {
      throw new Error("LogMetadataEvent not found in transaction logs")
    }

    return JSON.parse(event).LogMetadataEvent
  }

  /**
   * Deploys a token to the specified destination chain
   * @param destinationChain - Target chain where the token will be deployed
   * @param vaa - Verified Action Approval containing deployment information
   * @returns Promise resolving to the transaction hash
   */
  async deployToken(destinationChain: ChainKind, vaa: string): Promise<string> {
    const proverArgs: WormholeVerifyProofArgs = {
      proof_kind: ProofKind.DeployToken,
      vaa: vaa,
    }
    const proverArgsSerialized = WormholeVerifyProofArgsSchema.serialize(proverArgs)

    // Construct deploy token arguments
    const args: DeployTokenArgs = {
      chain_kind: destinationChain,
      prover_args: proverArgsSerialized,
    }
    const serializedArgs = DeployTokenArgsSchema.serialize(args)

    // Retrieve required deposit dynamically for deploy_token
    const deployDepositStr = await this.wallet.viewFunction({
      contractId: this.lockerAddress,
      methodName: "required_balance_for_deploy_token",
    })

    const tx = await this.wallet.signAndSendTransaction({
      receiverId: this.lockerAddress,
      actions: [
        actionCreators.functionCall(
          "deploy_token",
          serializedArgs,
          BigInt(GAS.DEPLOY_TOKEN),
          BigInt(deployDepositStr),
        ),
      ],
    })
    return tx.transaction.hash
  }

  /**
   * Binds a token on the NEAR chain using either a VAA (Wormhole) or EVM proof
   * @param sourceChain - Source chain where the original token comes from
   * @param vaa - Verified Action Approval for Wormhole verification
   * @param evmProof - EVM proof for Ethereum or EVM chain verification
   * @throws {Error} If VAA or EVM proof is not provided
   * @throws {Error} If EVM proof is provided for non-EVM chain
   * @returns Promise resolving to the transaction hash
   */
  async bindToken(
    sourceChain: ChainKind,
    vaa?: string,
    evmProof?: EvmVerifyProofArgs,
  ): Promise<string> {
    if (!vaa && !evmProof) {
      throw new Error("Must provide either VAA or EVM proof")
    }

    if (evmProof) {
      if (
        sourceChain !== ChainKind.Eth &&
        sourceChain !== ChainKind.Arb &&
        sourceChain !== ChainKind.Base
      ) {
        throw new Error("EVM proof is only valid for Ethereum, Arbitrum, or Base")
      }
    }

    let proverArgsSerialized: Uint8Array = new Uint8Array(0)
    if (vaa) {
      const proverArgs: WormholeVerifyProofArgs = {
        proof_kind: ProofKind.DeployToken,
        vaa: vaa,
      }
      proverArgsSerialized = WormholeVerifyProofArgsSchema.serialize(proverArgs)
    } else if (evmProof) {
      const proverArgs: EvmVerifyProofArgs = {
        proof_kind: ProofKind.DeployToken,
        proof: evmProof.proof,
      }
      proverArgsSerialized = EvmVerifyProofArgsSchema.serialize(proverArgs)
    }

    // Construct bind token arguments
    const args: BindTokenArgs = {
      chain_kind: sourceChain,
      prover_args: proverArgsSerialized,
    }
    const serializedArgs = BindTokenArgsSchema.serialize(args)

    // Retrieve required deposit dynamically for bind_token
    const bindDepositStr = (await this.wallet.provider.callFunction(
      this.lockerAddress,
      "required_balance_for_bind_token",
      {},
    )) as string

    const tx = await this.wallet.signAndSendTransaction({
      receiverId: this.lockerAddress,
      actions: [
        actionCreators.functionCall(
          "bind_token",
          serializedArgs,
          BigInt(GAS.BIND_TOKEN),
          BigInt(bindDepositStr),
        ),
      ],
    })

    return tx.transaction.hash
  }

  /**
   * Transfers NEP-141 tokens to the token locker contract on NEAR.
   * This transaction generates a proof that is subsequently used to mint
   * corresponding tokens on the destination chain.
   *
   * @param token - Omni address of the NEP-141 token to transfer
   * @param recipient - Recipient's Omni address on the destination chain where tokens will be minted
   * @param amount - Amount of NEP-141 tokens to transfer
   * @throws {Error} If token address is not on NEAR chain
   * @returns Promise resolving to InitTransferEvent
   */

  async initTransfer(transfer: OmniTransferMessage): Promise<InitTransferEvent> {
    if (getChain(transfer.tokenAddress) !== ChainKind.Near) {
      throw new Error("Token address must be on NEAR")
    }
    const tokenAddress = transfer.tokenAddress.split(":")[1]

    // First, check if the FT has the token locker contract registered for storage
    await this.storageDepositForToken(tokenAddress)

    // Now do the storage deposit dance for the locker itself
    const { regBalance, initBalance, storage } = await this.getBalances()
    const requiredBalance = regBalance + initBalance
    const existingBalance = storage?.available ?? BigInt(0)
    const neededAmount = requiredBalance - existingBalance + transfer.nativeFee

    if (neededAmount > 0) {
      await this.wallet.functionCall({
        contractId: this.lockerAddress,
        methodName: "storage_deposit",
        args: {},
        gas: GAS.STORAGE_DEPOSIT,
        attachedDeposit: neededAmount,
      })
    }

    const initTransferMessage: InitTransferMessage = {
      recipient: transfer.recipient,
      fee: transfer.fee.toString(),
      native_token_fee: transfer.nativeFee.toString(),
    }
    const args: InitTransferMessageArgs = {
      receiver_id: this.lockerAddress,
      amount: transfer.amount.toString(),
      memo: null,
      msg: JSON.stringify(initTransferMessage),
    }
    const tx = await this.wallet.signAndSendTransaction({
      receiverId: tokenAddress,
      actions: [
        actionCreators.functionCall(
          "ft_transfer_call",
          args,
          BigInt(GAS.INIT_TRANSFER),
          BigInt(DEPOSIT.INIT_TRANSFER),
        ),
      ],
    })

    // Parse event from transaction logs
    const event = tx.receipts_outcome
      .flatMap((receipt) => receipt.outcome.logs)
      .find((log) => log.includes("InitTransferEvent"))

    if (!event) {
      throw new Error("InitTransferEvent not found in transaction logs")
    }
    return JSON.parse(event).InitTransferEvent
  }

  /**
   * Signs transfer using the token locker
   * @param initTransferEvent - Transfer event of the previously-initiated transfer
   * @param feeRecipient - Address of the fee recipient, can be the original sender or a relayer
   * @returns Promise resolving to the transaction hash
   */
  async signTransfer(
    initTransferEvent: InitTransferEvent,
    feeRecipient: AccountId,
  ): Promise<SignTransferEvent> {
    const args: SignTransferArgs = {
      transfer_id: {
        origin_chain: "Near",
        origin_nonce: BigInt(initTransferEvent.transfer_message.origin_nonce),
      },
      fee_recipient: feeRecipient,
      fee: {
        fee: initTransferEvent.transfer_message.fee.fee,
        native_fee: initTransferEvent.transfer_message.fee.native_fee,
      },
    }

    const outcome = await this.wallet.signAndSendTransaction({
      receiverId: this.lockerAddress,
      actions: [
        actionCreators.functionCall(
          "sign_transfer",
          args,
          BigInt(GAS.SIGN_TRANSFER),
          BigInt(DEPOSIT.SIGN_TRANSFER),
        ),
      ],
      waitUntil: "FINAL",
    })

    // Parse event from transaction logs
    const event = outcome.receipts_outcome
      .flatMap((receipt) => receipt.outcome.logs)
      .find((log) => log.includes("SignTransferEvent"))

    if (!event) {
      throw new Error("SignTransferEvent not found in transaction logs")
    }

    return JSON.parse(event).SignTransferEvent
  }

  /**
   * Finalizes a cross-chain token transfer on NEAR by processing the transfer proof and managing storage deposits.
   * Supports both Wormhole VAA and EVM proof verification for transfers from supported chains.
   *
   * @param token - The token identifier on NEAR where transferred tokens will be minted
   * @param account - The recipient account ID on NEAR
   * @param storageDepositAmount - Amount of NEAR tokens for storage deposit (in yoctoNEAR)
   * @param sourceChain - The originating chain of the transfer
   * @param vaa - Optional Wormhole Verified Action Approval containing transfer information, encoded as a hex string
   * @param evmProof - Optional proof data for transfers from EVM-compatible chains
   *
   * @throws {Error} When neither VAA nor EVM proof is provided
   * @throws {Error} When EVM proof is provided for non-EVM chains (only valid for Ethereum, Arbitrum, or Base)
   *
   * @returns Promise resolving to the finalization transaction hash
   *
   */
  async finalizeTransfer(
    token: AccountId,
    account: AccountId,
    storageDepositAmount: U128,
    sourceChain: ChainKind,
    vaa?: string,
    evmProof?: EvmVerifyProofArgs,
    proofKind: ProofKind = ProofKind.InitTransfer,
  ): Promise<string> {
    if (!vaa && !evmProof) {
      throw new Error("Must provide either VAA or EVM proof")
    }
    if (evmProof) {
      if (
        sourceChain !== ChainKind.Eth &&
        sourceChain !== ChainKind.Arb &&
        sourceChain !== ChainKind.Base
      ) {
        throw new Error("EVM proof is only valid for Ethereum, Arbitrum, or Base")
      }
    }
    let proverArgsSerialized: Uint8Array = new Uint8Array(0)
    if (vaa) {
      const proverArgs: WormholeVerifyProofArgs = {
        proof_kind: proofKind,
        vaa: vaa,
      }
      proverArgsSerialized = WormholeVerifyProofArgsSchema.serialize(proverArgs)
    } else if (evmProof) {
      const proverArgs: EvmVerifyProofArgs = {
        proof_kind: proofKind,
        proof: evmProof.proof,
      }
      proverArgsSerialized = EvmVerifyProofArgsSchema.serialize(proverArgs)
    }

    const args: FinTransferArgs = {
      chain_kind: sourceChain,
      storage_deposit_actions: [
        {
          token_id: token,
          account_id: account,
          storage_deposit_amount: storageDepositAmount,
        },
      ],
      prover_args: proverArgsSerialized,
    }
    const serializedArgs = FinTransferArgsSchema.serialize(args)

    // Retrieve required deposit dynamically for fin_transfer
    const finDepositStr = await this.wallet.provider.callFunction(
      this.lockerAddress,
      "required_balance_for_fin_transfer",
      {},
    )
    const finDeposit = BigInt(finDepositStr as string)

    const tx = await this.wallet.signAndSendTransaction({
      receiverId: this.lockerAddress,
      actions: [
        actionCreators.functionCall(
          "fin_transfer",
          serializedArgs,
          BigInt(GAS.FIN_TRANSFER),
          BigInt(finDeposit),
        ),
      ],
    })
    return tx.transaction.hash
  }

  /**
   * Retrieves various balance information for the current account
   * @private
   * @returns Promise resolving to object containing required balances and storage information
   * @throws {Error} If balance fetching fails
   */
  private async getBalances(): Promise<BalanceResults> {
    try {
      const [regBalanceStr, initBalanceStr, finBalanceStr, bindBalanceStr, storage] =
        await Promise.all([
          this.wallet.provider.callFunction(this.lockerAddress, "required_balance_for_account", {}),
          this.wallet.provider.callFunction(
            this.lockerAddress,
            "required_balance_for_init_transfer",
            {},
          ),
          this.wallet.provider.callFunction(
            this.lockerAddress,
            "required_balance_for_fin_transfer",
            {},
          ),
          this.wallet.provider.callFunction(
            this.lockerAddress,
            "required_balance_for_bind_token",
            {},
          ),
          this.wallet.provider.callFunction(this.lockerAddress, "storage_balance_of", {
            account_id: this.wallet.accountId,
          }),
          this.wallet.provider.callFunction(this.lockerAddress, "storage_balance_of", {
            account_id: this.wallet.accountId,
          }),
        ])

      // Convert storage balance to bigint
      let convertedStorage = null
      if (storage) {
        const storageBalance = storage as { total: string; available: string }
        convertedStorage = {
          total: BigInt(storageBalance.total),
          available: BigInt(storageBalance.available),
        }
      }

      return {
        regBalance: BigInt(regBalanceStr as string),
        initBalance: BigInt(initBalanceStr as string),
        finBalance: BigInt(finBalanceStr as string),
        bindBalance: BigInt(bindBalanceStr as string),
        storage: convertedStorage,
      }
    } catch (error) {
      console.error("Error fetching balances:", error)
      throw error
    }
  }

  /// Performs a storage deposit on behalf of the token_locker so that the tokens can be transferred to the locker. To be called once for each NEP-141
  private async storageDepositForToken(tokenAddress: string): Promise<string> {
    const storage = (await this.wallet.provider.callFunction(tokenAddress, "storage_balance_of", {
      account_id: this.lockerAddress,
    })) as string
    if (storage === null) {
      // Check how much is required
      const bounds = (await this.wallet.provider.callFunction(
        tokenAddress,
        "storage_balance_bounds",
        {
          account_id: this.lockerAddress,
        },
      )) as { min: string; max: string }
      const requiredAmount = BigInt(bounds.min)

      const tx = await this.wallet.signAndSendTransaction({
        receiverId: tokenAddress,
        actions: [
          actionCreators.functionCall(
            "storage_deposit",
            {
              account_id: this.lockerAddress,
            },
            BigInt(GAS.STORAGE_DEPOSIT),
            BigInt(requiredAmount),
          ),
        ],
      })
      return tx.transaction.hash
    }
    return storage
  }

  /**
   * Gets the required balance for fast transfer operations
   * @private
   * @returns Promise resolving to the required balance amount in yoctoNEAR
   */
  async getRequiredBalanceForFastTransfer(): Promise<bigint> {
    const balanceStr = await this.wallet.viewFunction({
      contractId: this.lockerAddress,
      methodName: "required_balance_for_fast_transfer",
    })
    return BigInt(balanceStr)
  }

  /**
   * Performs a fast finalize transfer on NEAR chain.
   *
   * This method enables relayers to "front" tokens to users immediately upon detecting
   * an InitTransfer event on an EVM chain, without waiting for full cryptographic finality.
   * The relayer provides their own tokens to the user instantly, and later gets reimbursed
   * when the original cross-chain proof is processed.
   *
   * The process:
   * 1. Relayer transfers their own tokens from their NEAR account to the bridge contract
   * 2. Bridge contract immediately sends tokens to the final recipient
   * 3. Bridge marks the transfer as completed and records the relayer as owed reimbursement
   * 4. Later, when the slow cryptographic proof arrives, the relayer gets reimbursed
   *
   * @param args - Fast finalize transfer arguments containing token, amount, recipient, transfer_id, relayer info, etc.
   * @returns Promise resolving to the NEAR transaction hash
   * @throws {Error} If the transaction fails or required storage deposit fails
   */
  async fastFinTransfer(args: FastFinTransferArgs): Promise<string> {
    // Get required balance for fast transfer
    const requiredBalance = await this.getRequiredBalanceForFastTransfer()
    const storageDepositAmount = args.storage_deposit_amount
      ? BigInt(args.storage_deposit_amount)
      : BigInt(0)
    const totalRequiredBalance = requiredBalance + storageDepositAmount

    // Check current storage balance and deposit if needed
    const storage = await this.wallet.viewFunction({
      contractId: this.lockerAddress,
      methodName: "storage_balance_of",
      args: {
        account_id: this.wallet.accountId,
      },
    })

    const existingBalance = storage?.available ? BigInt(storage.available) : BigInt(0)
    const neededAmount = totalRequiredBalance - existingBalance

    if (neededAmount > 0) {
      await this.wallet.functionCall({
        contractId: this.lockerAddress,
        methodName: "storage_deposit",
        args: {},
        gas: GAS.STORAGE_DEPOSIT,
        attachedDeposit: neededAmount,
      })
    }

    // Construct message for ft_transfer_call
    const message = {
      FastFinTransfer: {
        recipient: args.recipient,
        fee: args.fee,
        transfer_id: {
          origin_chain: args.transfer_id.origin_chain,
          origin_nonce: args.transfer_id.origin_nonce.toString(),
        },
        msg: args.msg,
        storage_deposit_amount: args.storage_deposit_amount,
        relayer: args.relayer,
      },
    }

    const transferArgs = {
      receiver_id: this.lockerAddress,
      amount: args.amount,
      msg: JSON.stringify(message),
    }

    // Execute the fast finalize transfer
    const tx = await this.wallet.functionCall({
      contractId: args.token_id,
      methodName: "ft_transfer_call",
      args: transferArgs,
      gas: GAS.FAST_FIN_TRANSFER,
      attachedDeposit: DEPOSIT.INIT_TRANSFER,
    })

    return tx.transaction.hash
  }

  /**
   * Performs a complete fast transfer from EVM to NEAR.
   * This function orchestrates the entire fast transfer process:
   * 1. Fetches and parses the InitTransfer event from the EVM transaction
   * 2. Gets the corresponding NEAR token ID using getBridgedToken
   * 3. Executes the fast finalize transfer on NEAR
   *
   * @param originChain - The EVM chain where the original transfer was initiated
   * @param evmTxHash - Transaction hash of the InitTransfer on the EVM chain
   * @param evmClient - EVM bridge client for parsing the transaction
   * @param storageDepositAmount - Optional storage deposit amount in yoctoNEAR
   * @returns Promise resolving to the NEAR transaction hash
   * @throws {Error} If the origin chain is not supported for fast transfers
   * @throws {Error} If the EVM transaction or event cannot be found/parsed
   * @throws {Error} If the fast transfer execution fails
   */
  async nearFastTransfer(
    originChain: ChainKind,
    evmTxHash: string,
    evmClient: EvmBridgeClient,
    storageDepositAmount?: string,
  ): Promise<string> {
    // Validate supported chains for fast transfer
    if (!isEvmChain(originChain)) {
      throw new Error(`Fast transfer is not supported for chain kind: ${ChainKind[originChain]}`)
    }

    // Step 1: Parse the InitTransfer event from EVM transaction
    const transferEvent = await evmClient.parseInitTransferEvent(evmTxHash)

    // Step 2: Get the NEAR token ID for the EVM token using getBridgedToken
    const omniTokenAddress = omniAddress(originChain, transferEvent.tokenAddress)
    const nearTokenAddress = await getBridgedToken(omniTokenAddress, ChainKind.Near)

    if (!nearTokenAddress) {
      throw new Error(`No bridged token found on NEAR for ${omniTokenAddress}`)
    }

    const nearTokenId = nearTokenAddress.split(":")[1] // Extract account ID from near:account.near

    // Step 3: Construct the transfer ID
    const transferId: TransferId = {
      origin_chain: ChainKind[originChain], // Convert enum to string
      origin_nonce: transferEvent.originNonce,
    }

    // Step 4: Execute the fast finalize transfer
    const fastTransferArgs: FastFinTransferArgs = {
      token_id: nearTokenId,
      amount: transferEvent.amount.toString(),
      transfer_id: transferId,
      recipient: transferEvent.recipient,
      fee: {
        fee: transferEvent.fee.toString(),
        native_fee: transferEvent.nativeTokenFee.toString(),
      },
      msg: transferEvent.message,
      storage_deposit_amount: storageDepositAmount,
      relayer: this.wallet.accountId,
    }

    return await this.fastFinTransfer(fastTransferArgs)
  }
}
