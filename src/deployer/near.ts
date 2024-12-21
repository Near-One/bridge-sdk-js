import { borshSerialize } from "borsher"
import type { Account } from "near-api-js"
import {
  type AccountId,
  type BindTokenArgs,
  ChainKind,
  type DeployTokenArgs,
  DeployTokenArgsSchema,
  type EvmVerifyProofArgs,
  EvmVerifyProofArgsSchema,
  type LogMetadataArgs,
  type OmniAddress,
  ProofKind,
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
  STORAGE_DEPOSIT: BigInt(1e14), // 1 TGas
} as const

/**
 * Configuration for NEAR network deposit amounts.
 * Values represent the amount of NEAR tokens required for each operation.
 * @internal
 */
const DEPOSIT = {
  LOG_METADATA: BigInt(2e23), // 0.2 NEAR
  DEPLOY_TOKEN: BigInt(4e24), // 4 NEAR
  BIND_TOKEN: BigInt(2e23), // 0.2 NEAR
  INIT_TRANSFER: BigInt(1), // 1 yoctoNEAR
} as const

/**
 * Represents the storage deposit balance for a NEAR account
 */
type StorageDeposit = {
  total: bigint
  available: bigint
} | null

interface TransferMessage {
  receiver_id: AccountId
  memo: string | null
  amount: U128
  msg: string | null
}

interface InitTransferMessage {
  recipient: OmniAddress
  fee: U128
  native_token_fee: U128
}

/**
 * Interface representing the results of various balance queries
 * @property regBalance - Required balance for account registration
 * @property initBalance - Required balance for initializing transfers
 * @property storage - Current storage deposit balance information
 */
interface BalanceResults {
  regBalance: bigint
  initBalance: bigint
  storage: StorageDeposit
}

/**
 * NEAR blockchain implementation of the token deployer.
 * Handles token deployment, binding, and transfer operations on the NEAR blockchain.
 */
export class NearDeployer {
  /**
   * Creates a new NEAR token deployer instance
   * @param wallet - NEAR account instance for transaction signing
   * @param lockerAddress - Address of the token locker contract
   * @throws {Error} If locker address is not configured
   */
  constructor(
    private wallet: Account,
    private lockerAddress: string = process.env.OMNI_LOCKER_NEAR as string,
  ) {
    if (!this.lockerAddress) {
      throw new Error("OMNI_LOCKER_NEAR address not configured")
    }
  }

  /**
   * Logs metadata for a token on the NEAR blockchain
   * @param tokenAddress - Omni address of the token
   * @throws {Error} If token address is not on NEAR chain
   * @returns Promise resolving to the transaction hash
   */
  async logMetadata(tokenAddress: OmniAddress): Promise<string> {
    // Validate source chain is NEAR
    if (getChain(tokenAddress) !== ChainKind.Near) {
      throw new Error("Token address must be on NEAR")
    }

    // Extract token account ID from OmniAddress
    const [_, tokenAccountId] = tokenAddress.split(":")

    const args: LogMetadataArgs = {
      token_id: tokenAccountId,
    }
    const tx = await this.wallet.functionCall({
      contractId: this.lockerAddress,
      methodName: "log_metadata",
      args: args,
      gas: GAS.LOG_METADATA,
      attachedDeposit: DEPOSIT.LOG_METADATA,
    })

    return tx.transaction.hash
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
    const proverArgsSerialized = borshSerialize(WormholeVerifyProofArgsSchema, proverArgs)

    // Construct deploy token arguments
    const args: DeployTokenArgs = {
      chain_kind: destinationChain,
      prover_args: proverArgsSerialized,
    }
    const serializedArgs = borshSerialize(DeployTokenArgsSchema, args)

    const tx = await this.wallet.functionCall({
      contractId: this.lockerAddress,
      methodName: "deploy_token",
      args: serializedArgs,
      gas: GAS.DEPLOY_TOKEN,
      attachedDeposit: DEPOSIT.DEPLOY_TOKEN,
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
      proverArgsSerialized = borshSerialize(WormholeVerifyProofArgsSchema, proverArgs)
    } else if (evmProof) {
      const proverArgs: EvmVerifyProofArgs = {
        proof_kind: ProofKind.DeployToken,
        proof: evmProof.proof,
      }
      proverArgsSerialized = borshSerialize(EvmVerifyProofArgsSchema, proverArgs)
    }

    // Construct bind token arguments
    const args: BindTokenArgs = {
      chain_kind: sourceChain,
      prover_args: proverArgsSerialized,
    }
    const tx = await this.wallet.functionCall({
      contractId: this.lockerAddress,
      methodName: "bind_token",
      args,
      gas: GAS.BIND_TOKEN,
      attachedDeposit: DEPOSIT.BIND_TOKEN,
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
   * @returns Promise resolving to object containing transaction hash and nonce
   */

  async initTransfer(
    token: OmniAddress,
    recipient: OmniAddress,
    amount: bigint,
  ): Promise<{ hash: string; nonce: number }> {
    if (getChain(token) !== ChainKind.Near) {
      throw new Error("Token address must be on NEAR")
    }
    const tokenAddress = token.split(":")[1]

    const { regBalance, initBalance, storage } = await this.getBalances()
    const requiredBalance = regBalance + initBalance
    const existingBalance = storage?.available ?? BigInt(0)

    if (requiredBalance > existingBalance) {
      const neededAmount = requiredBalance - existingBalance
      await this.wallet.functionCall({
        contractId: this.lockerAddress,
        methodName: "storage_deposit",
        args: {},
        gas: GAS.STORAGE_DEPOSIT,
        attachedDeposit: neededAmount,
      })
    }

    const initTransferMessage: InitTransferMessage = {
      recipient: recipient,
      fee: BigInt(0),
      native_token_fee: BigInt(0),
    }
    const args: TransferMessage = {
      receiver_id: this.lockerAddress,
      amount: amount,
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

    return {
      hash: tx.transaction.hash,
      nonce: tx.transaction.nonce,
    }
  }

  /**
   * Retrieves various balance information for the current account
   * @private
   * @returns Promise resolving to object containing required balances and storage information
   * @throws {Error} If balance fetching fails
   */
  private async getBalances(): Promise<BalanceResults> {
    try {
      const [regBalanceStr, initBalanceStr, storage] = await Promise.all([
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
        storage: convertedStorage,
      }
    } catch (error) {
      console.error("Error fetching balances:", error)
      throw error
    }
  }
}
