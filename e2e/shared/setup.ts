import os from "node:os"
import path from "node:path"
import { AnchorProvider, Wallet, setProvider } from "@coral-xyz/anchor"
import { Account } from "@near-js/accounts"
import { getSignerFromKeystore } from "@near-js/client"
import { UnencryptedFileSystemKeyStore } from "@near-js/keystores-node"
import { JsonRpcProvider } from "@near-js/providers"
import { Connection, Keypair } from "@solana/web3.js"
import { ethers } from "ethers"

export interface TestConfig {
  timeout: number
  networks: {
    near: {
      accountId: string
      networkId: "testnet" | "mainnet"
      contractId: string
      rpcUrl: string
      credentialsPath: string
    }
    ethereum: {
      rpcUrl: string
      chainId: number
      privateKey?: string
    }
    solana: {
      rpcUrl: string
      commitment: "confirmed" | "finalized"
      privateKey?: string
    }
  }
}

export const TEST_CONFIG: TestConfig = {
  timeout: 30000, // 30 second timeout for network operations
  networks: {
    near: {
      accountId: "omni-sdk-test.testnet",
      networkId: "testnet",
      contractId: "v1.signer-prod.testnet",
      rpcUrl: "https://rpc.testnet.near.org",
      credentialsPath: path.join(os.homedir(), ".near-credentials"),
    },
    ethereum: {
      rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
      chainId: 11155111, // Sepolia
      privateKey: process.env.ETH_PRIVATE_KEY,
    },
    solana: {
      rpcUrl: "https://api.devnet.solana.com",
      commitment: "confirmed",
      privateKey: process.env.SOL_PRIVATE_KEY,
    },
  },
}

export async function createNearAccount(): Promise<Account> {
  const { near } = TEST_CONFIG.networks

  // Use environment variable in CI, fallback to keystore file locally
  const privateKey = process.env.NEAR_PRIVATE_KEY
  if (privateKey) {
    // CI environment - use private key from environment
    const { InMemoryKeyStore } = await import("@near-js/keystores")
    const { KeyPair } = await import("@near-js/crypto")
    const keyStore = new InMemoryKeyStore()
    // biome-ignore lint/suspicious/noExplicitAny: NEAR KeyPair typing issue
    const keyPair = KeyPair.fromString(privateKey as any)
    await keyStore.setKey(near.networkId, near.accountId, keyPair)
    const signer = await getSignerFromKeystore(near.accountId, near.networkId, keyStore)
    const provider = new JsonRpcProvider({ url: near.rpcUrl })
    return new Account(near.accountId, provider, signer)
  }

  // Local development - use keystore file
  const keyStore = new UnencryptedFileSystemKeyStore(near.credentialsPath)
  const signer = await getSignerFromKeystore(near.accountId, near.networkId, keyStore)
  const provider = new JsonRpcProvider({ url: near.rpcUrl })
  return new Account(near.accountId, provider, signer)
}

export async function createEthereumWallet(): Promise<ethers.Wallet> {
  const { ethereum } = TEST_CONFIG.networks

  if (!ethereum.privateKey) {
    throw new Error("ETH_PRIVATE_KEY environment variable required for Ethereum tests")
  }

  const provider = new ethers.JsonRpcProvider(ethereum.rpcUrl)
  return new ethers.Wallet(ethereum.privateKey, provider)
}

export async function createSolanaProvider(): Promise<AnchorProvider> {
  const { solana } = TEST_CONFIG.networks

  if (!solana.privateKey) {
    throw new Error("SOL_PRIVATE_KEY environment variable required for Solana tests")
  }

  // Convert private key from base58 string to Keypair
  const privateKeyBytes = Uint8Array.from(Buffer.from(solana.privateKey, "base64"))
  const keypair = Keypair.fromSecretKey(privateKeyBytes)

  const connection = new Connection(solana.rpcUrl, solana.commitment)
  const wallet = new Wallet(keypair)

  const provider = new AnchorProvider(connection, wallet, {
    commitment: solana.commitment,
  })

  setProvider(provider)
  return provider
}

export interface TestAccountsSetup {
  nearAccount: Account
  ethWallet: ethers.Wallet
  solanaProvider: AnchorProvider
}

export async function setupTestAccounts(): Promise<TestAccountsSetup> {
  return {
    nearAccount: await createNearAccount(),
    ethWallet: await createEthereumWallet(),
    solanaProvider: await createSolanaProvider(),
  }
}
