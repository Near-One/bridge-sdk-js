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
        origin_nonce: transferId.origin_nonce.toString(),
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
}

/**
 * Create a NEAR transaction builder
 */
export function createNearBuilder(config: NearBuilderConfig): NearBuilder {
  return new NearBuilderImpl(config.network)
}
