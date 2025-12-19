export type NetworkType = "mainnet" | "testnet"

export type ChainAddresses = {
  arb: string
  base: string
  bnb: string
  eth: string
  pol: string
  near: {
    contract: string
    rpcUrls: string[]
  }
  sol: {
    locker: string
    wormhole: string
    shimProgram: string
    eventAuthority: string
  }
  btc: {
    network: NetworkType
    apiUrl: string
    mempoolUrl: string
    rpcUrl: string
    btcConnector: string
    btcToken: string
    bitcoinRelayer: string
  }
  zcash: {
    network: NetworkType
    apiUrl: string
    rpcUrl: string
    zcashConnector: string
    zcashToken: string
  }
}

type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>
    }
  : T

export type ConfigOverride = DeepPartial<ChainAddresses>

const ADDRESSES: Record<NetworkType, ChainAddresses> = {
  mainnet: {
    arb: "0xd025b38762B4A4E36F0Cde483b86CB13ea00D989",
    base: "0xd025b38762B4A4E36F0Cde483b86CB13ea00D989",
    bnb: "0x073C8a225c8Cf9d3f9157F5C1a1DbE02407f5720",
    eth: "0xe00c629afaccb0510995a2b95560e446a24c85b9",
    pol: "0xd025b38762B4A4E36F0Cde483b86CB13ea00D989",
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
  },
  testnet: {
    arb: "0x0C981337fFe39a555d3A40dbb32f21aD0eF33FFA",
    base: "0xa56b860017152cD296ad723E8409Abd6e5D86d4d",
    bnb: "0x7Fd1E9F9ed48ebb64476ba9E06e5F1a90e31DA74",
    eth: "0x68a86e0Ea5B1d39F385c1326e4d493526dFe4401",
    pol: "0xEC81aFc3485a425347Ac03316675e58a680b283A",
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
  },
}

let selectedNetwork: NetworkType = "mainnet"
let configOverrides: ConfigOverride = {}

export function setNetwork(network: NetworkType) {
  selectedNetwork = network
}

export function getNetwork(): NetworkType {
  return selectedNetwork
}

function deepMerge<T extends Record<string, unknown>>(target: T, source: DeepPartial<T>): T {
  const result = { ...target } as Record<string, unknown>
  const src = source as Record<string, unknown>

  for (const key in src) {
    const sourceValue = src[key]
    const targetValue = result[key]
    if (
      sourceValue &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as DeepPartial<Record<string, unknown>>,
      )
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue
    }
  }
  return result as T
}

export function setConfig(overrides: ConfigOverride) {
  configOverrides = deepMerge(configOverrides, overrides) as ConfigOverride
}

export function resetConfig() {
  configOverrides = {}
}

function getConfig(): ChainAddresses {
  return deepMerge(ADDRESSES[selectedNetwork], configOverrides)
}

export const addresses = {
  get arb() {
    return getConfig().arb
  },
  get base() {
    return getConfig().base
  },
  get bnb() {
    return getConfig().bnb
  },
  get eth() {
    return getConfig().eth
  },
  get pol() {
    return getConfig().pol
  },
  get near() {
    return getConfig().near
  },
  get sol() {
    return getConfig().sol
  },
  get btc() {
    return getConfig().btc
  },
  get zcash() {
    return getConfig().zcash
  },
  get network() {
    return selectedNetwork
  },
}
