/**
 * NEAR transaction builder for Omni Bridge
 */

import {
  ChainKind,
  getAddresses,
  type NearAction,
  type NearUnsignedTransaction,
  type Network,
  type ValidatedTransfer,
} from "@omni-bridge/core"
import { Near } from "near-kit"
import {
  BindTokenArgsSchema,
  DEPOSIT,
  DeployTokenArgsSchema,
  type EvmVerifyProofArgs,
  EvmVerifyProofArgsSchema,
  type FastFinTransferParams,
  type FinalizationParams,
  FinTransferArgsSchema,
  GAS,
  ProofKind,
  type TransferId,
  type UTXO,
  type UtxoConnectorConfig,
  type UtxoDepositFinalizationParams,
  type UtxoWithdrawalInitParams,
  type UtxoWithdrawalVerifyParams,
  type WormholeVerifyProofArgs,
  WormholeVerifyProofArgsSchema,
} from "./types.js"

export interface NearBuilderConfig {
  network: Network
}

/**
 * NEAR transaction builder interface
 */
export interface NearBuilder {
  /**
   * Build an unsigned transfer transaction
   */
  buildTransfer(validated: ValidatedTransfer, signerId: string): NearUnsignedTransaction

  /**
   * Build a storage deposit transaction
   */
  buildStorageDeposit(signerId: string, amount: bigint): NearUnsignedTransaction

  /**
   * Build a finalization transaction
   */
  buildFinalization(params: FinalizationParams): NearUnsignedTransaction

  /**
   * Build a log metadata transaction
   */
  buildLogMetadata(token: string, signerId: string): NearUnsignedTransaction

  /**
   * Build a deploy token transaction
   */
  buildDeployToken(
    destinationChain: ChainKind,
    proverArgs: Uint8Array,
    signerId: string,
    deposit: bigint,
  ): NearUnsignedTransaction

  /**
   * Build a bind token transaction
   */
  buildBindToken(
    sourceChain: ChainKind,
    proverArgs: Uint8Array,
    signerId: string,
    deposit: bigint,
  ): NearUnsignedTransaction

  /**
   * Build a sign transfer transaction
   */
  buildSignTransfer(
    transferId: TransferId,
    feeRecipient: string,
    fee: { fee: string; native_fee: string },
    signerId: string,
  ): NearUnsignedTransaction

  /**
   * Build a fast finalization transfer transaction
   */
  buildFastFinTransfer(params: FastFinTransferParams, signerId: string): NearUnsignedTransaction

  /**
   * Serialize EVM proof arguments for prover
   */
  serializeEvmProofArgs(args: EvmVerifyProofArgs): Uint8Array

  /**
   * Serialize Wormhole VAA proof arguments for prover
   */
  serializeWormholeProofArgs(args: WormholeVerifyProofArgs): Uint8Array

  /**
   * Get required storage deposit for an account on the bridge contract.
   * Makes view calls to check current balance vs required amounts.
   *
   * @param accountId - Account to check storage for
   * @returns Amount of additional storage deposit needed (0n if sufficient)
   */
  getRequiredStorageDeposit(accountId: string): Promise<bigint>

  /**
   * Check if a token has storage registered for the bridge contract.
   * If not, the bridge contract needs storage_deposit on the token before transfers.
   *
   * @param tokenId - Token contract to check
   * @returns true if bridge has storage, false if storage_deposit needed
   */
  isTokenStorageRegistered(tokenId: string): Promise<boolean>

  /**
   * Build a storage deposit transaction on a token contract for the bridge.
   * This is needed before the bridge can receive tokens.
   *
   * @param tokenId - Token contract to register storage on
   * @param signerId - Account paying for storage
   * @returns Unsigned transaction for storage_deposit
   */
  buildTokenStorageDeposit(tokenId: string, signerId: string): Promise<NearUnsignedTransaction>

  // ===========================================================================
  // UTXO METHODS (BTC/Zcash)
  // ===========================================================================

  /**
   * Build a transaction to finalize a UTXO deposit on NEAR.
   * This calls `verify_deposit` on the BTC/Zcash connector contract.
   *
   * @param params - Deposit finalization parameters including proof data
   * @returns Unsigned transaction for verify_deposit
   */
  buildUtxoDepositFinalization(params: UtxoDepositFinalizationParams): NearUnsignedTransaction

  /**
   * Build a transaction to initiate a UTXO withdrawal from NEAR.
   * This calls `ft_transfer_call` on the nBTC/nZEC token to the connector.
   *
   * @param params - Withdrawal parameters including target address and UTXO plan
   * @returns Unsigned transaction for ft_transfer_call
   */
  buildUtxoWithdrawalInit(params: UtxoWithdrawalInitParams): NearUnsignedTransaction

