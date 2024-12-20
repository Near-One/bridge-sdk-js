import type { Signer as SolWallet } from "@solana/web3.js"
import { Wallet as EthWallet } from "ethers"
import { Account as NearAccount } from "near-api-js"
import { NearDeployer } from "./deployer/near"
import type { OmniTransferMessage, OmniTransferResult } from "./types"

export async function omniTransfer(
  wallet: EthWallet | NearAccount | SolWallet,
  transfer: OmniTransferMessage,
): Promise<OmniTransferResult> {
  if (wallet instanceof EthWallet) {
    throw new Error("Ethereum wallet not supported")
  }

  if (wallet instanceof NearAccount) {
    const deployer = new NearDeployer(wallet, "omni-locker.testnet") // TODO: Get from config
    const { nonce, hash } = await deployer.initTransfer(
      transfer.tokenAddress,
      transfer.recipient,
      transfer.amount,
    )
    return {
      txId: hash,
      nonce: BigInt(nonce),
    }
  }

  if ("publicKey" in wallet) {
    // Solana wallet check
    // Solana transfer implementation
    throw new Error("Solana wallet not supported")
  }

  throw new Error("Unsupported wallet type")
}
