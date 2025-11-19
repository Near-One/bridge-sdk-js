import type { Account } from "@near-js/accounts"
import { actionCreators } from "@near-js/transactions"
import type { FinalExecutionOutcome } from "@near-js/types"
import { OmniBridgeAPI } from "../api.js"
import { addresses } from "../config.js"
import { BitcoinService } from "../services/bitcoin.js"
import { ZcashService } from "../services/zcash.js"
import {
  type AccountId,
  type BindTokenArgs,
  BindTokenArgsSchema,
  type BitcoinMerkleProofResponse,
  type BtcConnectorConfig,
  type BtcDepositArgs,
  ChainKind,
  type DeployTokenArgs,
  DeployTokenArgsSchema,
  type EvmVerifyProofArgs,
  EvmVerifyProofArgsSchema,
  type FastFinTransferArgs,
  type FinBtcTransferArgs,
  type FinTransferArgs,
  FinTransferArgsSchema,
  type InitBtcTransferMsg,
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
  type UTXO,
  UTXO_CHAIN_LABELS,
  type UtxoChain,
  type WormholeVerifyProofArgs,
  WormholeVerifyProofArgsSchema,
} from "../types/index.js"
import { getTokenDecimals, normalizeAmount } from "../utils/decimals.js"
import { getChain, isEvmChain, omniAddress } from "../utils/index.js"
import { getBridgedToken } from "../utils/tokens.js"
import type {
  UtxoChainService,
  UtxoDepositProof,
  UtxoPlanOverrides,
  UtxoWithdrawalPlan,
} from "../utxo/index.js"
import type { EvmBridgeClient } from "./evm.js"

/**
 * Configuration for NEAR network gas limits.
 * All values are specified in TGas (Terra Gas) units.
 * @internal
 */
const GAS = {
  LOG_METADATA: BigInt(3e14), // 300 TGas
  DEPLOY_TOKEN: BigInt(1.2e14), // 120 TGas
  BIND_TOKEN: BigInt(3e14), // 300 TGas
  INIT_TRANSFER: BigInt(3e14), // 300 TGas
  FIN_TRANSFER: BigInt(3e14), // 300 TGas
  SIGN_TRANSFER: BigInt(3e14), // 300 TGas
  STORAGE_DEPOSIT: BigInt(1e13), // 10 TGas
  // Bitcoin-specific gas constants
  GET_DEPOSIT_ADDRESS: BigInt(3e12), // 3 TGas
  VERIFY_DEPOSIT: BigInt(3e14), // 300 TGas
  INIT_BTC_TRANSFER: BigInt(1e14), // 100 TGas
  SIGN_BTC_TX: BigInt(3e14), // 300 TGas
  VERIFY_WITHDRAW: BigInt(5e12), // 5 TGas
  FAST_FIN_TRANSFER: BigInt(3e14), // 300 TGas
  SUBMIT_BTC_TRANSFER: BigInt(3e14), // 300 TGas
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
  // Bitcoin-specific deposit constants
  SIGN_BTC_TX: BigInt(1), // 1 yoctoNEAR
  VERIFY_WITHDRAW: BigInt(1), // 1 yoctoNEAR
} as const

/**
 * Bitcoin transaction signing wait configuration
 * @internal
 */
const BITCOIN_SIGNING_WAIT = {
  DEFAULT_MAX_ATTEMPTS: 30,
  DEFAULT_DELAY_MS: 10000, // 10 seconds
} as const

/**
 * Calculates bridge fee based on amount and fee configuration.
 * Implements the same logic as the Rust contract's BridgeFee::get_fee method.
 * @param bridgeFee - Bridge fee configuration with fee_min and fee_rate (u32 integer)
 * @param amount - Transfer amount to calculate fee for
 * @returns The calculated fee (max of percentage-based fee and minimum fee)
 */
function calculateBridgeFee(
  bridgeFee: { fee_min: string; fee_rate: number },
  amount: bigint,
): bigint {
  // Basis point denominator: 1 basis point = 0.01%, so 10000 = 100%.
  const MAX_RATIO = 10000n
  const feeRate = BigInt(bridgeFee.fee_rate)
  const feeMin = BigInt(bridgeFee.fee_min)

  const percentageFee = (amount * feeRate) / MAX_RATIO
  return percentageFee > feeMin ? percentageFee : feeMin
}

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