  /**
   * Build a transaction to verify a UTXO withdrawal on NEAR.
   * This calls `btc_verify_withdraw` on the connector after broadcasting.
   *
   * @param params - Verification parameters including merkle proof
   * @returns Unsigned transaction for btc_verify_withdraw
   */
  buildUtxoWithdrawalVerify(params: UtxoWithdrawalVerifyParams): NearUnsignedTransaction

  /**
   * Get the UTXO connector contract address for a chain.
   *
   * @param chain - The UTXO chain ("btc" or "zcash")
   * @returns The connector contract address
   */
  getUtxoConnectorAddress(chain: "btc" | "zcash"): string

  /**
   * Get the UTXO token contract address for a chain.
   *
   * @param chain - The UTXO chain ("btc" or "zcash")
   * @returns The token contract address (nBTC or nZEC)
   */
  getUtxoTokenAddress(chain: "btc" | "zcash"): string

  /**
   * Get the UTXO connector configuration from the contract.
   *
   * @param chain - The UTXO chain ("btc" or "zcash")
   * @returns The connector configuration
   */
  getUtxoConnectorConfig(chain: "btc" | "zcash"): Promise<UtxoConnectorConfig>

  /**
   * Get available UTXOs from the connector contract.
   *
   * @param chain - The UTXO chain ("btc" or "zcash")
   * @returns Array of available UTXOs for withdrawal
   */
  getUtxoAvailableOutputs(chain: "btc" | "zcash"): Promise<UTXO[]>

  /**
   * Get the nBTC/nZEC token balance for an account.
   *
   * @param chain - The UTXO chain ("btc" or "zcash")
   * @param accountId - NEAR account to check balance for
   * @returns Token balance in satoshis/zatoshis
   */
  getUtxoTokenBalance(chain: "btc" | "zcash", accountId: string): Promise<bigint>

  /**
   * Calculate the bridge fee for a UTXO withdrawal.
   *
   * @param chain - The UTXO chain ("btc" or "zcash")
   * @param amount - Withdrawal amount in satoshis/zatoshis
   * @returns Bridge fee amount
   */
  calculateUtxoWithdrawalFee(chain: "btc" | "zcash", amount: bigint): Promise<bigint>
}

/**
 * Encode args as JSON bytes
 */
function encodeArgs(args: unknown): Uint8Array {
  const jsonStr = JSON.stringify(args)
  return new TextEncoder().encode(jsonStr)
}

class NearBuilderImpl implements NearBuilder {
  private readonly bridgeContract: string
  readonly network: Network

  constructor(network: Network) {
    this.network = network
    const addresses = getAddresses(network)
    this.bridgeContract = addresses.near.contract
  }

  buildTransfer(validated: ValidatedTransfer, signerId: string): NearUnsignedTransaction {
    if (validated.sourceChain !== ChainKind.Near) {
      throw new Error(`Source chain ${validated.sourceChain} is not NEAR`)
    }

    // Extract token address (remove "near:" prefix)
    const tokenParts = validated.params.token.split(":")
    const tokenAddress = tokenParts[1]
    if (!tokenAddress) {
      throw new Error("Invalid token address format")
    }

    // Build init transfer message
    const initTransferMessage = {
      recipient: validated.params.recipient,
      fee: validated.params.fee.toString(),
      native_token_fee: validated.params.nativeFee.toString(),
      msg: validated.params.message ?? null,
    }

    // Build ft_transfer_call args
    const args = {
      receiver_id: this.bridgeContract,
      amount: validated.params.amount.toString(),
      memo: null,
      msg: JSON.stringify(initTransferMessage),
    }

    const action: NearAction = {
      type: "FunctionCall",
      methodName: "ft_transfer_call",
      args: encodeArgs(args),
      gas: GAS.INIT_TRANSFER,
      deposit: DEPOSIT.ONE_YOCTO,
    }

    return {
      type: "near",
      signerId,
      receiverId: tokenAddress,
      actions: [action],
    }
  }

  buildStorageDeposit(signerId: string, amount: bigint): NearUnsignedTransaction {
    const action: NearAction = {
      type: "FunctionCall",
      methodName: "storage_deposit",
      args: encodeArgs({}),
      gas: GAS.STORAGE_DEPOSIT,
      deposit: amount,
    }

    return {
      type: "near",
      signerId,
      receiverId: this.bridgeContract,
      actions: [action],
    }
  }

