import { AnchorProvider as SolWallet } from "@coral-xyz/anchor"
import { Wallet as EthWallet } from "ethers"
import { Account as NearAccount } from "near-api-js"
import { EvmBridgeClient } from "./clients/evm"
import { NearBridgeClient } from "./clients/near"
import { SolanaBridgeClient } from "./clients/solana"
import { ChainKind, type InitTransferEvent, type OmniTransferMessage } from "./types"

type Client = EvmBridgeClient | NearBridgeClient | SolanaBridgeClient

export async function omniTransfer(
  wallet: EthWallet | NearAccount | SolWallet,
  transfer: OmniTransferMessage,
): Promise<string | InitTransferEvent> {
  let client: Client | null = null
  if (wallet instanceof NearAccount) {
    client = new NearBridgeClient(wallet)
  } else if (wallet instanceof EthWallet) {
    client = new EvmBridgeClient(wallet, ChainKind.Eth)
  } else if (wallet instanceof SolWallet) {
    client = new SolanaBridgeClient(wallet)
  }

  if (!client) {
    throw new Error("Unsupported wallet type")
  }

  return await client.initTransfer(transfer)
}
