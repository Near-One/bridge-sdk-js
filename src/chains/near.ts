import { borshSerialize } from "borsher"
import type { Account } from "near-api-js"
import {
  type BindTokenArgs,
  type ChainDeployer,
  ChainKind,
  type DeployTokenArgs,
  DeployTokenArgsSchema,
  type EvmVerifyProofArgs,
  EvmVerifyProofArgsSchema,
  type LogMetadataArgs,
  type OmniAddress,
  ProofKind,
  type WormholeVerifyProofArgs,
  WormholeVerifyProofArgsSchema,
} from "../types"
import { getChain } from "../utils"

/**
 * Configuration for NEAR network gas limits
 * @internal
 */
const GAS = {
  LOG_METADATA: BigInt(3e14), // 3 TGas
  DEPLOY_TOKEN: BigInt(1.2e14), // 1.2 TGas
  BIND_TOKEN: BigInt(3e14), // 3 TGas
} as const

/**
 * Configuration for NEAR network deposit amounts
 * @internal
 */
const DEPOSIT = {
  LOG_METADATA: BigInt(2e23), // 0.2 NEAR
  DEPLOY_TOKEN: BigInt(4e24), // 4 NEAR
  BIND_TOKEN: BigInt(2e23), // 0.2 NEAR
} as const

/**
 * NEAR blockchain implementation of the token deployer
 * @implements {ChainDeployer<Account>}
 */
export class NearDeployer implements ChainDeployer<Account> {
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

  async initDeployToken(tokenAddress: OmniAddress): Promise<string> {
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

  async finDeployToken(destinationChain: ChainKind, vaa: string): Promise<string> {
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
   * @param sourceChain - Source chain for binding
   * @param vaa - Verified Action Approval for Wormhole verification
   * @param evmProof - EVM proof for Ethereum or EVM chain verification
   * @throws {Error} If VAA or EVM proof is not provided
   * @returns Transaction hash of the bind token transaction
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

    let proverArgsSerialized: Buffer = Buffer.alloc(0)
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
}
