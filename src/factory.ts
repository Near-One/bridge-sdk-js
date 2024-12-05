import { EthereumDeployer } from "./chains/ethereum"
import { NearDeployer } from "./chains/near"
import { SolanaDeployer } from "./chains/solana"
import { Chain, type ChainDeployer } from "./types"

export function getDeployer(
  chain: Chain,
  // biome-ignore lint/suspicious/noExplicitAny: Wallet type varies by chain
  wallet: any,
  network: "testnet" | "mainnet",
): ChainDeployer {
  switch (chain) {
    case Chain.Near:
      return new NearDeployer(wallet, network)
    case Chain.Ethereum:
      return new EthereumDeployer(wallet, network)
    case Chain.Solana:
      return new SolanaDeployer(wallet, network)
    default:
      throw new Error(`No deployer implementation for chain: ${chain}`)
  }
}
