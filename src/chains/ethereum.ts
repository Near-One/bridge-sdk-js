import { Contract, type Wallet } from "ethers"
import { Chain, type ChainDeployer, type OmniAddress, type TokenDeployment } from "../types"
import { getChain } from "../utils"

const FACTORY_ABI = [
  "function logMetadata(address tokenAddress) external",
  "function deployToken(bytes signatureData, tuple(string token, string name, string symbol, uint8 decimals) metadata) payable external returns (address)",
  "event LogMetadata(address tokenAddress, string name, string symbol, uint8 decimals)",
  "event DeployToken(address bridgeTokenProxy, string token, string name, string symbol, uint8 decimals)",
]

interface MetadataPayload {
  token: string
  name: string
  symbol: string
  decimals: number
}

export class EthereumDeployer implements ChainDeployer {
  private factory: Contract

  constructor(
    private wallet: Wallet,
    private network: "testnet" | "mainnet",
    factoryAddress = process.env.OMNI_FACTORY_ETHEREUM,
  ) {
    if (!factoryAddress) {
      throw new Error("OMNI_FACTORY_ETHEREUM address not configured")
    }
    this.factory = new Contract(factoryAddress, FACTORY_ABI, wallet)
  }

  async initDeployToken(
    tokenAddress: OmniAddress,
    destinationChain: Chain,
  ): Promise<TokenDeployment> {
    // Validate source chain is Ethereum
    if (getChain(tokenAddress) !== Chain.Ethereum) {
      throw new Error("Token address must be on Ethereum chain")
    }

    // Extract token contract address from OmniAddress
    const [_, tokenContractAddress] = tokenAddress.split(":")

    try {
      // Call logMetadata
      const tx = await this.factory.logMetadata(tokenContractAddress)
      const receipt = await tx.wait()

      // Find LogMetadata event
      const event = receipt.events?.find((e: { event: string }) => e.event === "LogMetadata")
      if (!event) {
        throw new Error("LogMetadata event not found in transaction receipt")
      }

      return {
        id: tx.hash,
        tokenAddress,
        sourceChain: Chain.Ethereum,
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
      // Extract proof components
      const { signatureData, metadata } = JSON.parse(deployment.proof) as {
        signatureData: string
        metadata: MetadataPayload
      }

      // Call deployToken
      const tx = await this.factory.deployToken(
        signatureData,
        metadata,
        { gasLimit: 2000000 }, // You might want to estimate this
      )
      const receipt = await tx.wait()

      // Find DeployToken event
      const event = receipt.events?.find((e: { event: string }) => e.event === "DeployToken")
      if (!event) {
        throw new Error("DeployToken event not found in transaction receipt")
      }

      return {
        ...deployment,
        status: "finalized",
        deploymentTx: tx.hash,
      }
    } catch (error) {
      throw new Error(`Failed to finalize token deployment: ${error}`)
    }
  }

  async bindToken(deployment: TokenDeployment): Promise<TokenDeployment> {
    // For Ethereum, there's no bind step - token is immediately usable
    // after deployment. We'll just validate and return.

    if (deployment.status !== "ready_for_bind") {
      throw new Error(`Invalid deployment status: ${deployment.status}`)
    }

    return {
      ...deployment,
      status: "completed",
    }
  }
}