  buildFinalization(params: FinalizationParams): NearUnsignedTransaction {
    if (!params.vaa && !params.evmProof) {
      throw new Error("Must provide either VAA or EVM proof")
    }

    let proverArgsSerialized: Uint8Array
    if (params.vaa) {
      proverArgsSerialized = this.serializeWormholeProofArgs({
        proof_kind: ProofKind.InitTransfer,
        vaa: params.vaa,
      })
    } else if (params.evmProof) {
      proverArgsSerialized = this.serializeEvmProofArgs(params.evmProof)
    } else {
      throw new Error("Must provide either VAA or EVM proof")
    }

    // Build args using zorsh schema
    const args = FinTransferArgsSchema.serialize({
      chain_kind: params.sourceChain,
      storage_deposit_actions: params.storageDepositActions,
      prover_args: proverArgsSerialized,
    })

    const action: NearAction = {
      type: "FunctionCall",
      methodName: "fin_transfer",
      args,
      gas: GAS.FIN_TRANSFER,
      deposit: DEPOSIT.ONE_YOCTO, // Consumer should calculate actual deposit
    }

    return {
      type: "near",
      signerId: params.signerId,
      receiverId: this.bridgeContract,
      actions: [action],
    }
  }

  buildLogMetadata(token: string, signerId: string): NearUnsignedTransaction {
    const args = { token_id: token }

    const action: NearAction = {
      type: "FunctionCall",
      methodName: "log_metadata",
      args: encodeArgs(args),
      gas: GAS.LOG_METADATA,
      deposit: DEPOSIT.ONE_YOCTO,
    }

    return {
      type: "near",
      signerId,
      receiverId: this.bridgeContract,
      actions: [action],
    }
  }

  buildDeployToken(
    destinationChain: ChainKind,
    proverArgs: Uint8Array,
    signerId: string,
    deposit: bigint,
  ): NearUnsignedTransaction {
    const args = DeployTokenArgsSchema.serialize({
      chain_kind: destinationChain,
      prover_args: proverArgs,
    })

    const action: NearAction = {
      type: "FunctionCall",
      methodName: "deploy_token",
      args,
      gas: GAS.DEPLOY_TOKEN,
      deposit,
    }

    return {
      type: "near",
      signerId,
      receiverId: this.bridgeContract,
      actions: [action],
    }
  }

  buildBindToken(
    sourceChain: ChainKind,
    proverArgs: Uint8Array,
    signerId: string,
    deposit: bigint,
  ): NearUnsignedTransaction {
    const args = BindTokenArgsSchema.serialize({
      chain_kind: sourceChain,
      prover_args: proverArgs,
    })

    const action: NearAction = {
      type: "FunctionCall",
      methodName: "bind_token",
      args,
      gas: GAS.BIND_TOKEN,
      deposit,
    }

    return {
      type: "near",
      signerId,
      receiverId: this.bridgeContract,
      actions: [action],
    }
  }

  buildSignTransfer(
    transferId: TransferId,
    feeRecipient: string,
    fee: { fee: string; native_fee: string },
    signerId: string,
  ): NearUnsignedTransaction {
    // Convert chain kind to string if needed
    let originChain: string | number = transferId.origin_chain
    if (typeof originChain === "number") {
      originChain = ChainKind[originChain] ?? originChain
    }

    const args = {
      transfer_id: {
        origin_chain: originChain,
        origin_nonce: Number(transferId.origin_nonce),
      },
      fee_recipient: feeRecipient,
      fee: {
        fee: fee.fee,
        native_fee: fee.native_fee,
      },
    }

    const action: NearAction = {
      type: "FunctionCall",
      methodName: "sign_transfer",
      args: encodeArgs(args),
      gas: GAS.SIGN_TRANSFER,
      deposit: DEPOSIT.ONE_YOCTO,
    }

    return {
      type: "near",
      signerId,
      receiverId: this.bridgeContract,
      actions: [action],
    }
  }

