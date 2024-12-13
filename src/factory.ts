import { NearDeployer } from "./chains/near"
import type { ChainDeployer } from "./types"
import { ChainKind } from "./types"

export function getDeployer(
  chain: ChainKind,
  // biome-ignore lint/suspicious/noExplicitAny: Wallet type varies by chain
  wallet: any,
): ChainDeployer {
  switch (chain) {
    case ChainKind.Near:
      return new NearDeployer(wallet)
    default:
      throw new Error(`No deployer implementation for chain: ${chain}`)
  }
}
