import type { ChainDeployer, TokenDeployment } from "../types"

export class SolanaDeployer implements ChainDeployer {
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