  buildFastFinTransfer(params: FastFinTransferParams, signerId: string): NearUnsignedTransaction {
    // Convert origin chain to string if needed
    let originChain: string | number = params.transferId.origin_chain
    if (typeof originChain === "number") {
      originChain = ChainKind[originChain] ?? originChain
    }

    const transferArgs = {
      receiver_id: this.bridgeContract,
      amount: params.amountToSend,
      msg: JSON.stringify({
        token_id: params.tokenId,
        amount: params.amount,
        amount_to_send: params.amountToSend,
        transfer_id: {
          origin_chain: originChain,
          origin_nonce:
            typeof params.transferId.origin_nonce === "bigint"
              ? params.transferId.origin_nonce.toString()
              : params.transferId.origin_nonce,
        },
        recipient: params.recipient,
        fee: params.fee,
        msg: params.msg ?? "",
        storage_deposit_amount: params.storageDepositAmount,
        relayer: params.relayer,
      }),
    }

    const action: NearAction = {
      type: "FunctionCall",
      methodName: "ft_transfer_call",
      args: encodeArgs(transferArgs),
      gas: GAS.FAST_FIN_TRANSFER,
      deposit: DEPOSIT.ONE_YOCTO,
    }

    return {
      type: "near",
      signerId,
      receiverId: params.tokenId,
      actions: [action],
    }
  }

  serializeEvmProofArgs(args: EvmVerifyProofArgs): Uint8Array {
    return EvmVerifyProofArgsSchema.serialize(args)
  }

  serializeWormholeProofArgs(args: WormholeVerifyProofArgs): Uint8Array {
    return WormholeVerifyProofArgsSchema.serialize(args)
  }

  async getRequiredStorageDeposit(accountId: string): Promise<bigint> {
    const near = this.getNearClient()

    const [regBalance, initBalance, storage] = await Promise.all([
      near.view<string>(this.bridgeContract, "required_balance_for_account", {}),
      near.view<string>(this.bridgeContract, "required_balance_for_init_transfer", {}),
      near.view<{ total: string; available: string } | null>(
        this.bridgeContract,
        "storage_balance_of",
        {
          account_id: accountId,
        },
      ),
    ])

    if (!regBalance || !initBalance) {
      throw new Error("Failed to retrieve required balance information")
    }

    const required = BigInt(regBalance) + BigInt(initBalance)
    const existing = storage?.available ? BigInt(storage.available) : 0n
    return required > existing ? required - existing : 0n
  }

  async isTokenStorageRegistered(tokenId: string): Promise<boolean> {
    const near = this.getNearClient()

    const storage = await near.view<{ total: string; available: string } | null>(
      tokenId,
      "storage_balance_of",
      { account_id: this.bridgeContract },
    )

    return storage !== null && storage !== undefined
  }

  async buildTokenStorageDeposit(
    tokenId: string,
    signerId: string,
  ): Promise<NearUnsignedTransaction> {
    const near = this.getNearClient()

    // Get required storage amount from token contract
    const bounds = await near.view<{ min: string; max: string }>(
      tokenId,
      "storage_balance_bounds",
      {},
    )

    if (!bounds) {
      throw new Error("Failed to retrieve storage balance bounds from token")
    }

    const requiredAmount = BigInt(bounds.min)

    const action: NearAction = {
      type: "FunctionCall",
      methodName: "storage_deposit",
      args: encodeArgs({ account_id: this.bridgeContract }),
      gas: GAS.STORAGE_DEPOSIT,
      deposit: requiredAmount,
    }

    return {
      type: "near",
      signerId,
      receiverId: tokenId,
      actions: [action],
    }
  }

  // ===========================================================================
  // UTXO METHODS (BTC/Zcash)
  // ===========================================================================

  buildUtxoDepositFinalization(params: UtxoDepositFinalizationParams): NearUnsignedTransaction {
    const connector = this.getUtxoConnectorAddress(params.chain)

    // Build deposit_msg for the contract (convert bigint amounts to strings)
    const depositMsg = {
      recipient_id: params.depositMsg.recipient_id,
      post_actions: params.depositMsg.post_actions?.map((action) => ({
        receiver_id: action.receiver_id,
        amount: action.amount.toString(),
        memo: action.memo,
        msg: action.msg,
        gas: action.gas?.toString(),
      })),
      extra_msg: params.depositMsg.extra_msg,
    }

    const args = {
      deposit_msg: depositMsg,
      tx_bytes: params.txBytes,
      vout: params.vout,
      tx_block_blockhash: params.txBlockBlockhash,
      tx_index: params.txIndex,
      merkle_proof: params.merkleProof,
    }

    const action: NearAction = {
      type: "FunctionCall",
      methodName: "verify_deposit",
      args: encodeArgs(args),
      gas: GAS.UTXO_VERIFY_DEPOSIT,
      deposit: 0n,
    }

    return {
      type: "near",
      signerId: params.signerId,
      receiverId: connector,
      actions: [action],
    }
  }

