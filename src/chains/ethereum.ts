import { ethers } from "ethers"
import { type ChainDeployer, ChainKind, type OmniAddress } from "../types"
import { getChain } from "../utils"

// Contract ABI for the bridge token factory
const BRIDGE_TOKEN_FACTORY_ABI = [
  "function deployToken(bytes signatureData, tuple(string token, string name, string symbol, uint8 decimals) metadata) external returns (address)",
  "function finTransfer(bytes signature, tuple(uint64 destinationNonce, uint8 originChain, uint64 originNonce, address tokenAddress, uint128 amount, address recipient, string feeRecipient) transferPayload) external",
  "function initTransfer(address tokenAddress, uint128 amount, uint128 fee, uint128 nativeFee, string recipient, string message) external",
  "function nearToEthToken(string nearTokenId) external view returns (address)",
] as const

const ERC20_ABI = [
  "function allowance(address owner, address spender) public view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
] as const

/**
 * Gas limits for Ethereum transactions
 * @internal
 */
const GAS_LIMIT = {
  DEPLOY_TOKEN: 500000,
  APPROVE: 60000,
  TRANSFER: 200000,
} as const

/**
 * Ethereum blockchain implementation of the token deployer
 * @implements {ChainDeployer<ethers.Signer>}
 */
export class EthereumDeployer implements ChainDeployer<ethers.Signer> {
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

  async initDeployToken(tokenAddress: OmniAddress): Promise<string> {
    // Validate source chain is Ethereum
    if (getChain(tokenAddress) !== ChainKind.Eth) {
      throw new Error("Token address must be on Ethereum")
    }

    // Extract token address from OmniAddress
    const [_, tokenAccountId] = tokenAddress.split(":")

    // Get token contract to fetch metadata
    const tokenContract = new ethers.Contract(
      tokenAccountId,
      [
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
      ],
      this.wallet,
    )

    const [name, symbol, decimals] = await Promise.all([
      tokenContract.name(),
      tokenContract.symbol(),
      tokenContract.decimals(),
    ])

    // Call deployToken with metadata
    const tx = await this.factory.deployToken(
      "0x", // signatureData - empty for init
      {
        token: tokenAccountId,
        name,
        symbol,
        decimals,
      },
      { gasLimit: GAS_LIMIT.DEPLOY_TOKEN },
    )

    return tx.hash
  }

  async finDeployToken(_destinationChain: ChainKind, vaa: string): Promise<string> {
    const tx = await this.factory.deployToken(
      vaa, // Signed VAA from the source chain
      {
        token: "", // These will be extracted from the VAA
        name: "",
        symbol: "",
        decimals: 0,
      },
      { gasLimit: GAS_LIMIT.DEPLOY_TOKEN },
    )

    return tx.hash
  }

  async bindToken(_destinationChain: ChainKind, _vaa: string): Promise<string> {
    // For Ethereum, binding typically happens in the deployToken call
    // This is included for interface compatibility
    throw new Error("Token binding not required for Ethereum")
  }

  /**
   * Helper to check and set token approvals
   * @internal
   */
  private async ensureApproval(tokenAddress: string, amount: bigint): Promise<void> {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.wallet)

    const address = await this.wallet.getAddress()
    const allowance = await token.allowance(address, this.factoryAddress)

    if (allowance < amount) {
      const tx = await token.approve(this.factoryAddress, amount, { gasLimit: GAS_LIMIT.APPROVE })
      await tx.wait()
    }
  }
}
