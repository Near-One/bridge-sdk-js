import type { Provider as SolWallet } from "@coral-xyz/anchor"
import type { WalletSelector } from "@near-wallet-selector/core"
import { Wallet as EthWallet } from "ethers"
import { Account as NearAccount } from "near-api-js"
import { EvmBridgeClient } from "./clients/evm"
import { NearBridgeClient } from "./clients/near"
import { NearWalletSelectorBridgeClient } from "./clients/near-wallet-selector"
import { SolanaBridgeClient } from "./clients/solana"
import { addresses } from "./config"
import { ChainKind, type InitTransferEvent, type OmniTransferMessage } from "./types"
import { getChain } from "./utils"
import {
  getMinimumTransferableAmount,
  getTokenDecimals,
  verifyTransferAmount,
} from "./utils/decimals"

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

/**
 * Validates and executes a cross-chain token transfer
 * @param wallet The wallet to use for the transfer
 * @param transfer The transfer details
 * @returns Promise resolving to transaction hash or InitTransferEvent
 * @throws If the transfer amount would be invalid after decimal normalization
 */
export async function omniTransfer(
  wallet: EthWallet | NearAccount | WalletSelector | SolWallet,
  transfer: OmniTransferMessage,
): Promise<string | InitTransferEvent> {
  // Get chain information
  const sourceChain = getChain(transfer.tokenAddress)
  const destinationChain = getChain(transfer.recipient)

  // Get token decimals
  const contractId = addresses.near // Use NEAR contract for decimal verification
  const sourceDecimals = await getTokenDecimals(contractId, transfer.tokenAddress)
  const destinationDecimals = await getTokenDecimals(contractId, transfer.recipient)

  // Verify transfer amount will be valid after normalization
  const isValid = verifyTransferAmount(
    transfer.amount,
    transfer.fee,
    sourceDecimals.decimals,
    destinationDecimals.decimals,
  )

  if (!isValid) {
    // Get minimum amount
    const minAmount = getMinimumAmount(sourceChain, destinationChain)
    throw new Error(
      `Transfer amount too small - would result in 0 after decimal normalization. Minimum transferable amount is ${minAmount}`,
    )
  }

  // Initialize appropriate client
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

/**
 * Helper to get minimum transferable amount between chains
 */
function getMinimumAmount(sourceChain: ChainKind, destinationChain: ChainKind): string {
  let sourceDecimals = 18 // Default EVM decimals
  let destDecimals = 18

  switch (sourceChain) {
    case ChainKind.Near:
      sourceDecimals = 24
      break
    case ChainKind.Sol:
      sourceDecimals = 9
      break
  }

  switch (destinationChain) {
    case ChainKind.Near:
      destDecimals = 24
      break
    case ChainKind.Sol:
      destDecimals = 9
      break
  }

  const minAmount = getMinimumTransferableAmount(sourceDecimals, destDecimals)
  return minAmount.toString()
}
