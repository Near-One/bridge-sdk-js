import type { Provider as SolWallet } from "@coral-xyz/anchor"
import type { WalletSelector } from "@near-wallet-selector/core"
import { Wallet as EthWallet } from "ethers"
import { Account as NearAccount } from "near-api-js"
import { EvmBridgeClient } from "./clients/evm"
import { NearBridgeClient } from "./clients/near"
import { NearWalletSelectorBridgeClient } from "./clients/near-wallet-selector"
import { SolanaBridgeClient } from "./clients/solana"
import { ChainKind, type InitTransferEvent, type OmniTransferMessage } from "./types"

type Client =
  | EvmBridgeClient
  | NearBridgeClient
  | NearWalletSelectorBridgeClient
  | SolanaBridgeClient

// Type guards
export function isSolWallet(wallet: SolWallet | WalletSelector): wallet is SolWallet {
  return (
    wallet && typeof wallet === "object" && "publicKey" in wallet && "sendTransaction" in wallet
  )
}

export function isWalletSelector(wallet: SolWallet | WalletSelector): wallet is WalletSelector {
  return (
    wallet &&
    typeof wallet === "object" &&
    "wallet" in wallet &&
    typeof wallet.wallet === "function"
  )
}

export async function omniTransfer(
  wallet: EthWallet | NearAccount | WalletSelector | SolWallet,
  transfer: OmniTransferMessage,
): Promise<string | InitTransferEvent> {
  let client: Client | null = null

  if (wallet instanceof EthWallet) {
    client = new EvmBridgeClient(wallet, ChainKind.Eth)
  } else if (wallet instanceof NearAccount) {
    client = new NearBridgeClient(wallet)
  } else if (isSolWallet(wallet)) {
    client = new SolanaBridgeClient(wallet)
  } else if (isWalletSelector(wallet)) {
    client = new NearWalletSelectorBridgeClient(wallet)
  }

  if (!client) {
    throw new Error("Unsupported wallet type")
  }

  return await client.initTransfer(transfer)
}
