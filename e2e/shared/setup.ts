// biome-ignore lint/style/noRestrictedImports: e2e tests run in Node.js, not browsers
import os from "node:os"
// biome-ignore lint/style/noRestrictedImports: e2e tests run in Node.js, not browsers
import path from "node:path"
import { AnchorProvider, setProvider, Wallet } from "@coral-xyz/anchor"
import { Connection, Keypair } from "@solana/web3.js"
import { ethers } from "ethers"
import { Near } from "near-kit"

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
      rpcUrl: "https://test.rpc.fastnear.com",
      credentialsPath: path.join(os.homedir(), ".near-credentials"),
    },
    ethereum: {
      rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
      chainId: 11155111, // Sepolia
      ...(process.env.ETH_PRIVATE_KEY && {
        privateKey: process.env.ETH_PRIVATE_KEY,
      }),
    },
    solana: {
      rpcUrl: "https://api.devnet.solana.com",
      commitment: "confirmed" as const,
      ...(process.env.SOL_PRIVATE_KEY && {
        privateKey: process.env.SOL_PRIVATE_KEY,
      }),
    },
  },
}

export async function createNearKitInstance(): Promise<Near> {
  const { near } = TEST_CONFIG.networks

  // Use environment variable in CI, fallback to keystore file locally
  const privateKey = process.env.NEAR_PRIVATE_KEY

  if (privateKey) {
    // CI environment - use private key from environment
    return new Near({
      network: near.networkId,
      privateKey: privateKey as `ed25519:${string}`,
      defaultSignerId: near.accountId,
      rpcUrl: near.rpcUrl,
    })
  }

  // Local development - use FileKeyStore
  const { FileKeyStore } = await import("near-kit/keys/file")
  return new Near({
    network: near.networkId,
    keyStore: new FileKeyStore(near.credentialsPath, near.networkId),
    defaultSignerId: near.accountId,
    rpcUrl: near.rpcUrl,
  })
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
  nearKitInstance: Near
  ethWallet: ethers.Wallet
  solanaProvider: AnchorProvider
}

export async function setupTestAccounts(): Promise<TestAccountsSetup> {
  return {
    nearKitInstance: await createNearKitInstance(),
    ethWallet: await createEthereumWallet(),
    solanaProvider: await createSolanaProvider(),
  }
}
