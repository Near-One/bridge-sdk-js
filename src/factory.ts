import type { ethers } from "ethers"
import type { Account } from "near-api-js"
import { EthereumDeployer } from "./chains/ethereum"
import { NearDeployer } from "./chains/near"
import { ChainKind } from "./types"

/**
 * Creates a chain-specific deployer instance
 * @param chain - The blockchain network to create a deployer for
 * @param wallet - Chain-specific wallet instance for signing transactions
 * @returns A deployer instance for the specified chain
 * @throws {Error} If no deployer implementation exists for the chain
 *
 * @example
 * ```typescript
 * const nearAccount = await connect(config);
 * const deployer = getDeployer(ChainKind.Near, nearAccount);
 * const txHash = await deployer.initDeployToken("near:token.near");
 * ```
 */
export function getDeployer<TWallet>(chain: ChainKind, wallet: TWallet) {
  switch (chain) {
    case ChainKind.Near:
      return new NearDeployer(wallet as Account)
    case ChainKind.Eth:
      return new EthereumDeployer(wallet as ethers.Signer)
    default:
      throw new Error(`No deployer implementation for chain: ${chain}`)
  }
}
