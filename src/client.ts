import { AnchorProvider as SolWallet } from "@coral-xyz/anchor"
import { PublicKey } from "@solana/web3.js"
import { Wallet as EthWallet } from "ethers"
import { Account as NearAccount } from "near-api-js"
import { EvmBridgeClient } from "./clients/evm"
import { NearBridgeClient } from "./clients/near"
import { SolanaBridgeClient } from "./clients/solana"
import { ChainKind, type OmniTransferMessage, type OmniTransferResult } from "./types"

export async function omniTransfer(
  wallet: EthWallet | NearAccount | SolWallet,
  transfer: OmniTransferMessage,
): Promise<OmniTransferResult> {
  if (wallet instanceof NearAccount) {
    const client = new NearBridgeClient(wallet)
    const { nonce, hash } = await client.initTransfer(transfer)
    return {
      txId: hash,
      nonce: BigInt(nonce),
    }
  }

  if (wallet instanceof EthWallet) {
    const client = new EvmBridgeClient(wallet, ChainKind.Eth)
    const { hash, nonce } = await client.initTransfer(transfer)
    return {
      txId: hash,
      nonce: BigInt(nonce),
    }
  }

  if (wallet instanceof SolWallet) {
    const client = new SolanaBridgeClient(
      wallet,
      new PublicKey("3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5"),
    ) // TODO: Get from config
    const { nonce, hash } = await client.initTransfer(transfer)
    return {
      txId: hash,
      nonce: BigInt(nonce),
    }
  }

  throw new Error("Unsupported wallet type")
}
