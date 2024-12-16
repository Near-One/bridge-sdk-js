import { ethers } from "ethers"
import { ChainKind, type MPCSignature, type OmniAddress } from "../types"
import { getChain } from "../utils"

interface TokenMetadata {
  token: string
  name: string
  symbol: string
  decimals: number
}

// Contract ABI for the bridge token factory
const BRIDGE_TOKEN_FACTORY_ABI = [
  "function deployToken(bytes signatureData, tuple(string token, string name, string symbol, uint8 decimals) metadata) external returns (address)",
  "function finTransfer(bytes signature, tuple(uint64 destinationNonce, uint8 originChain, uint64 originNonce, address tokenAddress, uint128 amount, address recipient, string feeRecipient) transferPayload) external",
  "function initTransfer(address tokenAddress, uint128 amount, uint128 fee, uint128 nativeFee, string recipient, string message) external",
  "function nearToEthToken(string nearTokenId) external view returns (address)",
  "function logMetadata(address tokenAddress) external returns (string)",
] as const

/**
 * Gas limits for Ethereum transactions
 * @internal
 */
const GAS_LIMIT = {
  DEPLOY_TOKEN: 500000,
  APPROVE: 60000,
  TRANSFER: 200000,
  LOG_METADATA: 100000,
} as const

/**
 * Ethereum blockchain implementation of the token deployer
 */
export class EthereumDeployer {
  private factory: ethers.Contract

  /**
   * Creates a new Ethereum token deployer instance
   * @param wallet - Ethereum signer instance for transaction signing
   * @param factoryAddress - Address of the bridge token factory contract
   * @throws {Error} If factory address is not configured
   */
  constructor(
    private wallet: ethers.Signer,
    private factoryAddress: string = process.env.OMNI_FACTORY_ETH as string,
  ) {
    if (!this.factoryAddress) {
      throw new Error("OMNI_FACTORY_ETH address not configured")
    }
    this.factory = new ethers.Contract(this.factoryAddress, BRIDGE_TOKEN_FACTORY_ABI, this.wallet)
  }

  /**
   * Logs metadata for a token
   * @param tokenAddress - OmniAddress of the token
   * @returns Promise resolving to the transaction hash
   * @throws Will throw an error if logging fails or caller doesn't have admin role
   */
  async logMetadata(tokenAddress: OmniAddress): Promise<string> {
    // Validate source chain is Ethereum
    if (getChain(tokenAddress) !== ChainKind.Eth) {
      throw new Error("Token address must be on Ethereum")
    }

    // Extract token address from OmniAddress
    const [_, tokenAccountId] = tokenAddress.split(":")

    try {
      // Call logMetadata function on the contract
      const tx = await this.factory.logMetadata(tokenAccountId, {
        gasLimit: GAS_LIMIT.LOG_METADATA,
      })
      return tx.hash
    } catch (error) {
      // Check if error message contains revert string
      if (error instanceof Error && error.message.includes("DEFAULT_ADMIN_ROLE")) {
        throw new Error("Failed to log metadata: Caller does not have admin role")
      }
      throw new Error(
        `Failed to log metadata: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    }
  }

  /**
   * Deploys an ERC-20 token representing a bridged version of a token from another chain.
   * @param signature - MPC signature authorizing the token deployment
   * @param metadata - Object containing token metadata
   * @returns Promise resolving to object containing transaction hash and deployed token address
   * @throws Will throw an error if the deployment fails
   */
  async deployToken(
    signature: MPCSignature,
    metadata: TokenMetadata,
  ): Promise<{
    txHash: string
    tokenAddress: string
  }> {
    const tx = await this.factory.deployToken(signature.toBytes(), metadata, {
      gasLimit: GAS_LIMIT.DEPLOY_TOKEN,
    })

    const receipt = await tx.wait()
    const deployedAddress = receipt.events?.[0]?.args?.token || receipt.contractAddress

    return {
      txHash: tx.hash,
      tokenAddress: deployedAddress,
    }
  }
}
