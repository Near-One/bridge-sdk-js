import type { Provider as SolWallet } from "@coral-xyz/anchor"
import { Account as NearAccount } from "@near-js/accounts"
import type { WalletSelector } from "@near-wallet-selector/core"
import { Wallet as EthWallet } from "ethers"
import { EvmBridgeClient } from "./clients/evm.js"
import { NearBridgeClient } from "./clients/near.js"
import { NearWalletSelectorBridgeClient } from "./clients/near-wallet-selector.js"
import { SolanaBridgeClient } from "./clients/solana.js"
import { addresses } from "./config.js"
import { ChainKind, type InitTransferEvent, type OmniTransferMessage } from "./types/index.js"
import {
  getMinimumTransferableAmount,
  getTokenDecimals,
  verifyTransferAmount,
} from "./utils/decimals.js"
import { getBridgedToken, getChain, isEvmChain } from "./utils/index.js"

type Client =
  | EvmBridgeClient
  | NearBridgeClient
  | NearWalletSelectorBridgeClient
  | SolanaBridgeClient

// Type guards
export function isSolWallet(wallet: SolWallet | WalletSelector): wallet is SolWallet {
  return Boolean(
    wallet && typeof wallet === "object" && "connection" in wallet && "publicKey" in wallet,
  )
}

export function isWalletSelector(wallet: SolWallet | WalletSelector): wallet is WalletSelector {
  return Boolean(
    wallet &&
      typeof wallet === "object" &&
      "wallet" in wallet &&
      typeof wallet.wallet === "function",
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
  const sourceTokenAddress = transfer.tokenAddress

  // Get chain information
  const sourceChain = getChain(sourceTokenAddress)
  const destChain = getChain(transfer.recipient)

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
  const contractId = addresses.near.contract // Use NEAR contract for decimal verification

  // Special handling for NEAR tokens:
  // Decimals are stored under foreign chain addresses, not under NEAR addresses

  // Case 1: NEAR → Foreign Chain
  // e.g., USDC on NEAR → ETH
  // We query the destination address (eth:0x...) to get both decimals:
  // - origin_decimals: the NEAR token's decimals
  // - decimals: the decimals on the destination chain
  if (sourceChain === ChainKind.Near) {
    const decimals = await getTokenDecimals(contractId, destTokenAddress)
    if (!decimals) {
      throw new Error(`Destination token ${destTokenAddress} is not registered properly`)
    }
    originDecimals = decimals.origin_decimals
    destinationDecimals = decimals.decimals
  }

  // Case 2: Foreign Chain → NEAR
  // e.g., USDC on ETH → NEAR
  // We query the source address (eth:0x...) to get both decimals:
  // - decimals: the foreign chain's decimals
  // - origin_decimals: what the token will have on NEAR
  if (destChain === ChainKind.Near) {
    const decimals = await getTokenDecimals(contractId, sourceTokenAddress)
    if (!decimals) {
      throw new Error(`Source token ${sourceTokenAddress} is not registered properly`)
    }
    destinationDecimals = decimals.origin_decimals
    originDecimals = decimals.decimals
  }

  // We're dealing with foreign chain → foreign chain transfer
  if (sourceChain !== ChainKind.Near && destChain !== ChainKind.Near) {
    const source = await getTokenDecimals(contractId, sourceTokenAddress)
    const dest = await getTokenDecimals(contractId, destTokenAddress)
    if (!source) {
      throw new Error(`Source token ${sourceTokenAddress} is not registered properly`)
    }
    if (!dest) {
      throw new Error(`Destination token ${destTokenAddress} is not registered properly`)
    }
    originDecimals = source.decimals
    destinationDecimals = dest.decimals
  }

  if (originDecimals === undefined || destinationDecimals === undefined) {
    throw new Error("Failed to get token decimals")
  }

  // Verify the amount is greater than the fee
  if (transfer.amount <= transfer.fee) {
    throw new Error(
      `Transfer amount (${transfer.amount}) must be greater than the fee (${transfer.fee})`,
    )
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
    if (!isEvmChain(sourceChain)) {
      throw new Error(
        `EVM wallet used with non-EVM source chain (${ChainKind[sourceChain]}). Token must be on an EVM chain.`,
      )
    }
    client = new EvmBridgeClient(wallet, sourceChain)
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
