import type { Signer as SolWallet } from "@solana/web3.js"
import { Wallet as EthWallet } from "ethers"
import { Account as NearAccount } from "near-api-js"
import type { ChainKind, Fee, OmniAddress, OmniTransfer, Status, TransferMessage } from "./types"

export class OmniClient {
  private wallet: EthWallet | NearAccount | SolWallet

  constructor(wallet: EthWallet | NearAccount | SolWallet) {
    this.wallet = wallet
  }

  async omniTransfer(transferMessage: TransferMessage): Promise<OmniTransfer> {
    if (this.wallet instanceof EthWallet) {
      // TODO: Transfer ETH
      // Not implemented yet, return a placeholder
      return {
        txId: "0x123",
        nonce: BigInt(1),
        transferMessage,
      }
    }
    if (this.wallet instanceof NearAccount) {
      // TODO: Transfer NEAR
      // Not implemented yet, return a placeholder
      return {
        txId: "near_tx_hash",
        nonce: BigInt(1),
        transferMessage,
      }
    }

    // Handle other wallet types...
    throw new Error("Unsupported wallet type")
  }

  // biome-ignore lint/correctness/noUnusedVariables: This is a placeholder
  async findOmniTransfers(sender: OmniAddress): Promise<OmniTransfer[]> {
    // Query transfers from API
    // This would need to be implemented based on how transfers are stored
    throw new Error("Not implemented")
  }

  // biome-ignore lint/correctness/noUnusedVariables: This is a placeholder
  async getFee(sender: OmniAddress, recipient: OmniAddress): Promise<Fee> {
    // Query fee from API
    // This would need to be implemented based on how fees are determined
    throw new Error("Not implemented")
  }

  // biome-ignore lint/correctness/noUnusedVariables: This is a placeholder
  async getTransferStatus(originChain: ChainKind, nonce: bigint): Promise<Status> {
    // Query transfer status from API
    // This would need to be implemented based on how transfers are stored
    throw new Error("Not implemented")
  }
}