type InitTransferMessage = {
  recipient: OmniAddress
  fee: string
  native_token_fee: string
  msg?: string | undefined
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
  public bitcoinService: BitcoinService
  public zcashService?: ZcashService
  private readonly utxoServices: Partial<Record<UtxoChain, UtxoChainService>> = {}

  /**
   * Creates a new NEAR bridge client instance
   * @param wallet - NEAR account instance for transaction signing
   * @param lockerAddress - Address of the token locker contract
   * @throws {Error} If locker address is not configured
   */
  constructor(
    private wallet: Account,
    private lockerAddress: string = addresses.near.contract,
    private readonly options: { zcashApiKey?: string } = {},
  ) {
    if (lockerAddress) {
      this.lockerAddress = lockerAddress
    }
    // Configure BigInt serialization for JSON.stringify
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

    // Initialize Bitcoin service
    this.bitcoinService = new BitcoinService(addresses.btc.apiUrl, addresses.btc.network, {
      url: addresses.btc.rpcUrl,
    })
    this.utxoServices[ChainKind.Btc] = this.bitcoinService

    // Initialize Zcash service if API key configured via options or environment
    // biome-ignore lint/complexity/useLiteralKeys: process.env has index signature, requires bracket notation for noPropertyAccessFromIndexSignature
    const zcashApiKey = this.options.zcashApiKey || process.env["ZCASH_API_KEY"]
    if (zcashApiKey) {
      this.zcashService = new ZcashService(addresses.zcash.rpcUrl, zcashApiKey)
      this.utxoServices[ChainKind.Zcash] = this.zcashService
    }
  }

  /**
   * Get the network ID from the wallet connection
   */
  get networkId(): string {
    return (
      (this.wallet as { connection?: { networkId?: string } }).connection?.networkId || "unknown"
    )
  }

  /**
   * Get the bridge contract ID (locker address)
   */
  get bridgeContractId(): string {
    return this.lockerAddress
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

    const parts = tokenAddress.split(":")
    const tokenAccountId = parts[1]
    if (!tokenAccountId) {
      throw new Error("Invalid token address format")
    }
    const args: LogMetadataArgs = { token_id: tokenAccountId }

    const outcome = await this.wallet.signAndSendTransaction({
      receiverId: this.lockerAddress,
      actions: [
        actionCreators.functionCall("log_metadata", args, GAS.LOG_METADATA, DEPOSIT.LOG_METADATA),
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
    const deployDepositStr = (await this.wallet.provider.callFunction(
      this.lockerAddress,
      "required_balance_for_deploy_token",
      {},
    )) as string

    const tx = await this.wallet.signAndSendTransaction({
      receiverId: this.lockerAddress,
      actions: [
        actionCreators.functionCall(
          "deploy_token",
          serializedArgs,
          GAS.DEPLOY_TOKEN,
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
          GAS.BIND_TOKEN,
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
    const parts = transfer.tokenAddress.split(":")
    const tokenAddress = parts[1]
    if (!tokenAddress) {
      throw new Error("Invalid token address format")
    }

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

    // Build message from options.maxGasFee if not explicitly provided
    // Fail if both message and maxGasFee are provided to avoid ambiguity
    if (transfer.message && transfer.options?.maxGasFee !== undefined) {
      throw new Error(
        "Cannot provide both 'message' and 'options.maxGasFee'. Use one or the other.",
      )
    }

    let message = transfer.message
    if (!message && transfer.options?.maxGasFee !== undefined) {
      message = JSON.stringify({
        MaxGasFee: transfer.options.maxGasFee.toString(),
      })
    }

    const initTransferMessage: InitTransferMessage = {
      recipient: transfer.recipient,
      fee: transfer.fee.toString(),
      native_token_fee: transfer.nativeFee.toString(),
      msg: transfer.message ?? undefined,
    }
    const args: InitTransferMessageArgs = {
      receiver_id: this.lockerAddress,
      amount: transfer.amount.toString(),
      memo: null,
      msg: JSON.stringify(initTransferMessage),
    }

    console.log("Calling ft_transfer_call with args:", args)
    const tx = await this.wallet.signAndSendTransaction({
      receiverId: tokenAddress,
      actions: [
        actionCreators.functionCall(
          "ft_transfer_call",
          args,
          GAS.INIT_TRANSFER,
          DEPOSIT.INIT_TRANSFER,
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

  parseSignTransferEvent(json: string): SignTransferEvent {
    const parsed = JSON.parse(json, (key, value) => {
      // Convert origin_nonce from string or number to BigInt
      if (key === "origin_nonce") {
        if (typeof value === "string" && /^\d+$/.test(value)) {
          return BigInt(value)
        }
        if (typeof value === "number") {
          return BigInt(value)
        }
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

    const outcome = await this.wallet.signAndSendTransaction({
      receiverId: this.lockerAddress,
      actions: [
        actionCreators.functionCall(
          "sign_transfer",
          args,
          GAS.SIGN_TRANSFER,
          DEPOSIT.SIGN_TRANSFER,
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

    // Retrieve required deposit dynamically for fin_transfer
    const finDepositStr = await this.wallet.provider.callFunction(
      this.lockerAddress,
      "required_balance_for_fin_transfer",
      {},
    )
    const finDeposit = BigInt(finDepositStr as string) + storageDepositAmount

    const tx = await this.wallet.signAndSendTransaction({
      receiverId: this.lockerAddress,
      actions: [
        actionCreators.functionCall("fin_transfer", serializedArgs, GAS.FIN_TRANSFER, finDeposit),
      ],
      waitUntil: "FINAL",
    })
    return tx
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

  // =====================================================================
  // UTXO OPERATIONS (BTC & ZCASH)
  // =====================================================================

  private getUtxoService(chain: UtxoChain): UtxoChainService {
    const service = this.utxoServices[chain]
    if (service) {
      return service
    }

    if (chain === ChainKind.Zcash) {
      throw new Error("Zcash support requires initializing NearBridgeClient with a zcashApiKey")
    }

    throw new Error(`Unsupported UTXO chain: ${ChainKind[chain] ?? chain}`)
  }

  private getUtxoChainLabel(chain: UtxoChain): string {
    return UTXO_CHAIN_LABELS[chain] ?? ChainKind[chain] ?? String(chain)
  }

  private getUtxoConnector(chain: UtxoChain) {
    switch (chain) {
      case ChainKind.Btc:
        return {
          connector: addresses.btc.btcConnector,
          token: addresses.btc.btcToken,
        }
      case ChainKind.Zcash:
        this.getUtxoService(chain)
        return {
          connector: addresses.zcash.zcashConnector,
          token: addresses.zcash.zcashToken,
        }
      default:
        throw new Error(`Unsupported UTXO chain: ${ChainKind[chain] ?? chain}`)
    }
  }

  async getUtxoDepositAddress(
    chain: UtxoChain,
    recipientId: string,
    amount?: bigint,
    fee?: bigint,
  ): Promise<{ depositAddress: string; depositArgs: BtcDepositArgs }> {
    const { connector } = this.getUtxoConnector(chain)

    let depositMsg: BtcDepositArgs["deposit_msg"]
    if (recipientId.includes(":")) {
      if (!amount) {
        throw new Error("Amount is required for Omni address deposits")
      }
      depositMsg = {
        recipient_id: this.wallet.accountId,
        post_actions: [
          {
            receiver_id: this.lockerAddress,
            amount,
            msg: JSON.stringify({
              recipient: recipientId,
              fee: fee?.toString(),
              native_token_fee: "0",
            }),
          },
        ],
      }
    } else {
      depositMsg = {
        recipient_id: recipientId,
      }
    }

    const depositAddress = (await this.wallet.provider.callFunction(
      connector,
      "get_user_deposit_address",
      {
        deposit_msg: depositMsg,
      },
    )) as string

    return {
      depositAddress,
      depositArgs: { deposit_msg: depositMsg },
    }
  }

  async finalizeUtxoDeposit(
    chain: UtxoChain,
    txHash: string,
    vout: number,
    depositArgs: BtcDepositArgs,
  ): Promise<string> {
    const { connector } = this.getUtxoConnector(chain)
    const config = (await this.getUtxoBridgeConfig(chain)) as BtcConnectorConfig
    const service = this.getUtxoService(chain)
    const proof: UtxoDepositProof = await service.getDepositProof(txHash, vout)

    if (proof.amount < BigInt(config.min_deposit_amount)) {
      throw new Error(
        `Deposit amount ${proof.amount} is below minimum deposit amount ${config.min_deposit_amount}`,
      )
    }

    const args: FinBtcTransferArgs = {
      deposit_msg: depositArgs.deposit_msg,
      tx_bytes: proof.tx_bytes,
      vout,
      tx_block_blockhash: proof.tx_block_blockhash,
      tx_index: proof.tx_index,
      merkle_proof: proof.merkle_proof,
    }

    const tx = await this.wallet.signAndSendTransaction({
      receiverId: connector,
      actions: [actionCreators.functionCall("verify_deposit", args, GAS.VERIFY_DEPOSIT)],
      waitUntil: "FINAL",
    })

    return tx.transaction.hash
  }

  async initUtxoWithdrawal(
    chain: UtxoChain,
    targetAddress: string,
    amount: bigint,
  ): Promise<{ pendingId: string; nearTxHash: string }> {
    const chainLabel = this.getUtxoChainLabel(chain)

    const { connector, token } = this.getUtxoConnector(chain)

    const config = await this.getUtxoBridgeConfig(chain)
    if (amount < BigInt(config.min_withdraw_amount)) {
      throw new Error(
        `Amount ${amount} is below minimum withdrawal amount ${config.min_withdraw_amount}`,
      )
    }

    const utxos = await this.getUtxoAvailableOutputs(chain)
    if (!utxos.length) {
      throw new Error(`${chainLabel}: No UTXOs available for transaction`)
    }

    const plan: UtxoWithdrawalPlan = this.buildUtxoWithdrawalPlan(
      chain,
      utxos,
      amount,
      targetAddress,
      config,
    )

    const msg: InitBtcTransferMsg = {
      Withdraw: {
        target_btc_address: targetAddress,
        input: plan.inputs,
        output: plan.outputs,
      },
    }

    const bridgeFee = calculateBridgeFee(config.withdraw_bridge_fee, amount)
    const totalAmount = amount + plan.fee + bridgeFee

    const tx = await this.wallet.signAndSendTransaction({
      receiverId: token,
      actions: [
        actionCreators.functionCall(
          "ft_transfer_call",
          {
            receiver_id: connector,
            amount: totalAmount.toString(),
            msg: JSON.stringify(msg),
          },
          GAS.INIT_BTC_TRANSFER,
          BigInt(1),
        ),
      ],
      waitUntil: "FINAL",
    })

    const pendingLogKey = "generate_btc_pending_info"
    const pendingLog = tx.receipts_outcome
      .flatMap((receipt) => receipt.outcome.logs)
      .find((log) => log.includes(pendingLogKey))

    if (!pendingLog) {
      throw new Error(`${chainLabel}: Pending transaction not found in NEAR logs`)
    }

    const parts = pendingLog.split("EVENT_JSON:")
    const jsonPart = parts[1]
    if (!jsonPart) {
      throw new Error(`${chainLabel}: Invalid log format`)
    }
    const pendingData = JSON.parse(jsonPart)
    const pendingId = pendingData.data?.[0]?.btc_pending_id
    if (!pendingId) {
      throw new Error(`${chainLabel}: Pending transaction identifier missing in NEAR logs`)
    }

    return { pendingId, nearTxHash: tx.transaction.hash }
  }

  /**
   * Creates NEAR -> UTXO chain transfer (NEAR -> BTC/Zcash flow start, option #2)
   * To be called after initTransfer() that sends tokens to UTXO chain receiver address
   */
  async submitBitcoinTransfer(initTransferEvent: InitTransferEvent): Promise<string> {
    const recipientRaw = initTransferEvent.transfer_message.recipient
    const recipientParts = recipientRaw.split(":")
    if (recipientParts.length < 2 || !recipientParts[1]) {
      throw new Error(`Malformed recipient address: "${recipientRaw}"`)
    }

    // Validate recipient chain is a UTXO chain
    const recipientChain = getChain(recipientRaw)
    if (recipientChain !== ChainKind.Btc && recipientChain !== ChainKind.Zcash) {
      throw new Error(
        `Invalid recipient chain: expected BTC or Zcash, got ${ChainKind[recipientChain] ?? recipientChain}`,
      )
    }

    const recipientAddress = recipientParts[1]
    const amount =
      BigInt(initTransferEvent.transfer_message.amount) -
      BigInt(initTransferEvent.transfer_message.fee.fee)
    let maxGasFee = 0n
    const transferMsg = initTransferEvent.transfer_message.msg
    if (transferMsg) {
      try {
        const parsedMsg = JSON.parse(transferMsg)
        const parsedMaxFee = parsedMsg?.MaxGasFee
        if (parsedMaxFee !== undefined && parsedMaxFee !== null) {
          maxGasFee = BigInt(parsedMaxFee)
        }
      } catch (err) {
        throw new Error(
          `Failed to parse transfer message: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }

    const utxos = await this.getUtxoAvailableOutputs(recipientChain)
    const utxoConfig = await this.getUtxoBridgeConfig(recipientChain)

    const withdrawFee = calculateBridgeFee(utxoConfig.withdraw_bridge_fee, amount)

    // Verify that amount covers the withdrawal fee
    if (amount <= withdrawFee) {
      throw new Error(
        `Transfer amount (${amount}) must be greater than withdrawal fee (${withdrawFee})`,
      )
    }

    // Verify that max gas fee is reasonable if provided
    if (maxGasFee > 0n && maxGasFee + withdrawFee > amount) {
      throw new Error(
        `Max gas fee (${maxGasFee}) plus withdrawal fee (${withdrawFee}) cannot exceed transfer amount (${amount})`,
      )
    }

    const plan = this.buildUtxoWithdrawalPlan(
      recipientChain,
      utxos,
      amount - withdrawFee,
      recipientAddress,
      utxoConfig,
    )

    const msg: InitBtcTransferMsg = {
      Withdraw: {
        target_btc_address: recipientAddress,
        input: plan.inputs,
        output: plan.outputs,
        max_gas_fee: maxGasFee,
      },
    }

    const tx = await this.wallet.signAndSendTransaction({
      receiverId: this.lockerAddress,
      actions: [
        actionCreators.functionCall(
          "submit_transfer_to_utxo_chain_connector",
          {
            transfer_id: {
              origin_chain: ChainKind[getChain(initTransferEvent.transfer_message.sender)],
              origin_nonce: BigInt(initTransferEvent.transfer_message.origin_nonce),
            },
            msg: JSON.stringify(msg),
          },
          GAS.SUBMIT_BTC_TRANSFER,
          BigInt(0),
        ),
      ],
      waitUntil: "FINAL",
    })

    return tx.transaction.hash
  }

  async signUtxoTransaction(
    chain: UtxoChain,
    pendingId: string,
    signIndex: number,
  ): Promise<string> {
    const methodName = "sign_btc_transaction"
    const args = {
      btc_pending_id: pendingId,
      sign_index: signIndex,
    }

    const { connector } = this.getUtxoConnector(chain)

    const tx = await this.wallet.signAndSendTransaction({
      receiverId: connector,
      actions: [
        actionCreators.functionCall(methodName, args, GAS.SIGN_BTC_TX, DEPOSIT.SIGN_BTC_TX),
      ],
    })

    return tx.transaction.hash
  }

  async finalizeUtxoWithdrawal(chain: UtxoChain, nearTxHash: string): Promise<string> {
    const nearTx = await this.wallet.provider.viewTransactionStatus(
      nearTxHash,
      this.wallet.accountId,
      "FINAL",
    )

    const chainLabel = this.getUtxoChainLabel(chain)
    const signedLogKey = "signed_btc_transaction"
    const signedLog = nearTx.receipts_outcome
      .flatMap((receipt) => receipt.outcome.logs)
      .find((log) => log.includes(signedLogKey))

    if (!signedLog) {
      throw new Error(`${chainLabel}: Signed transaction not found in NEAR logs`)
    }

    const parts = signedLog.split("EVENT_JSON:")
    const jsonPart = parts[1]
    if (!jsonPart) {
      throw new Error(`${chainLabel}: Invalid log format`)
    }
    const signedData = JSON.parse(jsonPart)
    const txBytes = signedData.data?.[0]?.tx_bytes
    if (!Array.isArray(txBytes)) {
      throw new Error("Signed transaction bytes missing in logs")
    }

    const txHex = txBytes.map((byte: number) => byte.toString(16).padStart(2, "0")).join("")

    return await this.getUtxoService(chain).broadcastTransaction(txHex)
  }

  async waitForUtxoTransactionSigning(
    chain: UtxoChain,
    nearTxHash: string,
    maxAttempts: number = BITCOIN_SIGNING_WAIT.DEFAULT_MAX_ATTEMPTS,
    delayMs: number = BITCOIN_SIGNING_WAIT.DEFAULT_DELAY_MS,
  ): Promise<string> {
    const chainLabel = this.getUtxoChainLabel(chain)

    const api = new OmniBridgeAPI()
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const transfer = await api.getTransfer({ transactionHash: nearTxHash })
        const firstTransfer = transfer[0]
        if (!firstTransfer) {
          throw new Error(`${chainLabel}: No transfer found`)
        }
        const signedTxHash = firstTransfer.signed?.NearReceipt?.transaction_hash
        if (signedTxHash) {
          return signedTxHash
        }
      } catch (error) {
        if (attempt === maxAttempts) {
          const seconds = (maxAttempts * delayMs) / 1000
          throw new Error(
            `${chainLabel}: Transaction signing not found after ${maxAttempts} attempts (${seconds}s). ${String(
              error,
            )}`,
          )
        }
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }

    throw new Error(`${chainLabel}: Unexpected end of waitForSigning loop`)
  }

  async executeUtxoWithdrawal(
    chain: UtxoChain,
    targetAddress: string,
    amount: bigint,
    maxWaitAttempts: number = BITCOIN_SIGNING_WAIT.DEFAULT_MAX_ATTEMPTS,
    waitDelayMs: number = BITCOIN_SIGNING_WAIT.DEFAULT_DELAY_MS,
  ): Promise<string> {
    const withdrawal = await this.initUtxoWithdrawal(chain, targetAddress, amount)
    const nearTxHash = await this.waitForUtxoTransactionSigning(
      chain,
      withdrawal.nearTxHash,
      maxWaitAttempts,
      waitDelayMs,
    )
    return await this.finalizeUtxoWithdrawal(chain, nearTxHash)
  }

  async verifyUtxoWithdrawal(chain: UtxoChain, txHash: string): Promise<string> {
    const { connector } = this.getUtxoConnector(chain)
    const service = this.getUtxoService(chain)
    const proof: BitcoinMerkleProofResponse = await service.getMerkleProof(txHash)

    const tx = await this.wallet.signAndSendTransaction({
      receiverId: connector,
      actions: [
        actionCreators.functionCall(
          "btc_verify_withdraw",
          { tx_proof: proof },
          GAS.VERIFY_WITHDRAW,
          DEPOSIT.VERIFY_WITHDRAW,
        ),
      ],
    })

    return tx.transaction.hash
  }

  async getUtxoAvailableOutputs(chain: UtxoChain): Promise<UTXO[]> {
    const { connector } = this.getUtxoConnector(chain)
    const result = await this.wallet.provider.callFunction(connector, "get_utxos_paged", {})
    const utxos = result as Record<string, UTXO>
    return Object.entries(utxos).map(([key, utxo]) => {
      const parts = key.split("@")
      const txid = parts[0]
      if (!txid) {
        throw new Error(`Invalid UTXO key format: ${key}`)
      }
      return {
        ...utxo,
        txid,
      }
    })
  }

  async getUtxoBridgeConfig(chain: UtxoChain): Promise<BtcConnectorConfig> {
    const { connector } = this.getUtxoConnector(chain)
    return (await this.wallet.provider.callFunction(
      connector,
      "get_config",
      {},
    )) as BtcConnectorConfig
  }

  private buildUtxoWithdrawalPlan(
    chain: UtxoChain,
    utxos: UTXO[],
    amount: bigint,
    targetAddress: string,
    config: BtcConnectorConfig,
  ): UtxoWithdrawalPlan {
    const changeAddress = config.change_address
    if (!changeAddress) {
      const label = this.getUtxoChainLabel(chain)
      throw new Error(`${label}: Bridge configuration is missing change address`)
    }

    const overrides: UtxoPlanOverrides = {}
    const minChange = this.parseConfigBigInt(config.min_change_amount)
    if (minChange !== undefined) {
      overrides.dustThreshold = minChange
      overrides.minChange = minChange
    }

    if (typeof config.max_withdrawal_input_number === "number") {
      overrides.maxInputs = config.max_withdrawal_input_number
    }

    const service = this.getUtxoService(chain)

    if (chain === ChainKind.Btc) {
      return service.buildWithdrawalPlan(utxos, amount, targetAddress, changeAddress, 2, overrides)
    }

    return service.buildWithdrawalPlan(
      utxos,
      amount,
      targetAddress,
      changeAddress,
      undefined,
      overrides,
    )
  }

  private parseConfigBigInt(value?: string): bigint | undefined {
    if (!value) {
      return undefined
    }

    try {
      return BigInt(value)
    } catch (error) {
      console.warn(`Failed to parse config value to BigInt: ${value}`, error)
      return undefined
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
            GAS.STORAGE_DEPOSIT,
            requiredAmount,
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
    const storageDepositAmount = BigInt(args.storage_deposit_amount ?? 0)
    const totalRequiredBalance = requiredBalance + storageDepositAmount

    // Check current storage balance and deposit if needed
    const storage = (await this.wallet.provider.callFunction(
      this.lockerAddress,
      "storage_balance_of",
      {
        account_id: this.wallet.accountId,
      },
    )) as { total: string; available: string }

    const existingBalance = storage?.available ? BigInt(storage.available) : BigInt(0)
    const neededAmount = totalRequiredBalance - existingBalance

    if (neededAmount > 0) {
      await this.wallet.signAndSendTransaction({
        receiverId: this.lockerAddress,
        actions: [
          actionCreators.functionCall("storage_deposit", {}, GAS.STORAGE_DEPOSIT, neededAmount),
        ],
      })
    }

    const transferArgs = {
      receiver_id: this.lockerAddress,
      amount: args.amount_to_send,
      msg: JSON.stringify(args),
    }

    // Execute the fast finalize transfer
    const tx = await this.wallet.signAndSendTransaction({
      receiverId: args.token_id,
      actions: [
        actionCreators.functionCall(
          "ft_transfer_call",
          transferArgs,
          GAS.FAST_FIN_TRANSFER,
          DEPOSIT.INIT_TRANSFER,
        ),
      ],
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
    const transferEvent = await evmClient.getInitTransferEvent(evmTxHash)

    // Step 2: Get the NEAR token ID for the EVM token using getBridgedToken
    const omniTokenAddress = omniAddress(originChain, transferEvent.tokenAddress)
    const nearTokenAddress = await getBridgedToken(omniTokenAddress, ChainKind.Near)

    if (!nearTokenAddress) {
      throw new Error(`No bridged token found on NEAR for ${omniTokenAddress}`)
    }

    const parts = nearTokenAddress.split(":")
    const nearTokenId = parts[1]
    if (!nearTokenId) {
      throw new Error("Invalid NEAR token address format")
    }

    // Step 3: Get token decimals and calculate amount to send
    const tokenDecimals = await getTokenDecimals(this.lockerAddress, omniTokenAddress)
    if (!tokenDecimals) {
      throw new Error(`Token ${omniTokenAddress} is not registered on NEAR`)
    }

    // Validate amount is greater than fee
    const amount = BigInt(transferEvent.amount)
    const fee = BigInt(transferEvent.fee)
    if (amount < fee) {
      throw new Error(
        `Transfer amount is less than fee: ${transferEvent.amount} < ${transferEvent.fee}`,
      )
    }

    // Calculate amount to send: normalize amount and fee separately to avoid precision loss
    // Event amounts are in origin chain decimals (tokenDecimals.decimals)
    // Need to convert to NEAR decimals (tokenDecimals.origin_decimals)
    // IMPORTANT: Must normalize separately then subtract to match contract validation
    const normalizedAmount = normalizeAmount(
      amount,
      tokenDecimals.decimals,
      tokenDecimals.origin_decimals,
    )
    const normalizedFee = normalizeAmount(
      fee,
      tokenDecimals.decimals,
      tokenDecimals.origin_decimals,
    )
    const amountToSend = normalizedAmount - normalizedFee

    // Step 4: Construct the transfer ID
    const transferId: TransferId = {
      origin_chain: originChain, // Use numeric enum value
      origin_nonce: transferEvent.originNonce,
    }

    // Step 5: Execute the fast finalize transfer
    const fastTransferArgs: FastFinTransferArgs = {
      token_id: nearTokenId,
      amount: transferEvent.amount.toString(),
      amount_to_send: amountToSend.toString(),
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
