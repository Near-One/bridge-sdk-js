/**
 * Network configuration and contract addresses
 */

import type { Network } from "./types.js"

export interface EvmAddresses {
  bridge: string
}

export interface NearAddresses {
  contract: string
  rpcUrls: string[]
}

export interface SolanaAddresses {
  locker: string
  wormhole: string
  shimProgram: string
  eventAuthority: string
}

export interface BtcAddresses {
  network: Network
  apiUrl: string
  mempoolUrl: string
  rpcUrl: string
  btcConnector: string
  btcToken: string
  bitcoinRelayer: string
}

export interface ZcashAddresses {
  network: Network
  apiUrl: string
  rpcUrl: string
  zcashConnector: string
  zcashToken: string
}

export interface ChainAddresses {
  eth: EvmAddresses
  arb: EvmAddresses
  base: EvmAddresses
  bnb: EvmAddresses
  pol: EvmAddresses
  near: NearAddresses
  sol: SolanaAddresses
  btc: BtcAddresses
  zcash: ZcashAddresses
}

const MAINNET_ADDRESSES: ChainAddresses = {
  eth: { bridge: "0xe00c629afaccb0510995a2b95560e446a24c85b9" },
  arb: { bridge: "0xd025b38762B4A4E36F0Cde483b86CB13ea00D989" },
  base: { bridge: "0xd025b38762B4A4E36F0Cde483b86CB13ea00D989" },
  bnb: { bridge: "0x073C8a225c8Cf9d3f9157F5C1a1DbE02407f5720" },
  pol: { bridge: "0xd025b38762B4A4E36F0Cde483b86CB13ea00D989" },
  near: {
    contract: "omni.bridge.near",
    rpcUrls: ["https://free.rpc.fastnear.com"],
  },
  sol: {
    locker: "dahPEoZGXfyV58JqqH85okdHmpN8U2q8owgPUXSCPxe",
    wormhole: "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth",
    shimProgram: "EtZMZM22ViKMo4r5y4Anovs3wKQ2owUmDpjygnMMcdEX",
    eventAuthority: "HQS31aApX3DDkuXgSpV9XyDUNtFgQ31pUn5BNWHG2PSp",
  },
  btc: {
    network: "mainnet",
    apiUrl: "https://blockstream.info/api",
    mempoolUrl: "https://mempool.space/api",
    rpcUrl: "https://bitcoin-rpc.publicnode.com",
    btcConnector: "btc-connector.bridge.near",
    btcToken: "nbtc.bridge.near",
    bitcoinRelayer: "satoshi_optwo.near",
  },
  zcash: {
    network: "mainnet",
    apiUrl: "https://zcash-mainnet.gateway.tatum.io/",
    rpcUrl: "https://zcash-mainnet.gateway.tatum.io/",
    zcashConnector: "zcash-connector.bridge.near",
    zcashToken: "nzec.bridge.near",
  },
}

const TESTNET_ADDRESSES: ChainAddresses = {
  eth: { bridge: "0x68a86e0Ea5B1d39F385c1326e4d493526dFe4401" },
  arb: { bridge: "0x0C981337fFe39a555d3A40dbb32f21aD0eF33FFA" },
  base: { bridge: "0xa56b860017152cD296ad723E8409Abd6e5D86d4d" },
  bnb: { bridge: "0x7Fd1E9F9ed48ebb64476ba9E06e5F1a90e31DA74" },
  pol: { bridge: "0xEC81aFc3485a425347Ac03316675e58a680b283A" },
  near: {
    contract: "omni.n-bridge.testnet",
    rpcUrls: ["https://test.rpc.fastnear.com"],
  },
  sol: {
    locker: "862HdJV59Vp83PbcubUnvuXc4EAXP8CDDs6LTxFpunTe",
    wormhole: "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5",
    shimProgram: "EtZMZM22ViKMo4r5y4Anovs3wKQ2owUmDpjygnMMcdEX",
    eventAuthority: "HQS31aApX3DDkuXgSpV9XyDUNtFgQ31pUn5BNWHG2PSp",
  },
  btc: {
    network: "testnet",
    apiUrl: "https://blockstream.info/testnet/api",
    mempoolUrl: "https://mempool.space/testnet/api",
    rpcUrl: "https://bitcoin-testnet-rpc.publicnode.com",
    btcConnector: "btc-connector.n-bridge.testnet",
    btcToken: "nbtc.n-bridge.testnet",
    bitcoinRelayer: "cosmosfirst.testnet",
  },
  zcash: {
    network: "testnet",
    apiUrl: "https://zcash-testnet.gateway.tatum.io/",
    rpcUrl: "https://zcash-testnet.gateway.tatum.io/",
    zcashConnector: "zcash_connector.n-bridge.testnet",
    zcashToken: "nzcash.n-bridge.testnet",
  },
}

const ADDRESSES: Record<Network, ChainAddresses> = {
  mainnet: MAINNET_ADDRESSES,
  testnet: TESTNET_ADDRESSES,
}

export function getAddresses(network: Network): ChainAddresses {
  return ADDRESSES[network]
}

// EVM chain IDs per network
export const EVM_CHAIN_IDS: Record<Network, Record<string, number>> = {
  mainnet: {
    eth: 1,
    arb: 42161,
    base: 8453,
    bnb: 56,
    pol: 137,
  },
  testnet: {
    eth: 11155111, // Sepolia
    arb: 421614, // Arbitrum Sepolia
    base: 84532, // Base Sepolia
    bnb: 97, // BSC Testnet
    pol: 80002, // Polygon Amoy
  },
}

// API base URLs
export const API_BASE_URLS: Record<Network, string> = {
  mainnet: "https://mainnet.api.bridge.nearone.org",
  testnet: "https://testnet.api.bridge.nearone.org",
}
