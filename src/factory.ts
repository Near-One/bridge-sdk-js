import type { AnchorProvider } from "@coral-xyz/anchor"
import type { ethers } from "ethers"
import type { Account } from "near-api-js"
import { EvmBridgeClient } from "./clients/evm"
import { NearBridgeClient } from "./clients/near"
import { SolanaBridgeClient } from "./clients/solana"
import { ChainKind } from "./types"

/**
 * Creates a chain-specific bridge client instance
 * @param chain - The blockchain network to create a client for
 * @param wallet - Chain-specific wallet instance for signing transactions
 * @returns A client instance for the specified chain
 * @throws {Error} If no client implementation exists for the chain
 *
 * @example
 * ```typescript
 * const nearAccount = await connect(config);
 * const client = getClient(ChainKind.Near, nearAccount);
 * const txHash = await client.initDeployToken("near:token.near");
 * ```
 */
export function getClient<TWallet>(chain: ChainKind, wallet: TWallet) {
  switch (chain) {
    case ChainKind.Near:
      return new NearBridgeClient(wallet as Account)
    case ChainKind.Eth:
    case ChainKind.Base:
    case ChainKind.Arb:
      return new EvmBridgeClient(wallet as ethers.Signer, chain)
    case ChainKind.Sol:
      return new SolanaBridgeClient(wallet as AnchorProvider)
    default:
      throw new Error(`No client implementation for chain: ${chain}`)
  }
}
