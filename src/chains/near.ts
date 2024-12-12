import type { Account } from "near-api-js"
import { serializeDeployTokenArgs } from "../borsh"
import type {
  BindTokenArgs,
  ChainDeployer,
  FinDeployTokenArgs,
  InitDeployTokenArgs,
  OmniAddress,
  TokenDeployment,
} from "../types"
import { Chain } from "../types"
import { getChain } from "../utils"

const GAS = {
  LOG_METADATA: BigInt(3e14), // 300 * 10^12
  DEPLOY_TOKEN: BigInt(3e14), // 300 * 10^12
  BIND_TOKEN: BigInt(3e14), // 300 * 10^12
} as const

const DEPOSIT = {
  LOG_METADATA: BigInt(1e24), // 1 NEAR (10^24)
  DEPLOY_TOKEN: BigInt(1e24), // 1 NEAR (10^24)
  BIND_TOKEN: BigInt(1e24), // 1 NEAR (10^24)
} as const

export class NearDeployer implements ChainDeployer {
  constructor(
    private wallet: Account,
    private network: "testnet" | "mainnet",
    private lockerAddress: string = process.env.OMNI_LOCKER_NEAR as string,
  ) {
    if (!this.lockerAddress) {
      throw new Error("OMNI_LOCKER_NEAR address not configured")
    }
  }

  async initDeployToken(
    tokenAddress: OmniAddress,
    destinationChain: Chain,
  ): Promise<TokenDeployment> {
    // Validate source chain is NEAR
    if (getChain(tokenAddress) !== Chain.Near) {
      throw new Error("Token address must be on NEAR chain")
    }

    // Extract token account ID from OmniAddress
    const [_, tokenAccountId] = tokenAddress.split(":")

    try {
      // Construct log metadata arguments
      const tx = await this.wallet.functionCall({
        contractId: this.lockerAddress,
        methodName: "log_metadata",
        args: { token_id: tokenAccountId } as InitDeployTokenArgs,
        gas: GAS.LOG_METADATA,
        attachedDeposit: DEPOSIT.LOG_METADATA,
      })

      return {
        id: tx.transaction.hash,
        tokenAddress,
        sourceChain: Chain.Near,
        destinationChain,
        status: "pending",
      }
    } catch (error) {
      throw new Error(`Failed to initialize token deployment: ${error}`)
    }
  }

  async finDeployToken(deployment: TokenDeployment): Promise<TokenDeployment> {
    if (deployment.status !== "ready_for_finalize") {
      throw new Error(`Invalid deployment status: ${deployment.status}`)
    }

    if (!deployment.proof) {
      throw new Error("Deployment proof missing")
    }

    try {
      // Construct deploy token arguments
      const args: FinDeployTokenArgs = {
        chain_kind: deployment.destinationChain,
        prover_args: {
          token_address: deployment.tokenAddress,
          name: deployment.logMetadata.name,
          symbol: deployment.logMetadata.symbol,
          decimals: deployment.logMetadata.decimals,
          emitter_address: deployment.tokenAddress,
        },
      }
      const serializedArgs = serializeDeployTokenArgs(args)

      const tx = await this.wallet.functionCall({
        contractId: this.lockerAddress,
        methodName: "deploy_token",
        args: serializedArgs,
        gas: GAS.DEPLOY_TOKEN,
        attachedDeposit: DEPOSIT.DEPLOY_TOKEN,
      })

      return {
        ...deployment,
        status: "finalized",
        deploymentTx: tx.transaction.hash,
      }
    } catch (error) {
      throw new Error(`Failed to finalize token deployment: ${error}`)
    }
  }

  async bindToken(deployment: TokenDeployment): Promise<TokenDeployment> {
    if (deployment.status !== "ready_for_bind") {
      throw new Error(`Invalid deployment status: ${deployment.status}`)
    }

    if (!deployment.proof) {
      throw new Error("Deployment proof missing")
    }

    try {
      // Construct bind token arguments
      const args: BindTokenArgs = {
        chain_kind: deployment.destinationChain,
        prover_args: deployment.proof,
      }

      const tx = await this.wallet.functionCall({
        contractId: this.lockerAddress,
        methodName: "bind_token",
        args,
        gas: GAS.BIND_TOKEN,
        attachedDeposit: DEPOSIT.BIND_TOKEN,
      })

      return {
        ...deployment,
        bindTx: tx.transaction.hash,
        status: "completed",
      }
    } catch (error) {
      throw new Error(`Failed to bind token: ${error}`)
    }
  }
}
