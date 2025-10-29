import { callViewMethod, createRpcClientWrapper } from "@near-js/client"
import { JsonRpcProvider } from "@near-js/providers"
import type { FinalExecutionOutcome } from "@near-js/types"
import type { Optional, Transaction, WalletSelector } from "@near-wallet-selector/core"
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
  MPCSignature,
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
import { getChain, isEvmChain, omniAddress } from "../utils/index.js"
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

/**
 * UTXO-specific transfer options (for BTC/Zcash chains)
 */
interface UtxoTransferOptions {
  gas_fee?: string
}

type InitTransferMessage = {
  recipient: OmniAddress
  fee: string
  native_token_fee: string
  msg?: string
  options?: UtxoTransferOptions
}

interface StorageDepositOptions {
  additionalTransactions?: Array<Optional<Transaction, "signerId">>
}

interface InitTransferOptions extends StorageDepositOptions {}

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
export class NearWalletSelectorBridgeClient {
  /**
   * Creates a new NEAR bridge client instance
   * @param selector - NEAR wallet selector instance for transaction signing
   * @param lockerAddress - Address of the token locker contract
   * @throws {Error} If locker address is not configured
   */
  constructor(
    private selector: WalletSelector,
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

    const wallet = await this.selector.wallet()
    const outcome: FinalExecutionOutcome = await wallet.signAndSendTransaction({
      receiverId: this.lockerAddress,
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: "log_metadata",
            args,
            gas: GAS.LOG_METADATA.toString(),
            deposit: DEPOSIT.LOG_METADATA.toString(),
          },
        },
      ],
    })
    if (!outcome) {
      throw new Error("Failed to log metadata")
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
   * @param evmProof - EVM proof for Ethereum or EVM chain verification
   * @returns Promise resolving to the transaction hash
   */
  async deployToken(
    destinationChain: ChainKind,
    vaa?: string,
    evmProof?: EvmVerifyProofArgs,
  ): Promise<string> {
    if (!vaa && !evmProof) {
      throw new Error("Must provide either VAA or EVM proof")
    }

    let proverArgsSerialized: Uint8Array = new Uint8Array(0)
    if (vaa) {
      const proverArgs: WormholeVerifyProofArgs = {
        proof_kind: ProofKind.LogMetadata,
        vaa: vaa,
      }
      proverArgsSerialized = WormholeVerifyProofArgsSchema.serialize(proverArgs)
    } else if (evmProof) {
      proverArgsSerialized = EvmVerifyProofArgsSchema.serialize(evmProof)
    }

    // Construct deploy token arguments
    const args: DeployTokenArgs = {
      chain_kind: destinationChain,
      prover_args: proverArgsSerialized,
    }
    const serializedArgs = DeployTokenArgsSchema.serialize(args)

    // Retrieve required deposit dynamically for deploy_token
    const deployDepositStr = await this.viewFunction({
      contractId: this.lockerAddress,
      methodName: "required_balance_for_deploy_token",
    })

    const wallet = await this.selector.wallet()
    const outcome: FinalExecutionOutcome = await wallet.signAndSendTransaction({
      receiverId: this.lockerAddress,
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: "deploy_token",
            args: serializedArgs,
            gas: GAS.DEPLOY_TOKEN.toString(),
            deposit: deployDepositStr,
          },
        },
      ],
    })
    if (!outcome) {
      throw new Error("Failed to deploy token")
    }

    return outcome.transaction.hash
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
      if (sourceChain !== ChainKind.Eth) {
        throw new Error("EVM proof is only valid for Ethereum")
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

    const wallet = await this.selector.wallet()

    // Retrieve required deposit dynamically for bind_token
    const bindDepositStr = await this.viewFunction({
      contractId: this.lockerAddress,
      methodName: "required_balance_for_bind_token",
    })

    const outcome = await wallet.signAndSendTransaction({
      receiverId: this.lockerAddress,
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: "bind_token",
            args: serializedArgs,
            gas: GAS.BIND_TOKEN.toString(),
            deposit: bindDepositStr,
          },
        },
      ],
    })
    if (!outcome) {
      throw new Error("Failed to bind token")
    }
    return outcome.transaction.hash
  }

  async storageDeposit(
    transfer: OmniTransferMessage,
    options: StorageDepositOptions = {},
  ): Promise<Array<Optional<Transaction, "signerId">>> {
    // Performs a storage deposit on behalf of the token_locker so that the tokens can be transferred to the locker.
    // To be called once for each NEP-141

    // Start with any injected transactions
    const transactions: Array<Optional<Transaction, "signerId">> = [
      ...(options.additionalTransactions || []),
    ]

    if (getChain(transfer.tokenAddress) !== ChainKind.Near) {
      throw new Error("Token address must be on NEAR")
    }
    const tokenAddress = transfer.tokenAddress.split(":")[1]

    // First, check if the FT has the token locker contract registered for storage
    const lockerStorage = await this.viewFunction({
      contractId: tokenAddress,
      methodName: "storage_balance_of",
      args: {
        account_id: this.lockerAddress,
      },
    })
    if (lockerStorage === null) {
      // Check how much is required
      const bounds = await this.viewFunction({
        contractId: tokenAddress,
        methodName: "storage_balance_bounds",
        args: {
          account_id: this.lockerAddress,
        },
      })
      const requiredAmount = BigInt(bounds.min)

      transactions.push({
        receiverId: tokenAddress,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "storage_deposit",
              args: {
                account_id: this.lockerAddress,
              },
              gas: GAS.STORAGE_DEPOSIT.toString(),
              deposit: requiredAmount.toString(),
            },
          },
        ],
      })
    }

    // Now do the storage deposit dance for the locker itself
    const { regBalance, initBalance, storage } = await this.getBalances()
    const requiredBalance = regBalance + initBalance
    const existingBalance = storage?.available ?? BigInt(0)
    const neededAmount = requiredBalance - existingBalance + transfer.nativeFee

    if (neededAmount > 0) {
      transactions.push({
        receiverId: this.lockerAddress,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "storage_deposit",
              args: {},
              gas: GAS.STORAGE_DEPOSIT.toString(),
              deposit: neededAmount.toString(),
            },
          },
        ],
      })
    }

    return transactions
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

  async initTransfer(
    transfer: OmniTransferMessage,
    options: InitTransferOptions = {},
  ): Promise<InitTransferEvent> {
    if (getChain(transfer.tokenAddress) !== ChainKind.Near) {
      throw new Error("Token address must be on NEAR")
    }
    const tokenAddress = transfer.tokenAddress.split(":")[1]

    // Pass through any additional transactions to storageDeposit
    const transactions = await this.storageDeposit(transfer, {
      additionalTransactions: options.additionalTransactions,
    })

    // Build message from options.maxFee if not explicitly provided
    let message = transfer.message
    if (!message && transfer.options?.maxFee !== undefined) {
      message = JSON.stringify({
        MaxGasFee: transfer.options.maxFee.toString(),
      })
    }

    const initTransferMessage: InitTransferMessage = {
      recipient: transfer.recipient,
      fee: transfer.fee.toString(),
      native_token_fee: transfer.nativeFee.toString(),
      msg: message,
    }

    // For UTXO chains (BTC/Zcash), include gas_fee if provided
    if (transfer.options?.gasFee !== undefined) {
      initTransferMessage.options = {
        gas_fee: transfer.options.gasFee.toString(),
      }
    }

    const args: InitTransferMessageArgs = {
      receiver_id: this.lockerAddress,
      amount: transfer.amount.toString(),
      memo: null,
      msg: JSON.stringify(initTransferMessage),
    }

    transactions.push({
      receiverId: tokenAddress,
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: "ft_transfer_call",
            args,
            gas: GAS.INIT_TRANSFER.toString(),
            deposit: DEPOSIT.INIT_TRANSFER.toString(),
          },
        },
      ],
    })
    const wallet = await this.selector.wallet()
    const tx: FinalExecutionOutcome[] = await wallet.signAndSendTransactions({ transactions })
    if (!tx) {
      throw new Error("Transaction failed")
    }

    // Parse event from transaction logs
    let event: string | undefined
    for (const receipt of tx) {
      event = receipt.receipts_outcome
        .flatMap((r) => r.outcome.logs)
        .find((log) => log.includes("InitTransferEvent"))
      if (event) break
    }

    if (!event) {
      throw new Error("InitTransferEvent not found in transaction logs")
    }
    return JSON.parse(event).InitTransferEvent
  }

  parseSignTransferEvent(json: string): SignTransferEvent {
    const parsed = JSON.parse(json, (key, value) => {
      // Convert only if the key matches *and* the value is a decimal string
      if (key === "origin_nonce" && typeof value === "string" && /^\d+$/.test(value)) {
        return BigInt(value)
      }
      return value
    })
    const signedEvent = parsed.SignTransferEvent as SignTransferEvent
    signedEvent.signature = new MPCSignature(
      parsed.SignTransferEvent.signature.big_r,
      parsed.SignTransferEvent.signature.s,
      parsed.SignTransferEvent.signature.recovery_id,
    )
    return signedEvent
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
    // biome-ignore lint/suspicious/noExplicitAny: TS will complain that `toJSON()` does not exist on BigInt
    // biome-ignore lint/complexity/useLiteralKeys: TS will complain that `toJSON()` does not exist on BigInt
    ;(BigInt.prototype as any)["toJSON"] = function () {
      // The contract can't accept `origin_nonce` as a string, so we have to serialize it as a number.
      // However, this can cause precision loss if the number is too large. We'll check if it's safe to convert
      // and if not, we'll serialize it as a string and the contract will have to handle it.
      const maxSafe = BigInt(Number.MAX_SAFE_INTEGER)
      if (this <= maxSafe) {
        return Number(this)
      }
      return this.toString()
    }
    const args: SignTransferArgs = {
      transfer_id: {
        origin_chain: ChainKind[getChain(initTransferEvent.transfer_message.sender)],
        origin_nonce: BigInt(initTransferEvent.transfer_message.origin_nonce),
      },
      fee_recipient: feeRecipient,
      fee: {
        fee: initTransferEvent.transfer_message.fee.fee,
        native_fee: initTransferEvent.transfer_message.fee.native_fee,
      },
    }

    const wallet = await this.selector.wallet()
    const outcome: FinalExecutionOutcome = await wallet.signAndSendTransaction({
      receiverId: this.lockerAddress,
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: "sign_transfer",
            args,
            gas: GAS.SIGN_TRANSFER.toString(),
            deposit: DEPOSIT.SIGN_TRANSFER.toString(),
          },
        },
      ],
    })
    if (!outcome) {
      throw new Error("Failed to sign transfer")
    }

    // Parse event from transaction logs
    const event = outcome.receipts_outcome
      .flatMap((receipt) => receipt.outcome.logs)
      .find((log) => log.includes("SignTransferEvent"))

    if (!event) {
      throw new Error("SignTransferEvent not found in transaction logs")
    }

    return this.parseSignTransferEvent(event)
  }

  /**
   * Finalizes a cross-chain token transfer on NEAR by processing the transfer proof and managing storage deposits.
   * Supports both Wormhole VAA and EVM proof verification for transfers from supported chains.
   *
   * @param token - The token identifier on NEAR where transferred tokens will be minted
   * @param account - The recipient account ID on NEAR
   * @param storageDepositAmount - Amount of NEAR tokens for storage deposit (in yoctoNEAR)
   * @param sourceChain - The originating chain of the transfer
   * @param vaa - Optional Wormhole Verified Action Approval containing transfer information
   * @param evmProof - Optional proof data for transfers from EVM-compatible chains
   *
   * @throws {Error} When neither VAA nor EVM proof is provided
   * @throws {Error} When EVM proof is provided for non-EVM chains (only valid for Ethereum, Arbitrum, or Base)
   *
   * @returns Promise resolving to the finalization transaction hash
   *
   */
  async finalizeTransfer(
    token: string,
    account: string,
    storageDepositAmount: U128,
    sourceChain: ChainKind,
    vaa?: string,
    evmProof?: EvmVerifyProofArgs,
    proofKind: ProofKind = ProofKind.InitTransfer,
  ): Promise<FinalExecutionOutcome> {
    if (!vaa && !evmProof) {
      throw new Error("Must provide either VAA or EVM proof")
    }
    if (evmProof) {
      if (sourceChain !== ChainKind.Eth) {
        throw new Error("EVM proof is only valid for Ethereum")
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
        proof_kind: evmProof.proof_kind ?? proofKind,
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

    const wallet = await this.selector.wallet()

    // Retrieve required deposit dynamically for fin_transfer
    const finDepositStr = await this.viewFunction({
      contractId: this.lockerAddress,
      methodName: "required_balance_for_fin_transfer",
    })
    const finDeposit = BigInt(finDepositStr as string) + storageDepositAmount

    const outcome = await wallet.signAndSendTransaction({
      receiverId: this.lockerAddress,
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: "fin_transfer",
            args: serializedArgs,
            gas: GAS.FIN_TRANSFER.toString(),
            deposit: finDeposit.toString(),
          },
        },
      ],
    })
    if (!outcome) {
      throw new Error("Failed to finalize transfer")
    }
    return outcome
  }

  /**
   * Retrieves various balance information for the current account
   * @private
   * @returns Promise resolving to object containing required balances and storage information
   * @throws {Error} If balance fetching fails
   */
  private async getBalances(): Promise<BalanceResults> {
    try {
      const wallet = await this.selector.wallet()
      const accounts = await wallet.getAccounts()
      const accountId = accounts[0].accountId
      const { network } = this.selector.options
      const provider = new JsonRpcProvider({ url: network.nodeUrl })
      provider.query({
        request_type: "view_account",
        finality: "final",
        account_id: accountId,
      })

      const [regBalanceStr, initBalanceStr, finBalanceStr, bindBalanceStr, storage] =
        await Promise.all([
          this.viewFunction({
            contractId: this.lockerAddress,
            methodName: "required_balance_for_account",
          }),
          this.viewFunction({
            contractId: this.lockerAddress,
            methodName: "required_balance_for_init_transfer",
          }),
          this.viewFunction({
            contractId: this.lockerAddress,
            methodName: "required_balance_for_fin_transfer",
          }),
          this.viewFunction({
            contractId: this.lockerAddress,
            methodName: "required_balance_for_bind_token",
          }),
          this.viewFunction({
            contractId: this.lockerAddress,
            methodName: "storage_balance_of",
            args: {
              account_id: accountId,
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

  private async viewFunction({
    contractId,
    methodName,
    args = {},
  }: {
    contractId: string
    methodName: string
    args?: object
    // biome-ignore lint/suspicious/noExplicitAny: Arbitrary types needed for JSON response
  }): Promise<any> {
    const { network } = this.selector.options
    const rpcProvider = createRpcClientWrapper([network.nodeUrl])

    const res = await callViewMethod({
      account: contractId,
      method: methodName,
      args,
      deps: { rpcProvider },
    })
    return JSON.parse(Buffer.from(res.result).toString())
  }

  /**
   * Gets the required balance for fast transfer operations
   * @private
   * @returns Promise resolving to the required balance amount in yoctoNEAR
   */
  async getRequiredBalanceForFastTransfer(): Promise<bigint> {
    const balanceStr = await this.viewFunction({
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
    const storageDepositAmount = BigInt(args.storage_deposit_amount ?? 0)
    const totalRequiredBalance = requiredBalance + storageDepositAmount

    // Check current storage balance and deposit if needed
    const wallet = await this.selector.wallet()
    const accounts = await wallet.getAccounts()
    const accountId = accounts[0].accountId

    const storage = await this.viewFunction({
      contractId: this.lockerAddress,
      methodName: "storage_balance_of",
      args: {
        account_id: accountId,
      },
    })

    const existingBalance = storage?.available ? BigInt(storage.available) : BigInt(0)
    const neededAmount = totalRequiredBalance - existingBalance

    const transactions: Array<Optional<Transaction, "signerId">> = []

    if (neededAmount > 0) {
      transactions.push({
        receiverId: this.lockerAddress,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "storage_deposit",
              args: {},
              gas: GAS.STORAGE_DEPOSIT.toString(),
              deposit: neededAmount.toString(),
            },
          },
        ],
      })
    }

    const transferArgs = {
      receiver_id: this.lockerAddress,
      amount: args.amount,
      msg: JSON.stringify(args),
    }

    transactions.push({
      receiverId: args.token_id,
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: "ft_transfer_call",
            args: transferArgs,
            gas: GAS.FAST_FIN_TRANSFER.toString(),
            deposit: DEPOSIT.INIT_TRANSFER.toString(),
          },
        },
      ],
    })

    // Execute the fast finalize transfer
    const outcome = await wallet.signAndSendTransactions({ transactions })
    if (!outcome || outcome.length === 0) {
      throw new Error("Fast finalize transfer failed")
    }

    return outcome[outcome.length - 1].transaction.hash
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
    const transferEvent = await evmClient.getInitTransferEvent(evmTxHash)

    // Step 2: Get the NEAR token ID for the EVM token using getBridgedToken
    const omniTokenAddress = omniAddress(originChain, transferEvent.tokenAddress)
    const nearTokenAddress = await getBridgedToken(omniTokenAddress, ChainKind.Near)

    if (!nearTokenAddress) {
      throw new Error(`No bridged token found on NEAR for ${omniTokenAddress}`)
    }

    const nearTokenId = nearTokenAddress.split(":")[1] // Extract account ID from near:account.near

    // Step 3: Get relayer account
    const wallet = await this.selector.wallet()
    const accounts = await wallet.getAccounts()
    const relayerAccountId = accounts[0].accountId

    // Step 4: Construct the transfer ID
    const transferId: TransferId = {
      origin_chain: originChain, // Use numeric enum value
      origin_nonce: transferEvent.originNonce,
    }

    // Step 5: Execute the fast finalize transfer - pass amounts directly
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
      relayer: relayerAccountId,
    }

    return await this.fastFinTransfer(fastTransferArgs)
  }
}
