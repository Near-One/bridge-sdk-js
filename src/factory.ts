import type { Provider } from "@coral-xyz/anchor"
import type { WalletSelector } from "@near-wallet-selector/core"
import type { ethers } from "ethers"
import { Account } from "near-api-js"
import { EvmBridgeClient } from "./clients/evm"
import { NearBridgeClient } from "./clients/near"
import { NearWalletSelectorBridgeClient } from "./clients/near-wallet-selector"
import { SolanaBridgeClient } from "./clients/solana"
import { ChainKind } from "./types"

// Define client types
type ClientTypes = {
  [ChainKind.Near]: NearBridgeClient | NearWalletSelectorBridgeClient
  [ChainKind.Eth]: EvmBridgeClient
  [ChainKind.Base]: EvmBridgeClient
  [ChainKind.Arb]: EvmBridgeClient
  [ChainKind.Sol]: SolanaBridgeClient
}

// Define wallet types for each chain
type WalletTypes = {
  [ChainKind.Near]: Account | WalletSelector
  [ChainKind.Eth]: ethers.Signer
  [ChainKind.Base]: ethers.Signer
  [ChainKind.Arb]: ethers.Signer
  [ChainKind.Sol]: Provider
}

/**
 * Creates a chain-specific bridge client instance based on the provided chain and wallet.
 *
 * @template T - The chain kind (must be one of {@link ChainKind})
 * @param chain - The blockchain network to create a client for
 * @param wallet - Chain-specific wallet instance for signing transactions
 * @returns A strongly-typed client instance for the specified chain
 * @throws {Error} If no client implementation exists for the chain
 *
 * @example NEAR with Account
 * ```typescript
 * import { connect } from 'near-api-js';
 *
 * const nearAccount = await connect(config);
 * const client = getClient(ChainKind.Near, nearAccount);
 * // Type: NearBridgeClient
 * const txHash = await client.initDeployToken("near:token.near");
 * ```
 *
 * @example NEAR with Wallet Selector
 * ```typescript
 * import { setupWalletSelector } from '@near-wallet-selector/core';
 *
 * const selector = await setupWalletSelector({ ... });
 * const client = getClient(ChainKind.Near, selector);
 * // Type: NearWalletSelectorBridgeClient
 * const txHash = await client.initDeployToken("near:token.near");
 * ```
 *
 * @example Ethereum
 * ```typescript
 * import { ethers } from 'ethers';
 *
 * const provider = new ethers.providers.Web3Provider(window.ethereum);
 * const signer = provider.getSigner();
 * const client = getClient(ChainKind.Eth, signer);
 * // Type: EvmBridgeClient
 * const tx = await client.deposit({ to: "0x...", amount: "1.0" });
 * ```
 *
 * @example Solana
 * ```typescript
 * import { Connection, Keypair } from '@solana/web3.js';
 *
 * const connection = new Connection('https://api.mainnet-beta.solana.com');
 * const client = getClient(ChainKind.Sol, connection);
 * // Type: SolanaBridgeClient
 * const signature = await client.transfer({ ... });
 * ```
 *
 * @example Base/Arbitrum (EVM-compatible chains)
 * ```typescript
 * const baseClient = getClient(ChainKind.Base, signer);
 * const arbClient = getClient(ChainKind.Arb, signer);
 * // Both Type: EvmBridgeClient but configured for different chains
 * ```
 */

// Function overloads for each chain type
export function getClient(chain: ChainKind.Near, wallet: Account): NearBridgeClient
export function getClient(
  chain: ChainKind.Near,
  wallet: WalletSelector,
): NearWalletSelectorBridgeClient
export function getClient(chain: ChainKind.Eth, wallet: ethers.Signer): EvmBridgeClient
export function getClient(chain: ChainKind.Base, wallet: ethers.Signer): EvmBridgeClient
export function getClient(chain: ChainKind.Arb, wallet: ethers.Signer): EvmBridgeClient
export function getClient(chain: ChainKind.Sol, wallet: Provider): SolanaBridgeClient

// Generic implementation
export function getClient<T extends ChainKind>(chain: T, wallet: WalletTypes[T]): ClientTypes[T] {
  switch (chain) {
    case ChainKind.Near:
      if (wallet instanceof Account) {
        return new NearBridgeClient(wallet) as ClientTypes[T]
      }
      return new NearWalletSelectorBridgeClient(wallet as WalletSelector) as ClientTypes[T]
    case ChainKind.Eth:
    case ChainKind.Base:
    case ChainKind.Arb:
      return new EvmBridgeClient(wallet as ethers.Signer, chain) as ClientTypes[T]
    case ChainKind.Sol:
      return new SolanaBridgeClient(wallet as Provider) as ClientTypes[T]
    default:
      throw new Error(`No client implementation for chain: ${chain}`)
  }
}