  buildUtxoWithdrawalInit(params: UtxoWithdrawalInitParams): NearUnsignedTransaction {
    const token = this.getUtxoTokenAddress(params.chain)
    const connector = this.getUtxoConnectorAddress(params.chain)

    // Build the withdrawal message
    const withdrawMsg = {
      Withdraw: {
        target_btc_address: params.targetAddress,
        input: params.inputs,
        output: params.outputs,
        ...(params.maxGasFee !== undefined && { max_gas_fee: params.maxGasFee.toString() }),
      },
    }

    const args = {
      receiver_id: connector,
      amount: params.totalAmount.toString(),
      msg: JSON.stringify(withdrawMsg),
    }

    const action: NearAction = {
      type: "FunctionCall",
      methodName: "ft_transfer_call",
      args: encodeArgs(args),
      gas: GAS.UTXO_INIT_WITHDRAWAL,
      deposit: DEPOSIT.ONE_YOCTO,
    }

    return {
      type: "near",
      signerId: params.signerId,
      receiverId: token,
      actions: [action],
    }
  }

  buildUtxoWithdrawalVerify(params: UtxoWithdrawalVerifyParams): NearUnsignedTransaction {
    const connector = this.getUtxoConnectorAddress(params.chain)

    const args = {
      tx_proof: {
        block_height: params.blockHeight,
        merkle: params.merkle,
        pos: params.pos,
      },
    }

    const action: NearAction = {
      type: "FunctionCall",
      methodName: "btc_verify_withdraw",
      args: encodeArgs(args),
      gas: GAS.UTXO_VERIFY_WITHDRAWAL,
      deposit: DEPOSIT.ONE_YOCTO,
    }

    return {
      type: "near",
      signerId: params.signerId,
      receiverId: connector,
      actions: [action],
    }
  }

  getUtxoConnectorAddress(chain: "btc" | "zcash"): string {
    const addresses = getAddresses(this.network)
    if (chain === "btc") {
      return addresses.btc.btcConnector
    }
    return addresses.zcash.zcashConnector
  }

  getUtxoTokenAddress(chain: "btc" | "zcash"): string {
    const addresses = getAddresses(this.network)
    if (chain === "btc") {
      return addresses.btc.btcToken
    }
    return addresses.zcash.zcashToken
  }

  async getUtxoConnectorConfig(chain: "btc" | "zcash"): Promise<UtxoConnectorConfig> {
    const near = this.getNearClient()
    const connector = this.getUtxoConnectorAddress(chain)

    const config = await near.view<UtxoConnectorConfig>(connector, "get_config", {})
    if (!config) {
      throw new Error(`Failed to retrieve ${chain.toUpperCase()} connector config`)
    }

    return config
  }

  async getUtxoAvailableOutputs(chain: "btc" | "zcash"): Promise<UTXO[]> {
    const near = this.getNearClient()
    const connector = this.getUtxoConnectorAddress(chain)

    interface RawUtxoEntry {
      vout: number
      balance: string
      path?: string
      tx_bytes?: number[]
    }

    const result = await near.view<Record<string, RawUtxoEntry>>(connector, "get_utxos_paged", {})
    const utxos = result ?? {}

    return Object.entries(utxos).map(([key, utxo]) => {
      const parts = key.split("@")
      const txid = parts[0]
      if (!txid) {
        throw new Error(`Invalid UTXO key format: ${key}`)
      }
      return {
        txid,
        vout: utxo.vout,
        balance: BigInt(utxo.balance),
        path: utxo.path,
        tx_bytes: utxo.tx_bytes,
      }
    })
  }

  async getUtxoTokenBalance(chain: "btc" | "zcash", accountId: string): Promise<bigint> {
    const near = this.getNearClient()
    const token = this.getUtxoTokenAddress(chain)

    const balance = await near.view<string>(token, "ft_balance_of", {
      account_id: accountId,
    })

    return BigInt(balance ?? "0")
  }

  async calculateUtxoWithdrawalFee(chain: "btc" | "zcash", amount: bigint): Promise<bigint> {
    const config = await this.getUtxoConnectorConfig(chain)
    const feeConfig = config.withdraw_bridge_fee

    // Basis point denominator: 1 basis point = 0.01%, so 10000 = 100%
    const MAX_RATIO = 10000n
    const feeRate = BigInt(feeConfig.fee_rate)
    const feeMin = BigInt(feeConfig.fee_min)

    const percentageFee = (amount * feeRate) / MAX_RATIO
    return percentageFee > feeMin ? percentageFee : feeMin
  }

  private getNearClient(): Near {
    return new Near({ network: this.network as "mainnet" | "testnet" })
  }
}

/**
 * Create a NEAR transaction builder
 */
export function createNearBuilder(config: NearBuilderConfig): NearBuilder {
  return new NearBuilderImpl(config.network)
}
