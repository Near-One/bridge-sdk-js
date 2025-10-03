export type NetworkType = "mainnet" | "testnet"

const ADDRESSES = {
  mainnet: {
    arb: "0xd025b38762B4A4E36F0Cde483b86CB13ea00D989",
    base: "0xd025b38762B4A4E36F0Cde483b86CB13ea00D989",
    bnb: "0x073C8a225c8Cf9d3f9157F5C1a1DbE02407f5720",
    eth: "0xe00c629afaccb0510995a2b95560e446a24c85b9",
    near: "omni.bridge.near",
    sol: {
      locker: "dahPEoZGXfyV58JqqH85okdHmpN8U2q8owgPUXSCPxe",
      wormhole: "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth",
      shimProgram: "EtZMZM22ViKMo4r5y4Anovs3wKQ2owUmDpjygnMMcdEX",
      eventAuthority: "HQS31aApX3DDkuXgSpV9XyDUNtFgQ31pUn5BNWHG2PSp",
    },
    btc: {
      network: "mainnet" as const,
      apiUrl: "https://blockstream.info/api",
      mempoolUrl: "https://mempool.space/api",
      rpcUrl: "https://bitcoin-rpc.publicnode.com",
      btcConnector: "btc-connector.bridge.near",
      btcToken: "nbtc.bridge.near",
      bitcoinRelayer: "satoshi_optwo.near",
    },
    zcash: {
      network: "mainnet" as const,
      apiUrl: "https://zcash-mainnet.gateway.tatum.io/",
      rpcUrl: "https://zcash-mainnet.gateway.tatum.io/",
      zcashConnector: "zcash-connector.bridge.near",
      zcashToken: "nzec.bridge.near",
    },
  },
  testnet: {
    arb: "0x0C981337fFe39a555d3A40dbb32f21aD0eF33FFA",
    base: "0xa56b860017152cD296ad723E8409Abd6e5D86d4d",
    bnb: "0x7Fd1E9F9ed48ebb64476ba9E06e5F1a90e31DA74",
    eth: "0x68a86e0Ea5B1d39F385c1326e4d493526dFe4401",
    near: "omni.n-bridge.testnet",
    sol: {
      locker: "862HdJV59Vp83PbcubUnvuXc4EAXP8CDDs6LTxFpunTe",
      wormhole: "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5",
      shimProgram: "EtZMZM22ViKMo4r5y4Anovs3wKQ2owUmDpjygnMMcdEX",
      eventAuthority: "HQS31aApX3DDkuXgSpV9XyDUNtFgQ31pUn5BNWHG2PSp",
    },
    btc: {
      network: "testnet" as const,
      apiUrl: "https://blockstream.info/testnet/api",
      mempoolUrl: "https://mempool.space/testnet/api",
      rpcUrl: "https://bitcoin-testnet-rpc.publicnode.com",
      btcConnector: "brg-dev.testnet",
      btcToken: "nbtc.n-bridge.testnet",
      bitcoinRelayer: "cosmosfirst.testnet",
    },
    zcash: {
      network: "testnet" as const,
      apiUrl: "https://zcash-testnet.gateway.tatum.io/",
      rpcUrl: "https://zcash-testnet.gateway.tatum.io/",
      zcashConnector: "zcash_connector.n-bridge.testnet",
      zcashToken: "nzcash.n-bridge.testnet",
    },
  },
} as const

let selectedNetwork: NetworkType = "mainnet"

export function setNetwork(network: NetworkType) {
  selectedNetwork = network
}

export function getNetwork(): NetworkType {
  return selectedNetwork
}

export const addresses = {
  get arb() {
    return ADDRESSES[selectedNetwork].arb
  },
  get base() {
    return ADDRESSES[selectedNetwork].base
  },
  get bnb() {
    return ADDRESSES[selectedNetwork].bnb
  },
  get eth() {
    return ADDRESSES[selectedNetwork].eth
  },
  get near() {
    return ADDRESSES[selectedNetwork].near
  },
  get sol() {
    return ADDRESSES[selectedNetwork].sol
  },
  get btc() {
    return ADDRESSES[selectedNetwork].btc
  },
  get zcash() {
    return ADDRESSES[selectedNetwork].zcash
  },
  get network() {
    return selectedNetwork
  },
}
