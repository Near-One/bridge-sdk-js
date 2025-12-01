import type { Near } from "near-kit"
import { Amount } from "near-kit"
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
 * Using human-readable gas units for near-kit
 * @internal
 */
const GAS = {
  LOG_METADATA: "300 Tgas",
  DEPLOY_TOKEN: "120 Tgas",
  BIND_TOKEN: "300 Tgas",
  INIT_TRANSFER: "300 Tgas",
  FIN_TRANSFER: "300 Tgas",
  SIGN_TRANSFER: "300 Tgas",
  STORAGE_DEPOSIT: "10 Tgas",
  // Bitcoin-specific gas constants
  GET_DEPOSIT_ADDRESS: "3 Tgas",
  VERIFY_DEPOSIT: "300 Tgas",
  INIT_BTC_TRANSFER: "100 Tgas",
  SIGN_BTC_TX: "300 Tgas",
  VERIFY_WITHDRAW: "5 Tgas",
  FAST_FIN_TRANSFER: "300 Tgas",
  SUBMIT_BTC_TRANSFER: "300 Tgas",
} as const

/**
 * Configuration for NEAR network deposit amounts.
 * Using human-readable NEAR units for near-kit
 * @internal
 */
const DEPOSIT = {
  LOG_METADATA: "1 yocto",
  SIGN_TRANSFER: "1 yocto",
  INIT_TRANSFER: "1 yocto",
  SIGN_BTC_TX: "1 yocto",
  VERIFY_WITHDRAW: "1 yocto",
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
 * NEAR blockchain implementation of the bridge client using near-kit.
 * Unified client that works with both server-side (privateKey) and browser (wallet) scenarios.
 */
export class NearBridgeClient {
  public bitcoinService: BitcoinService
  public zcashService?: ZcashService
  private readonly utxoServices: Partial<Record<UtxoChain, UtxoChainService>> = {}
  private readonly near: Near
  private readonly bridgeAddress: string
  private readonly defaultSignerId: string | undefined

  /**
   * Creates a new NEAR bridge client instance
   * @param near - Near instance from near-kit (configured with network and credentials)
   * @param bridgeAddress - Address of the token locker contract
   * @param options - Optional configuration (e.g., zcashApiKey, defaultSignerId)
   */
  constructor(
    near: Near,
    bridgeAddress: string = addresses.near.contract,
    private readonly options: {
      zcashApiKey?: string
      defaultSignerId?: string
    } = {},
  ) {
    this.near = near
    this.bridgeAddress = bridgeAddress
    this.defaultSignerId = options.defaultSignerId

    // Initialize Bitcoin service
    this.bitcoinService = new BitcoinService(addresses.btc.apiUrl, addresses.btc.network, {
      url: addresses.btc.rpcUrl,
    })
    this.utxoServices[ChainKind.Btc] = this.bitcoinService

    // Initialize Zcash service if API key configured
    // biome-ignore lint/complexity/useLiteralKeys: process.env has index signature
    const zcashApiKey = this.options.zcashApiKey || process.env["ZCASH_API_KEY"]
    if (zcashApiKey) {
      this.zcashService = new ZcashService(addresses.zcash.rpcUrl, zcashApiKey)
      this.utxoServices[ChainKind.Zcash] = this.zcashService
    }
  }

  /**
   * Get the bridge contract ID (locker address)
   */
  get bridgeContractId(): string {
    return this.bridgeAddress
  }

  /**
   * Get the signer ID to use for transactions
   * @param signerId - Optional explicit signer ID
   * @returns The signer ID to use
   * @throws If no signer ID is provided and no defaultSignerId is configured
   */
  private getSignerId(signerId?: string): string {
    const signer = signerId || this.defaultSignerId
    if (!signer) {
      throw new Error(
        "No signerId provided and no defaultSignerId configured. " +
          "Either pass signerId explicitly or configure defaultSignerId when creating the NearBridgeClient.",
      )
    }
    return signer
  }

  /**
   * Logs metadata for a token on the NEAR blockchain
   * @param tokenAddress - Omni address of the token
   * @param signerId - Optional signer ID (uses defaultSignerId if not provided)
   * @throws {Error} If token address is not on NEAR chain
   * @returns Promise resolving to the LogMetadataEvent
   */
  async logMetadata(tokenAddress: OmniAddress, signerId?: string): Promise<LogMetadataEvent> {
    const signer = this.getSignerId(signerId)
    if (getChain(tokenAddress) !== ChainKind.Near) {
      throw new Error("Token address must be on NEAR")
    }

    const parts = tokenAddress.split(":")
    const tokenAccountId = parts[1]
    if (!tokenAccountId) {
      throw new Error("Invalid token address format")
    }

    const args: LogMetadataArgs = { token_id: tokenAccountId }

    const outcome = await this.near
      .transaction(signer)
      .functionCall(this.bridgeAddress, "log_metadata", args, {
        gas: GAS.LOG_METADATA,
        attachedDeposit: DEPOSIT.LOG_METADATA,
      })
      .send({ waitUntil: "FINAL" })

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
   * @param evmProof - EVM proof for verification
   * @param signerId - Optional signer ID (uses defaultSignerId if not provided)
   * @returns Promise resolving to the transaction hash
   */
  async deployToken(
    destinationChain: ChainKind,
    vaa?: string,
    evmProof?: EvmVerifyProofArgs,
    signerId?: string,
  ): Promise<string> {
    const signer = this.getSignerId(signerId)
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

    const args: DeployTokenArgs = {
      chain_kind: destinationChain,
      prover_args: proverArgsSerialized,
    }
    const serializedArgs = DeployTokenArgsSchema.serialize(args)

    // Retrieve required deposit dynamically
    const deployDepositStr = await this.near.view<string>(
      this.bridgeAddress,
      "required_balance_for_deploy_token",
      {},
    )

    const tx = await this.near
      .transaction(signer)
      .functionCall(this.bridgeAddress, "deploy_token", serializedArgs, {
        gas: GAS.DEPLOY_TOKEN,
        attachedDeposit: Amount.yocto(BigInt(deployDepositStr)),
      })
      .send()

    return tx.transaction.hash
  }

  /**
   * Binds a token on the NEAR chain using either a VAA (Wormhole) or EVM proof
   * @param sourceChain - Source chain where the original token comes from
   * @param vaa - Verified Action Approval for Wormhole verification
   * @param evmProof - EVM proof for Ethereum or EVM chain verification
   * @param signerId - Optional signer ID (uses defaultSignerId if not provided)
   * @throws {Error} If VAA or EVM proof is not provided
   * @throws {Error} If EVM proof is provided for non-EVM chain
   * @returns Promise resolving to the transaction hash
   */
  async bindToken(
    sourceChain: ChainKind,
    vaa?: string,
    evmProof?: EvmVerifyProofArgs,
    signerId?: string,
  ): Promise<string> {
    const signer = this.getSignerId(signerId)
    if (!vaa && !evmProof) {
      throw new Error("Must provide either VAA or EVM proof")
    }

    if (evmProof && sourceChain !== ChainKind.Eth) {
      throw new Error("EVM proof is only valid for Ethereum")
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

    const args: BindTokenArgs = {
      chain_kind: sourceChain,
      prover_args: proverArgsSerialized,
    }
    const serializedArgs = BindTokenArgsSchema.serialize(args)

    // Retrieve required deposit dynamically
    const bindDepositStr = await this.near.view<string>(
      this.bridgeAddress,
      "required_balance_for_bind_token",
      {},
    )

    const tx = await this.near
      .transaction(signer)
      .functionCall(this.bridgeAddress, "bind_token", serializedArgs, {
        gas: GAS.BIND_TOKEN,
        attachedDeposit: Amount.yocto(BigInt(bindDepositStr)),
      })
      .send()

    return tx.transaction.hash
  }

  /**
   * Transfers NEP-141 tokens to the token locker contract on NEAR.
   * @param transfer - Transfer message containing token, recipient, amount, etc.
   * @param signerId - Optional signer ID (uses defaultSignerId if not provided)
   * @returns Promise resolving to InitTransferEvent
   */
  async initTransfer(transfer: OmniTransferMessage, signerId?: string): Promise<InitTransferEvent> {
    const signer = this.getSignerId(signerId)
    if (getChain(transfer.tokenAddress) !== ChainKind.Near) {
      throw new Error("Token address must be on NEAR")
    }

    const parts = transfer.tokenAddress.split(":")
    const tokenAddress = parts[1]
    if (!tokenAddress) {
      throw new Error("Invalid token address format")
    }

    // Handle storage deposits
    await this.storageDepositForToken(tokenAddress, signer)
    const { regBalance, initBalance, storage } = await this.getBalances(signer)
    const requiredBalance = regBalance + initBalance
    const existingBalance = storage?.available ?? BigInt(0)
    const neededAmount = requiredBalance - existingBalance + transfer.nativeFee

    if (neededAmount > 0) {
      await this.near
        .transaction(signer)
        .functionCall(
          this.bridgeAddress,
          "storage_deposit",
          {},
          {
            gas: GAS.STORAGE_DEPOSIT,
            attachedDeposit: `${neededAmount} yocto`,
          },
        )
        .send()
    }

    // Build message
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
      msg: message,
    }

    const args: InitTransferMessageArgs = {
      receiver_id: this.bridgeAddress,
      amount: transfer.amount.toString(),
      memo: null,
      msg: JSON.stringify(initTransferMessage),
    }

    const tx = await this.near
      .transaction(signer)
      .functionCall(tokenAddress, "ft_transfer_call", args, {
        gas: GAS.INIT_TRANSFER,
        attachedDeposit: DEPOSIT.INIT_TRANSFER,
      })
      .send()

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
   * Parse a SignTransferEvent from JSON string
   */
  parseSignTransferEvent(json: string): SignTransferEvent {
    const parsed = JSON.parse(json)
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
   * @param feeRecipient - Address of the fee recipient
   * @param signerId - Optional signer ID (uses defaultSignerId if not provided)
   * @returns Promise resolving to SignTransferEvent
   */
  async signTransfer(
    initTransferEvent: InitTransferEvent,
    feeRecipient: AccountId,
    signerId?: string,
  ): Promise<SignTransferEvent> {
    const signer = this.getSignerId(signerId)
    const args: SignTransferArgs = {
      transfer_id: {
        origin_chain: ChainKind[getChain(initTransferEvent.transfer_message.sender)],
        origin_nonce: initTransferEvent.transfer_message.origin_nonce.toString(),
      },
      fee_recipient: feeRecipient,
      fee: {
        fee: initTransferEvent.transfer_message.fee.fee,
        native_fee: initTransferEvent.transfer_message.fee.native_fee,
      },
    }

    const outcome = await this.near
      .transaction(signer)
      .functionCall(this.bridgeAddress, "sign_transfer", args, {
        gas: GAS.SIGN_TRANSFER,
        attachedDeposit: DEPOSIT.SIGN_TRANSFER,
      })
      .send({ waitUntil: "FINAL" })

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
   * Finalizes a cross-chain token transfer on NEAR
   * @param token - Token identifier on NEAR
   * @param account - Recipient account ID
   * @param storageDepositAmount - Storage deposit amount
   * @param sourceChain - Originating chain
   * @param signerId - Account ID of the signer
   * @param vaa - Optional Wormhole VAA
   * @param evmProof - Optional EVM proof
   * @param proofKind - Type of proof
   * @returns Promise resolving to transaction outcome
   */
  async finalizeTransfer(
    token: AccountId,
    account: AccountId,
    storageDepositAmount: U128,
    sourceChain: ChainKind,
    signerId?: string,
    vaa?: string,
    evmProof?: EvmVerifyProofArgs,
    proofKind: ProofKind = ProofKind.InitTransfer,
  ) {
    const signer = this.getSignerId(signerId)
    if (!vaa && !evmProof) {
      throw new Error("Must provide either VAA or EVM proof")
    }
    if (evmProof && sourceChain !== ChainKind.Eth) {
      throw new Error("EVM proof is only valid for Ethereum")
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

    // Retrieve required deposit dynamically
    const finDepositStr = await this.near.view<string>(
      this.bridgeAddress,
      "required_balance_for_fin_transfer",
      {},
    )
    const finDeposit = BigInt(finDepositStr) + storageDepositAmount

    const tx = await this.near
      .transaction(signer)
      .functionCall(this.bridgeAddress, "fin_transfer", serializedArgs, {
        gas: GAS.FIN_TRANSFER,
        attachedDeposit: `${finDeposit} yocto`,
      })
      .send({ waitUntil: "FINAL" })

    return tx
  }

  /**
   * Retrieves various balance information for an account
   * @private
   */
  private async getBalances(accountId: string): Promise<BalanceResults> {
    try {
      const [regBalanceStr, initBalanceStr, finBalanceStr, bindBalanceStr, storage] =
        await Promise.all([
          this.near.view<string>(this.bridgeAddress, "required_balance_for_account", {}),
          this.near.view<string>(this.bridgeAddress, "required_balance_for_init_transfer", {}),
          this.near.view<string>(this.bridgeAddress, "required_balance_for_fin_transfer", {}),
          this.near.view<string>(this.bridgeAddress, "required_balance_for_bind_token", {}),
          this.near.view<{ total: string; available: string } | null>(
            this.bridgeAddress,
            "storage_balance_of",
            { account_id: accountId },
          ),
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
    signerId?: string,
    amount?: bigint,
    fee?: bigint,
  ): Promise<{ depositAddress: string; depositArgs: BtcDepositArgs }> {
    const signer = this.getSignerId(signerId)
    const { connector } = this.getUtxoConnector(chain)

    let depositMsg: BtcDepositArgs["deposit_msg"]
    if (recipientId.includes(":")) {
      if (!amount) {
        throw new Error("Amount is required for Omni address deposits")
      }
      depositMsg = {
        recipient_id: signer,
        post_actions: [
          {
            receiver_id: this.bridgeAddress,
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

    const depositAddress = await this.near.view<string>(connector, "get_user_deposit_address", {
      deposit_msg: depositMsg,
    })

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
    signerId?: string,
  ): Promise<string> {
    const signer = this.getSignerId(signerId)
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

    const tx = await this.near
      .transaction(signer)
      .functionCall(connector, "verify_deposit", args, {
        gas: GAS.VERIFY_DEPOSIT,
      })
      .send({ waitUntil: "FINAL" })

    return tx.transaction.hash
  }

  async initUtxoWithdrawal(
    chain: UtxoChain,
    targetAddress: string,
    amount: bigint,
    signerId?: string,
  ): Promise<{ pendingId: string; nearTxHash: string }> {
    const signer = this.getSignerId(signerId)
    const chainLabel = this.getUtxoChainLabel(chain)
    const { connector, token } = this.getUtxoConnector(chain)
    const config = await this.getUtxoBridgeConfig(chain)

    const utxos = await this.getUtxoAvailableOutputs(chain)
    if (!utxos.length) {
      throw new Error(`${chainLabel}: No UTXOs available for transaction`)
    }

    // Calculate bridge fee from the total amount
    const bridgeFee = calculateBridgeFee(config.withdraw_bridge_fee, amount)

    // Amount available for withdrawal after bridge fee
    const withdrawAmount = amount - bridgeFee

    const plan: UtxoWithdrawalPlan = this.buildUtxoWithdrawalPlan(
      chain,
      utxos,
      withdrawAmount,
      targetAddress,
      config,
    )

    // Net amount the recipient will receive after all fees
    const netAmount = withdrawAmount - plan.fee

    // Validate the net amount meets minimum requirements
    if (netAmount < BigInt(config.min_withdraw_amount)) {
      throw new Error(
        `Net withdrawal amount ${netAmount} (after fees) is below minimum withdrawal amount ${config.min_withdraw_amount}`,
      )
    }

    const msg: InitBtcTransferMsg = {
      Withdraw: {
        target_btc_address: targetAddress,
        input: plan.inputs,
        output: plan.outputs,
      },
    }

    // Use the specified amount as total (fees are already subtracted in the plan)
    const totalAmount = amount

    const tx = await this.near
      .transaction(signer)
      .functionCall(
        token,
        "ft_transfer_call",
        {
          receiver_id: connector,
          amount: totalAmount.toString(),
          msg: JSON.stringify(msg),
        },
        {
          gas: GAS.INIT_BTC_TRANSFER,
          attachedDeposit: "1 yocto",
        },
      )
      .send({ waitUntil: "FINAL" })

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
   * Creates NEAR -> UTXO chain transfer
   */
  async submitBitcoinTransfer(
    initTransferEvent: InitTransferEvent,
    signerId?: string,
  ): Promise<string> {
    const signer = this.getSignerId(signerId)
    const recipientRaw = initTransferEvent.transfer_message.recipient
    const recipientParts = recipientRaw.split(":")
    if (recipientParts.length < 2 || !recipientParts[1]) {
      throw new Error(`Malformed recipient address: "${recipientRaw}"`)
    }

    const recipientChain = getChain(recipientRaw)
    if (recipientChain !== ChainKind.Btc && recipientChain !== ChainKind.Zcash) {
      throw new Error(
        `Invalid recipient chain: expected BTC or Zcash, got ${
          ChainKind[recipientChain] ?? recipientChain
        }`,
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

    if (amount <= withdrawFee) {
      throw new Error(
        `Transfer amount (${amount}) must be greater than withdrawal fee (${withdrawFee})`,
      )
    }

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
        ...(maxGasFee > 0n && { max_gas_fee: maxGasFee.toString() }),
      },
    }

    const tx = await this.near
      .transaction(signer)
      .functionCall(
        this.bridgeAddress,
        "submit_transfer_to_utxo_chain_connector",
        {
          transfer_id: {
            origin_chain: ChainKind[getChain(initTransferEvent.transfer_message.sender)],
            origin_nonce: initTransferEvent.transfer_message.origin_nonce.toString(),
          },
          msg: JSON.stringify(msg),
        },
        {
          gas: GAS.SUBMIT_BTC_TRANSFER,
          attachedDeposit: "0 yocto",
        },
      )
      .send({ waitUntil: "FINAL" })

    return tx.transaction.hash
  }

  async signUtxoTransaction(
    chain: UtxoChain,
    pendingId: string,
    signIndex: number,
    signerId?: string,
  ): Promise<string> {
    const signer = this.getSignerId(signerId)
    const { connector } = this.getUtxoConnector(chain)

    const tx = await this.near
      .transaction(signer)
      .functionCall(
        connector,
        "sign_btc_transaction",
        {
          btc_pending_id: pendingId,
          sign_index: signIndex,
        },
        {
          gas: GAS.SIGN_BTC_TX,
          attachedDeposit: DEPOSIT.SIGN_BTC_TX,
        },
      )
      .send()

    return tx.transaction.hash
  }

  async finalizeUtxoWithdrawal(
    chain: UtxoChain,
    nearTxHash: string,
    senderId: string,
  ): Promise<string> {
    const nearTx = await this.near.getTransactionStatus(nearTxHash, senderId, "FINAL")

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
    signerId?: string,
    maxWaitAttempts: number = BITCOIN_SIGNING_WAIT.DEFAULT_MAX_ATTEMPTS,
    waitDelayMs: number = BITCOIN_SIGNING_WAIT.DEFAULT_DELAY_MS,
  ): Promise<string> {
    const signer = this.getSignerId(signerId)
    const withdrawal = await this.initUtxoWithdrawal(chain, targetAddress, amount, signer)
    const nearTxHash = await this.waitForUtxoTransactionSigning(
      chain,
      withdrawal.nearTxHash,
      maxWaitAttempts,
      waitDelayMs,
    )
    return await this.finalizeUtxoWithdrawal(chain, nearTxHash, signer)
  }

  async verifyUtxoWithdrawal(chain: UtxoChain, txHash: string, signerId?: string): Promise<string> {
    const signer = this.getSignerId(signerId)
    const { connector } = this.getUtxoConnector(chain)
    const service = this.getUtxoService(chain)
    const proof: BitcoinMerkleProofResponse = await service.getMerkleProof(txHash)

    const tx = await this.near
      .transaction(signer)
      .functionCall(
        connector,
        "btc_verify_withdraw",
        { tx_proof: proof },
        {
          gas: GAS.VERIFY_WITHDRAW,
          attachedDeposit: DEPOSIT.VERIFY_WITHDRAW,
        },
      )
      .send()

    return tx.transaction.hash
  }

  async getUtxoAvailableOutputs(chain: UtxoChain): Promise<UTXO[]> {
    const { connector } = this.getUtxoConnector(chain)
    const result = await this.near.view<Record<string, UTXO>>(connector, "get_utxos_paged", {})
    const utxos = result
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
    return await this.near.view<BtcConnectorConfig>(connector, "get_config", {})
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

  /// Performs a storage deposit on behalf of the token_locker
  private async storageDepositForToken(tokenAddress: string, signerId: string): Promise<string> {
    const signer = this.getSignerId(signerId)
    const storage = await this.near.view<string | null>(tokenAddress, "storage_balance_of", {
      account_id: this.bridgeAddress,
    })

    if (storage === null) {
      const bounds = await this.near.view<{ min: string; max: string }>(
        tokenAddress,
        "storage_balance_bounds",
        {
          account_id: this.bridgeAddress,
        },
      )
      const requiredAmount = BigInt(bounds.min)

      const tx = await this.near
        .transaction(signer)
        .functionCall(
          tokenAddress,
          "storage_deposit",
          {
            account_id: this.bridgeAddress,
          },
          {
            gas: GAS.STORAGE_DEPOSIT,
            attachedDeposit: `${requiredAmount} yocto`,
          },
        )
        .send()

      return tx.transaction.hash
    }
    return storage
  }

  /**
   * Gets the required balance for fast transfer operations
   * @private
   */
  async getRequiredBalanceForFastTransfer(): Promise<bigint> {
    const balanceStr = await this.near.view<string>(
      this.bridgeAddress,
      "required_balance_for_fast_transfer",
      {},
    )
    return BigInt(balanceStr)
  }

  /**
   * Performs a fast finalize transfer on NEAR chain
   * @param args - Fast finalize transfer arguments
   * @param signerId - Optional signer ID (uses defaultSignerId if not provided)
   * @returns Promise resolving to the NEAR transaction hash
   */
  async fastFinTransfer(args: FastFinTransferArgs, signerId?: string): Promise<string> {
    const signer = this.getSignerId(signerId)
    const requiredBalance = await this.getRequiredBalanceForFastTransfer()
    const storageDepositAmount = BigInt(args.storage_deposit_amount ?? 0)
    const totalRequiredBalance = requiredBalance + storageDepositAmount

    const storage = await this.near.view<{
      total: string
      available: string
    } | null>(this.bridgeAddress, "storage_balance_of", {
      account_id: signer,
    })

    const existingBalance = storage?.available ? BigInt(storage.available) : BigInt(0)
    const neededAmount = totalRequiredBalance - existingBalance

    // Build transaction with storage deposit if needed
    let tx = this.near.transaction(signer)

    if (neededAmount > 0) {
      tx = tx.functionCall(
        this.bridgeAddress,
        "storage_deposit",
        {},
        {
          gas: GAS.STORAGE_DEPOSIT,
          attachedDeposit: `${neededAmount} yocto`,
        },
      )
    }

    const transferArgs = {
      receiver_id: this.bridgeAddress,
      amount: args.amount_to_send,
      msg: JSON.stringify({
        ...args,
        transfer_id: {
          ...args.transfer_id,
          origin_nonce:
            typeof args.transfer_id.origin_nonce === "bigint"
              ? args.transfer_id.origin_nonce.toString()
              : args.transfer_id.origin_nonce,
        },
      }),
    }

    // Chain the ft_transfer_call
    const result = await tx
      .functionCall(args.token_id, "ft_transfer_call", transferArgs, {
        gas: GAS.FAST_FIN_TRANSFER,
        attachedDeposit: DEPOSIT.INIT_TRANSFER,
      })
      .send()

    return result.transaction.hash
  }

  /**
   * Performs a complete fast transfer from EVM to NEAR
   * @param originChain - The EVM chain where the original transfer was initiated
   * @param evmTxHash - Transaction hash of the InitTransfer on the EVM chain
   * @param evmClient - EVM bridge client for parsing the transaction
   * @param signerId - Account ID of the signer
   * @param storageDepositAmount - Optional storage deposit amount in yoctoNEAR
   * @returns Promise resolving to the NEAR transaction hash
   */
  async nearFastTransfer(
    originChain: ChainKind,
    evmTxHash: string,
    evmClient: EvmBridgeClient,
    signerId?: string,
    storageDepositAmount?: string,
  ): Promise<string> {
    const signer = this.getSignerId(signerId)
    if (!isEvmChain(originChain)) {
      throw new Error(`Fast transfer is not supported for chain kind: ${ChainKind[originChain]}`)
    }

    const transferEvent = await evmClient.getInitTransferEvent(evmTxHash)
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

    // Get token decimals and calculate amount to send
    const tokenDecimals = await getTokenDecimals(this.bridgeAddress, omniTokenAddress)
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

    // Construct the transfer ID
    const transferId: TransferId = {
      origin_chain: originChain,
      origin_nonce: transferEvent.originNonce,
    }

    // Execute the fast finalize transfer
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
      relayer: signer,
    }

    return await this.fastFinTransfer(fastTransferArgs, signer)
  }
}
