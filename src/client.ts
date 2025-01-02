import { AnchorProvider as SolWallet } from "@coral-xyz/anchor"
import { PublicKey } from "@solana/web3.js"
import { Wallet as EthWallet } from "ethers"
import { Account as NearAccount } from "near-api-js"
import { EVMDeployer } from "./deployer/evm"
import { NearDeployer } from "./deployer/near"
import { SolanaDeployer } from "./deployer/solana"
import { ChainKind, type OmniTransferMessage, type OmniTransferResult } from "./types"

export async function omniTransfer(
  wallet: EthWallet | NearAccount | SolWallet,
  transfer: OmniTransferMessage,
): Promise<OmniTransferResult> {
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

  if (wallet instanceof EthWallet) {
    const deployer = new EVMDeployer(wallet, ChainKind.Eth)
    const { hash, nonce } = await deployer.initTransfer(
      transfer.tokenAddress,
      transfer.recipient,
      transfer.amount,
    )
    return {
      txId: hash,
      nonce: BigInt(nonce),
    }
  }

  if (wallet instanceof SolWallet) {
    const deployer = new SolanaDeployer(
      wallet,
      new PublicKey("3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5"),
    ) // TODO: Get from config
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

  throw new Error("Unsupported wallet type")
}
