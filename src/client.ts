import type { Provider as SolWallet } from "@coral-xyz/anchor"
import { Account as NearAccount } from "@near-js/accounts"
import type { WalletSelector } from "@near-wallet-selector/core"
import { Wallet as EthWallet } from "ethers"
import { EvmBridgeClient } from "./clients/evm.js"
import { NearWalletSelectorBridgeClient } from "./clients/near-wallet-selector.js"
import { NearBridgeClient } from "./clients/near.js"
import { SolanaBridgeClient } from "./clients/solana.js"
import { addresses } from "./config.js"
import { ChainKind, type InitTransferEvent, type OmniTransferMessage } from "./types/index.js"
import {
  getMinimumTransferableAmount,
  getTokenDecimals,
  verifyTransferAmount,
} from "./utils/decimals.js"
import { getBridgedToken, getChain } from "./utils/index.js"

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
  const destChain = getChain(transfer.recipient)

  const sourceTokenAddress = transfer.tokenAddress
  const destTokenAddress = await getBridgedToken(transfer.tokenAddress, destChain)

  // Check if destination token address is null
  if (!destTokenAddress) {
    throw new Error(
      `Token ${transfer.tokenAddress} is not registered on the destination chain. Please deploy the token first.`,
    )
  }

  let originDecimals: number | undefined
  let destinationDecimals: number | undefined

  // Get token decimals
  const contractId = addresses.near // Use NEAR contract for decimal verification

  // If the origin chain is NEAR, just get the token decimals for the destination address
  // e.g., USDC on NEAR → ETH, get the decimals for `eth:0x...`
  if (getChain(sourceTokenAddress) === ChainKind.Near) {
    const decimals = await getTokenDecimals(contractId, destTokenAddress)
    originDecimals = decimals.origin_decimals
    destinationDecimals = decimals.decimals
  }

  // If the destination chain is NEAR, we need to get the decimals from the source token address
  // e.g., USDC on ETH → NEAR, get the decimals for `eth:0x...`
  if (getChain(destTokenAddress) === ChainKind.Near) {
    const decimals = await getTokenDecimals(contractId, sourceTokenAddress)
    destinationDecimals = decimals.origin_decimals
    originDecimals = decimals.decimals
  }

  if (originDecimals === undefined || destinationDecimals === undefined) {
    throw new Error("Failed to get token decimals")
  }

  // Verify transfer amount will be valid after normalization
  const isValid = verifyTransferAmount(
    transfer.amount,
    transfer.fee,
    originDecimals,
    destinationDecimals,
  )

  if (!isValid) {
    // Get minimum amount
    const minAmount = getMinimumTransferableAmount(originDecimals, destinationDecimals)
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
