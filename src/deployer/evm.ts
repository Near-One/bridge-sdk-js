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

type EVMChainKind = typeof ChainKind.Eth | typeof ChainKind.Base | typeof ChainKind.Arb

/**
 * Gas limits for EVM transactions
 * @internal
 */
const GAS_LIMIT = {
  DEPLOY_TOKEN: {
    [JSON.stringify(ChainKind.Eth)]: 500000,
    [JSON.stringify(ChainKind.Base)]: 500000,
    [JSON.stringify(ChainKind.Arb)]: 3000000, // Arbitrum typically needs higher gas limits
  },
  LOG_METADATA: {
    [JSON.stringify(ChainKind.Eth)]: 100000,
    [JSON.stringify(ChainKind.Base)]: 100000,
    [JSON.stringify(ChainKind.Arb)]: 600000,
  },
} as const

/**
 * Factory addresses for different chains
 */
const FACTORY_ADDRESSES: Record<string, string | undefined> = {
  [JSON.stringify(ChainKind.Eth)]: process.env.OMNI_FACTORY_ETH,
  [JSON.stringify(ChainKind.Base)]: process.env.OMNI_FACTORY_BASE,
  [JSON.stringify(ChainKind.Arb)]: process.env.OMNI_FACTORY_ARBITRUM,
}

/**
 * Helper to check if a chain is an EVM chain
 */
function isEVMChain(chain: ChainKind): chain is EVMChainKind {
  return "Eth" in chain || "Base" in chain || "Arb" in chain
}

/**
 * EVM blockchain implementation of the token deployer
 */
export class EVMDeployer {
  private factory: ethers.Contract
  private chainKind: EVMChainKind

  /**
   * Creates a new EVM token deployer instance
   * @param wallet - Ethereum signer instance for transaction signing
   * @param chain - The EVM chain to deploy to (Ethereum, Base, or Arbitrum)
   * @throws {Error} If factory address is not configured for the chain or if chain is not EVM
   */
  constructor(
    private wallet: ethers.Signer,
    chain: ChainKind,
  ) {
    if (!isEVMChain(chain)) {
      throw new Error(`Chain ${Object.keys(chain)[0]} is not an EVM chain`)
    }

    this.chainKind = chain
    const factoryAddress = FACTORY_ADDRESSES[JSON.stringify(chain)]

    if (!factoryAddress) {
      throw new Error(`Factory address not configured for chain ${Object.keys(chain)[0]}`)
    }

    this.factory = new ethers.Contract(factoryAddress, BRIDGE_TOKEN_FACTORY_ABI, this.wallet)
  }

  /**
   * Logs metadata for a token
   * @param tokenAddress - OmniAddress of the token
   * @returns Promise resolving to the transaction hash
   * @throws Will throw an error if logging fails or caller doesn't have admin role
   */
  async logMetadata(tokenAddress: OmniAddress): Promise<string> {
    const sourceChain = getChain(tokenAddress)

    // Validate source chain matches the deployer's chain
    if (JSON.stringify(sourceChain) !== JSON.stringify(this.chainKind)) {
      throw new Error(`Token address must be on ${Object.keys(this.chainKind)[0]}`)
    }

    // Extract token address from OmniAddress
    const [_, tokenAccountId] = tokenAddress.split(":")

    try {
      // Call logMetadata function on the contract
      const tx = await this.factory.logMetadata(tokenAccountId, {
        gasLimit: GAS_LIMIT.LOG_METADATA[JSON.stringify(this.chainKind)],
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
      gasLimit: GAS_LIMIT.DEPLOY_TOKEN[JSON.stringify(this.chainKind)],
    })

    const receipt = await tx.wait()
    const deployedAddress = receipt.events?.[0]?.args?.token || receipt.contractAddress

    return {
      txHash: tx.hash,
      tokenAddress: deployedAddress,
    }
  }
}