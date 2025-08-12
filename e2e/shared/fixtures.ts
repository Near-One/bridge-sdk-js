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
}

// Test addresses for NEAR to ETH transfers
export const TEST_ADDRESSES: TestAddresses = {
  near: {
    testAccount: "omni-sdk-test.testnet",
    recipient: "test-recipient.testnet",
  },
  ethereum: {
    testAccount: "0xA7C29dA7599817edA0f829E7B8d0FFE23D81c4d3", // Your Sepolia address
    recipient: "0x000000F8637F1731D906643027c789EFA60BfE11", // Test recipient
  },
}

// Test tokens for NEAR to ETH transfers
export const TEST_TOKENS = {
  // NEAR native token
  NEAR: {
    address: omniAddress(ChainKind.Near, "wrap.testnet"),
    decimals: 24,
    symbol: "wNEAR",
    testAmount: "1000000",
  } satisfies TestTokenConfig,
}

// NEAR to ETH transfer configuration
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

// Timeout configurations for NEAR to ETH transfers
export const TIMEOUTS = {
  NETWORK_REQUEST: 30000, // 30 seconds
  TRANSFER_INITIATION: 60000, // 1 minute
  PROOF_GENERATION: 120000, // 2 minutes
  TRANSFER_FINALIZATION: 180000, // 3 minutes
  FULL_E2E_FLOW: 300000, // 5 minutes
}
