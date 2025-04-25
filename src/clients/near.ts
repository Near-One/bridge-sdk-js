import type { Account } from "near-api-js"
import { functionCall } from "near-api-js/lib/transaction"
import { addresses } from "../config"
import {
  type AccountId,
  type BindTokenArgs,
  BindTokenArgsSchema,
  ChainKind,
  type DeployTokenArgs,
  DeployTokenArgsSchema,
  type EvmVerifyProofArgs,
  EvmVerifyProofArgsSchema,
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
  type U128,
  type WormholeVerifyProofArgs,
  WormholeVerifyProofArgsSchema,
} from "../types"
import { getChain } from "../utils"

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
    const MAX_POLLING_ATTEMPTS = 60 // 60 seconds timeout
    const POLLING_INTERVAL = 1000 // 1 second between attempts

    if (getChain(tokenAddress) !== ChainKind.Near) {
      throw new Error("Token address must be on NEAR")
    }

    const [_, tokenAccountId] = tokenAddress.split(":")
    const args: LogMetadataArgs = { token_id: tokenAccountId }

    // Need to use signTransaction due to NEAR API limitations around timeouts
    // @ts-expect-error: Account.signTransaction is protected but necessary here
    const [txHash, signedTx] = await this.wallet.signTransaction(this.lockerAddress, [
      functionCall("log_metadata", args, GAS.LOG_METADATA, DEPOSIT.LOG_METADATA),
    ])

    const provider = this.wallet.connection.provider
    let outcome = await provider.sendTransactionAsync(signedTx)

    // Poll for transaction execution
    let attempts = 0
    while (outcome.final_execution_status !== "EXECUTED" && attempts < MAX_POLLING_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL))
      outcome = await provider.txStatus(txHash, this.wallet.accountId, "INCLUDED")
      attempts++
    }

    if (attempts >= MAX_POLLING_ATTEMPTS) {
      throw new Error(`Transaction polling timed out after ${MAX_POLLING_ATTEMPTS} seconds`)
    }

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
    const deployDeposit = BigInt(deployDepositStr)

    const tx = await this.wallet.functionCall({
      contractId: this.lockerAddress,
      methodName: "deploy_token",
      args: serializedArgs,
      gas: GAS.DEPLOY_TOKEN,
      attachedDeposit: deployDeposit,
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
    const bindDepositStr = await this.wallet.viewFunction({
      contractId: this.lockerAddress,
      methodName: "required_balance_for_bind_token",
    })
    const bindDeposit = BigInt(bindDepositStr)

    const tx = await this.wallet.functionCall({
      contractId: this.lockerAddress,
      methodName: "bind_token",
      args: serializedArgs,
      gas: GAS.BIND_TOKEN,
      attachedDeposit: bindDeposit,
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
    const tx = await this.wallet.functionCall({
      contractId: tokenAddress,
      methodName: "ft_transfer_call",
      args,
      gas: GAS.INIT_TRANSFER,
      attachedDeposit: DEPOSIT.INIT_TRANSFER,
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
    const MAX_POLLING_ATTEMPTS = 60 // 60 seconds timeout
    const POLLING_INTERVAL = 1000 // 1 second between attempts

    const args: SignTransferArgs = {
      transfer_id: {
        origin_chain: "Near",
        origin_nonce: initTransferEvent.transfer_message.origin_nonce,
      },
      fee_recipient: feeRecipient,
      fee: {
        fee: initTransferEvent.transfer_message.fee.fee,
        native_fee: initTransferEvent.transfer_message.fee.native_fee,
      },
    }

    // Need to use signTransaction due to NEAR API limitations around timeouts
    // @ts-expect-error: Account.signTransaction is protected but necessary here
    const [txHash, signedTx] = await this.wallet.signTransaction(this.lockerAddress, [
      functionCall("sign_transfer", args, GAS.SIGN_TRANSFER, DEPOSIT.SIGN_TRANSFER),
    ])

    const provider = this.wallet.connection.provider
    let outcome = await provider.sendTransactionAsync(signedTx)

    // Poll for transaction execution
    let attempts = 0
    while (outcome.final_execution_status !== "EXECUTED" && attempts < MAX_POLLING_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL))
      outcome = await provider.txStatus(txHash, this.wallet.accountId, "INCLUDED")
      attempts++
    }

    if (attempts >= MAX_POLLING_ATTEMPTS) {
      throw new Error(`Transaction polling timed out after ${MAX_POLLING_ATTEMPTS} seconds`)
    }

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
    const finDepositStr = await this.wallet.viewFunction({
      contractId: this.lockerAddress,
      methodName: "required_balance_for_fin_transfer",
    })
    const finDeposit = BigInt(finDepositStr)

    const tx = await this.wallet.functionCall({
      contractId: this.lockerAddress,
      methodName: "fin_transfer",
      args: serializedArgs,
      gas: GAS.FIN_TRANSFER,
      attachedDeposit: finDeposit,
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
          this.wallet.viewFunction({
            contractId: this.lockerAddress,
            methodName: "required_balance_for_account",
          }),
          this.wallet.viewFunction({
            contractId: this.lockerAddress,
            methodName: "required_balance_for_init_transfer",
          }),
          this.wallet.viewFunction({
            contractId: this.lockerAddress,
            methodName: "required_balance_for_fin_transfer",
          }),
          this.wallet.viewFunction({
            contractId: this.lockerAddress,
            methodName: "required_balance_for_bind_token",
          }),
          this.wallet.viewFunction({
            contractId: this.lockerAddress,
            methodName: "storage_balance_of",
            args: {
              account_id: this.wallet.accountId,
            },
          }),
        ])

      // Convert storage balance to bigint
      let convertedStorage = null
      if (storage) {
        convertedStorage = {
          total: BigInt(storage.total),
          available: BigInt(storage.available),
        }
      }

      return {
        regBalance: BigInt(regBalanceStr),
        initBalance: BigInt(initBalanceStr),
        finBalance: BigInt(finBalanceStr),
        bindBalance: BigInt(bindBalanceStr),
        storage: convertedStorage,
      }
    } catch (error) {
      console.error("Error fetching balances:", error)
      throw error
    }
  }

  /// Performs a storage deposit on behalf of the token_locker so that the tokens can be transferred to the locker. To be called once for each NEP-141
  private async storageDepositForToken(tokenAddress: string): Promise<string> {
    const storage = await this.wallet.viewFunction({
      contractId: tokenAddress,
      methodName: "storage_balance_of",
      args: {
        account_id: this.lockerAddress,
      },
    })
    if (storage === null) {
      // Check how much is required
      const bounds = await this.wallet.viewFunction({
        contractId: tokenAddress,
        methodName: "storage_balance_bounds",
        args: {
          account_id: this.lockerAddress,
        },
      })
      const requiredAmount = BigInt(bounds.min)

      const tx = await this.wallet.functionCall({
        contractId: tokenAddress,
        methodName: "storage_deposit",
        args: {
          account_id: this.lockerAddress,
        },
        gas: GAS.STORAGE_DEPOSIT,
        attachedDeposit: requiredAmount,
      })
      return tx.transaction.hash
    }
    return storage
  }
}
