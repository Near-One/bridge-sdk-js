import { ChainKind, type OmniAddress } from "../../src/types/index.js"
import { omniAddress } from "../../src/utils/index.js"

export interface TestTokenConfig {
  address: OmniAddress
  decimals: number
  symbol: string
  testAmount: string // Human-readable amount (e.g., "1.0")
}

export interface TestAddresses {
  near: {
    testAccount: string
    recipient: string
  }
  ethereum: {
    testAccount: string
    recipient: string
  }
  solana: {
    testAccount: string
    recipient: string
  }
}

// Test addresses for cross-chain transfers
export const TEST_ADDRESSES: TestAddresses = {
  near: {
    testAccount: "omni-sdk-test.testnet",
    recipient: "test-recipient.testnet",
  },
  ethereum: {
    testAccount: "0xA7C29dA7599817edA0f829E7B8d0FFE23D81c4d3", // Your Sepolia address
    recipient: "0x000000F8637F1731D906643027c789EFA60BfE11", // Test recipient
  },
  solana: {
    testAccount: "2sUFgertVaZHxzyMM5z5DajkyU1TnPCMr1yDnTiEsVit", // Your SOL wallet address
    recipient: "2sUFgertVaZHxzyMM5z5DajkyU1TnPCMr1yDnTiEsVit", // Same as test account for self-transfer
  },
}

// Test tokens for bidirectional transfers
export const TEST_TOKENS = {
  // NEAR native token (for NEAR → ETH)
  NEAR: {
    address: omniAddress(ChainKind.Near, "wrap.testnet"),
    decimals: 24,
    symbol: "wNEAR",
    testAmount: "1000000",
  } satisfies TestTokenConfig,

  // NEAR token on Ethereum (for ETH → NEAR)
  NEAR_ON_ETH: {
    address: omniAddress(ChainKind.Eth, "0x1f89e263159f541182f875ac05d773657d24eb92"),
    decimals: 24,
    symbol: "NEAR",
    testAmount: "10",
  } satisfies TestTokenConfig,

  // NEAR token for NEAR → SOL transfers
  NEAR_TO_SOL: {
    address: omniAddress(ChainKind.Near, "wrap.testnet"),
    decimals: 24,
    symbol: "wNEAR",
    testAmount: "1000000000000000000",
  } satisfies TestTokenConfig,

  // wNEAR token on Solana (for SOL → NEAR)
  WNEAR_ON_SOL: {
    address: omniAddress(ChainKind.Sol, "3wQct2e43J1Z99h2RWrhPAhf6E32ZpuzEt6tgwfEAKAy"),
    decimals: 24,
    symbol: "wNEAR",
    testAmount: "10", // 1 wNEAR in smallest units
  } satisfies TestTokenConfig,
}

// Transfer route configuration
export interface TransferRoute {
  name: string
  token: TestTokenConfig
  sender: string
  recipient: string
}

export const NEAR_TO_ETH_ROUTES: TransferRoute[] = [
  {
    name: "NEAR → ETH (wNEAR)",
    token: TEST_TOKENS.NEAR,
    sender: TEST_ADDRESSES.near.testAccount,
    recipient: TEST_ADDRESSES.ethereum.testAccount,
  },
]

export const ETH_TO_NEAR_ROUTES: TransferRoute[] = [
  {
    name: "ETH → NEAR (NEAR token)",
    token: TEST_TOKENS.NEAR_ON_ETH,
    sender: TEST_ADDRESSES.ethereum.testAccount,
    recipient: TEST_ADDRESSES.near.testAccount,
  },
]

export const NEAR_TO_SOL_ROUTES: TransferRoute[] = [
  {
    name: "NEAR → SOL (wNEAR)",
    token: TEST_TOKENS.NEAR_TO_SOL,
    sender: TEST_ADDRESSES.near.testAccount,
    recipient: TEST_ADDRESSES.solana.testAccount,
  },
]

export const SOL_TO_NEAR_ROUTES: TransferRoute[] = [
  {
    name: "SOL → NEAR (wNEAR)",
    token: TEST_TOKENS.WNEAR_ON_SOL,
    sender: TEST_ADDRESSES.solana.testAccount,
    recipient: TEST_ADDRESSES.near.testAccount,
  },
]

// Timeout configurations for NEAR to ETH transfers
export const TIMEOUTS = {
  NETWORK_REQUEST: 30000, // 30 seconds
  TRANSFER_INITIATION: 60000, // 1 minute
  PROOF_GENERATION: 120000, // 2 minutes
  TRANSFER_FINALIZATION: 180000, // 3 minutes
  FULL_E2E_FLOW: 300000, // 5 minutes
}
