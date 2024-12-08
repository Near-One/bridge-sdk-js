import type { Wallet } from "ethers"
import type { ChainDeployer, TokenDeployment } from "../types"

export class EthereumDeployer implements ChainDeployer {
  constructor(
    private wallet: Wallet,
    private network: "testnet" | "mainnet",
  ) {}

  async initDeployToken(
    tokenAddress: OmniAddress,
    destinationChain: Chain,
  ): Promise<TokenDeployment> {
    throw new Error("Not implemented")
  }

  async finDeployToken(deployment: TokenDeployment): Promise<TokenDeployment> {
    throw new Error("Not implemented")
  }

  async bindToken(deployment: TokenDeployment): Promise<TokenDeployment> {
    throw new Error("Not implemented")
  }
}
