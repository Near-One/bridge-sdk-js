import type { Account } from "@near-js/accounts"
import { actionCreators } from "@near-js/transactions"
import type { FinalExecutionOutcome } from "@near-js/types"
import type { Output } from "@scure/btc-signer/utxo"
import { OmniBridgeAPI } from "../api.js"
import { addresses } from "../config.js"
import { BitcoinService } from "../services/bitcoin.js"
import {
  type AccountId,
  type BindTokenArgs,
  BindTokenArgsSchema,
  type BtcConnectorConfig,
  type BtcDepositArgs,
  ChainKind,
  type DeployTokenArgs,
  DeployTokenArgsSchema,
  type DepositMsg,
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
  // Bitcoin-specific gas constants
  GET_DEPOSIT_ADDRESS: BigInt(3e14), // 3 TGas
  VERIFY_DEPOSIT: BigInt(300e14), // 300 TGas
  INIT_BTC_TRANSFER: BigInt(100e12), // 100 TGas
  SIGN_BTC_TX: BigInt(3e14), // 3 TGas
  VERIFY_WITHDRAW: BigInt(5e14), // 5 TGas
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
  public bitcoinService: BitcoinService

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
    }

    // Initialize Bitcoin service
    this.bitcoinService = new BitcoinService(addresses.btc.apiUrl, addresses.btc.network)
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
        actionCreators.functionCall(
          "fin_transfer",
          serializedArgs,
          BigInt(GAS.FIN_TRANSFER),
          BigInt(finDeposit),
        ),
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
  // BITCOIN BRIDGE METHODS (mirrors Rust SDK NearBridgeClient + BtcConnector)
  // =====================================================================

  /**
   * Get Bitcoin deposit address from Satoshi Bridge (BTC -> NEAR flow start)
   * Mirrors get_btc_address() from Rust SDK
   */
  async getBitcoinDepositAddress(
    recipientId: string,
    amount?: bigint,
    fee?: bigint,
  ): Promise<{ depositAddress: string; btcDepositArgs: BtcDepositArgs }> {
    // Validate minimum amount if provided
    if (amount) {
      const bitcoinConfig = await this.getBitcoinBridgeConfig()
      if (amount < BigInt(bitcoinConfig.min_deposit_amount)) {
        throw new Error(
          `Amount ${amount} is below minimum deposit amount ${bitcoinConfig.min_deposit_amount}`,
        )
      }
    }

    // Deposit msg depends on if the receiver is an Omni Address or not
    let depositMsg: DepositMsg
    if (recipientId.includes(":")) {
      if (!amount) {
        throw new Error("Amount is required for Omni Address deposit")
      }
      depositMsg = {
        recipient_id: this.wallet.accountId,
        post_actions: [
          {
            receiver_id: this.lockerAddress,
            amount: amount,
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

    const result = await this.wallet.provider.callFunction(
      addresses.btc.btcConnector,
      "get_user_deposit_address",
      { deposit_msg: depositMsg },
    )
    return {
      depositAddress: result as string,
      btcDepositArgs: { deposit_msg: depositMsg },
    }
  }

  /**
   * Finalize Bitcoin deposit (BTC -> NEAR flow completion)
   * Mirrors near_fin_transfer_btc() from Rust SDK
   */
  async finalizeBitcoinDeposit(
    btcTxHash: string,
    vout: number,
    depositArgs: BtcDepositArgs,
  ): Promise<string> {
    // Use BitcoinService to generate proof
    const merkleProof = await this.bitcoinService.fetchMerkleProof(btcTxHash)
    const bitcoinTx = await this.bitcoinService.getTransaction(btcTxHash)
    const rawBitcoinTx = await this.bitcoinService.getTransactionBytes(btcTxHash)
    if (!bitcoinTx.status?.block_hash) {
      throw new Error("Bitcoin: Transaction not confirmed")
    }

    // Validate minimum deposit amount
    const depositAmount = BigInt(bitcoinTx.vout[vout].value)
    const bitcoinConfig = await this.getBitcoinBridgeConfig()
    if (depositAmount < BigInt(bitcoinConfig.min_deposit_amount)) {
      throw new Error(
        `Deposit amount ${depositAmount} is below minimum deposit amount ${bitcoinConfig.min_deposit_amount}`,
      )
    }

    const args: FinBtcTransferArgs = {
      deposit_msg: depositArgs.deposit_msg,
      tx_bytes: Array.from(rawBitcoinTx),
      vout,
      tx_block_blockhash: bitcoinTx.status?.block_hash,
      tx_index: merkleProof.pos,
      merkle_proof: merkleProof.merkle,
    }

    const tx = await this.wallet.signAndSendTransaction({
      receiverId: addresses.btc.btcConnector,
      actions: [actionCreators.functionCall("verify_deposit", args, BigInt(GAS.VERIFY_DEPOSIT))],
      waitUntil: "FINAL",
    })

    return tx.transaction.hash
  }

  /**
   * Initialize NEAR -> BTC withdrawal (NEAR -> BTC flow start)
   * Mirrors init_near_to_bitcoin_transfer() from Rust SDK
   */
  async initBitcoinWithdrawal(
    targetBtcAddress: string,
    amount: bigint,
  ): Promise<{ pendingId: string; nearTxHash: string }> {
    // Get bridge-controlled UTXOs from NEAR contract (not Bitcoin network)
    const utxos = await this.getAvailableUTXOs()
    const bitcoinConfig = await this.getBitcoinBridgeConfig()

    // Validate minimum amount
    if (amount < BigInt(bitcoinConfig.min_withdraw_amount)) {
      throw new Error(
        `Amount ${amount} is below minimum withdrawal amount ${bitcoinConfig.min_withdraw_amount}`,
      )
    }

    // Change address is configured by the bridge (users don't determine this)
    const changeAddress = bitcoinConfig.change_address

    // Use Bitcoin service for UTXO selection
    const { inputs, outputs, fee } = this.bitcoinService.getTransactionData(
      utxos,
      amount,
      targetBtcAddress,
      changeAddress,
      2,
    )

    // Construct transaction message
    const msg: InitBtcTransferMsg = {
      Withdraw: {
        target_btc_address: targetBtcAddress,
        input: inputs.map(
          ({ txid, index }) =>
            `${txid ? Array.from(txid, (byte) => byte.toString(16).padStart(2, "0")).join("") : ""}:${index}`,
        ),
        output: outputs.map((o: Output) => ({
          value: Number(o.amount),
          // @ts-expect-error - `Output` is a union type, we'd have to do type-narrowing
          script_pubkey: Array.from(this.bitcoinService.addressToScriptPubkey(o.address), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join(""),
        })),
      },
    }

    const totalAmount = amount + (fee ?? 0n) + BigInt(bitcoinConfig.withdraw_bridge_fee.fee_min)

    const tx = await this.wallet.signAndSendTransaction({
      receiverId: addresses.btc.btcToken,
      actions: [
        actionCreators.functionCall(
          "ft_transfer_call",
          {
            receiver_id: addresses.btc.btcConnector,
            amount: totalAmount.toString(),
            msg: JSON.stringify(msg),
          },
          GAS.INIT_BTC_TRANSFER,
          BigInt(1), // 1 yoctoNEAR
        ),
      ],
      waitUntil: "FINAL",
    })
    const btcPendingTxLog = tx.receipts_outcome
      .flatMap((receipt) => receipt.outcome.logs)
      .find((log) => log.includes("generate_btc_pending_info"))

    if (!btcPendingTxLog) {
      throw new Error("Bitcoin: Pending transaction not found in NEAR logs")
    }

    const btcPendingTxData = JSON.parse(btcPendingTxLog.split("EVENT_JSON:")[1])
    const btcPendingTx = btcPendingTxData.data[0].btc_pending_id

    return { pendingId: btcPendingTx, nearTxHash: tx.transaction.hash }
  }

  /**
   * Sign Bitcoin transaction (NEAR -> BTC flow middle)
   * Mirrors near_sign_btc_transaction() from Rust SDK
   */
  async signBitcoinTransaction(btcPendingId: string, signIndex: number): Promise<string> {
    const tx = await this.wallet.signAndSendTransaction({
      receiverId: addresses.btc.btcConnector,
      actions: [
        actionCreators.functionCall(
          "sign_btc_transaction",
          {
            btc_pending_id: btcPendingId,
            sign_index: signIndex,
          },
          GAS.SIGN_BTC_TX,
          DEPOSIT.SIGN_BTC_TX,
        ),
      ],
    })

    return tx.transaction.hash
  }

  /**
   * Finalize Bitcoin withdrawal (NEAR -> BTC flow completion)
   * Mirrors btc_fin_transfer() from Rust SDK
   */
  async finalizeBitcoinWithdrawal(nearTxHash: string): Promise<string> {
    // Extract signed Bitcoin transaction from NEAR logs (inline the helper)
    const nearTx = await this.wallet.provider.viewTransactionStatus(
      nearTxHash,
      this.wallet.accountId,
      "FINAL",
    )
    const signedTxLog = nearTx.receipts_outcome
      .flatMap((receipt) => receipt.outcome.logs)
      .find((log) => log.includes("signed_btc_transaction"))

    if (!signedTxLog) {
      throw new Error("Bitcoin: Signed transaction not found in NEAR logs")
    }

    const signedTxData = JSON.parse(signedTxLog.split("EVENT_JSON:")[1])
    const txBytes = Uint8Array.from(signedTxData.data[0].tx_bytes)

    // Convert Uint8Array to hex string
    const txHex = Array.from(txBytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

    // Broadcast to Bitcoin network
    return await this.bitcoinService.broadcastTransaction(txHex)
  }

  /**
   * Wait for Bitcoin transaction signing by monitoring NearBlocks API
   * Based on playground pattern - eliminates manual block explorer queries
   * @param btcPendingId - The pending Bitcoin transaction ID
   * @param signerAccountId - Account that signs Bitcoin transactions (default: cosmosfirst.testnet for testnet)
   * @param maxAttempts - Maximum polling attempts
   * @param delayMs - Delay between polling attempts in milliseconds
   * @returns Promise<string> - NEAR transaction hash containing the signing
   */
  async waitForBitcoinTransactionSigning(
    nearTxHash: string,
    maxAttempts: number = BITCOIN_SIGNING_WAIT.DEFAULT_MAX_ATTEMPTS,
    delayMs: number = BITCOIN_SIGNING_WAIT.DEFAULT_DELAY_MS,
  ): Promise<string> {
    const api = new OmniBridgeAPI()
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const btcTransfer = await api.getTransfer({ transactionHash: nearTxHash })
        const signedTxHash = btcTransfer[0].signed?.NearReceipt?.transaction_hash
        if (signedTxHash) {
          return signedTxHash
        }
      } catch (_error) {
        if (attempt === maxAttempts) {
          throw new Error(
            `Bitcoin: Transaction signing not found after ${maxAttempts} attempts (${(maxAttempts * delayMs) / 1000}s). `,
          )
        }
        // Wait before next attempt
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }

    throw new Error("Bitcoin: Unexpected end of waitForBitcoinTransactionSigning")
  }

  /**
   * Execute complete Bitcoin withdrawal flow automatically
   * Combines initBitcoinWithdrawal -> waitForBitcoinTransactionSigning -> finalizeBitcoinWithdrawal
   * @param targetBtcAddress - Bitcoin address to withdraw to
   * @param amount - Amount to withdraw in satoshis
   * @param signerAccountId - Optional signer account ID (defaults to network relayer)
   * @param maxWaitAttempts - Maximum attempts to wait for signing
   * @param waitDelayMs - Delay between signing checks in milliseconds
   * @returns Promise<string> - Bitcoin transaction hash after successful broadcast
   */
  async executeBitcoinWithdrawal(
    targetBtcAddress: string,
    amount: bigint,
    maxWaitAttempts: number = BITCOIN_SIGNING_WAIT.DEFAULT_MAX_ATTEMPTS,
    waitDelayMs: number = BITCOIN_SIGNING_WAIT.DEFAULT_DELAY_MS,
  ): Promise<string> {
    // Step 1: Initialize Bitcoin withdrawal
    const btcWithdrawal = await this.initBitcoinWithdrawal(targetBtcAddress, amount)

    // Step 2: Wait for MPC signing
    const nearTxHash = await this.waitForBitcoinTransactionSigning(
      btcWithdrawal.nearTxHash,
      maxWaitAttempts,
      waitDelayMs,
    )

    // Step 3: Finalize withdrawal (extract and broadcast)
    const bitcoinTxHash = await this.finalizeBitcoinWithdrawal(nearTxHash)

    return bitcoinTxHash
  }

  /**
   * Verify Bitcoin withdrawal completion (Complete NEAR -> BTC cycle)
   * Mirrors near_btc_verify_withdraw() from Rust SDK
   */
  async verifyBitcoinWithdrawal(btcTxHash: string): Promise<string> {
    const proof = await this.bitcoinService.fetchMerkleProof(btcTxHash)

    const tx = await this.wallet.signAndSendTransaction({
      receiverId: addresses.btc.btcConnector,
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

  // =====================================================================
  // HELPER METHODS FOR BITCOIN OPERATIONS
  // =====================================================================

  /**
   * Get available UTXOs from NEAR btc-connector contract
   */
  public async getAvailableUTXOs(): Promise<UTXO[]> {
    // Query NEAR btc-connector contract for bridge-controlled UTXOs (not Bitcoin network)
    const result = await this.wallet.provider.callFunction(
      addresses.btc.btcConnector,
      "get_utxos_paged",
      {},
    )
    const utxos = result as Record<string, UTXO>

    // Extract txid from key (before '@') and return as array
    return Object.entries(utxos).map(([key, utxo]) => ({
      ...utxo,
      txid: key.split("@")[0],
    }))
  }

  /**
   * Get MPC-controlled change address from bridge contract config
   */
  public async getBitcoinBridgeConfig(): Promise<BtcConnectorConfig> {
    const config = (await this.wallet.provider.callFunction(
      addresses.btc.btcConnector,
      "get_config",
      {},
    )) as BtcConnectorConfig
    return config
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
          actionCreators.functionCall(
            "storage_deposit",
            {},
            BigInt(GAS.STORAGE_DEPOSIT),
            BigInt(neededAmount),
          ),
        ],
      })
    }

    const transferArgs = {
      receiver_id: this.lockerAddress,
      amount: args.amount,
      msg: JSON.stringify(args),
    }

    // Execute the fast finalize transfer
    const tx = await this.wallet.signAndSendTransaction({
      receiverId: args.token_id,
      actions: [
        actionCreators.functionCall(
          "ft_transfer_call",
          transferArgs,
          BigInt(GAS.FAST_FIN_TRANSFER),
          BigInt(DEPOSIT.INIT_TRANSFER),
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

    const nearTokenId = nearTokenAddress.split(":")[1] // Extract account ID from near:account.near

    // Step 3: Amounts and fees are passed directly - contract handles normalization internally

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
      relayer: this.wallet.accountId,
    }

    return await this.fastFinTransfer(fastTransferArgs)
  }
}
