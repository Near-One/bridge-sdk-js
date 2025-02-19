export type NetworkType = "mainnet" | "testnet"

const ADDRESSES = {
  mainnet: {
    arb: "0xd025b38762B4A4E36F0Cde483b86CB13ea00D989",
    base: "0xd025b38762B4A4E36F0Cde483b86CB13ea00D989",
    eth: "0x3701B9859Dbb9a4333A3dd933ab18e9011ddf2C8",
    near: "omni.bridge.near",
    sol: {
      locker: "dahPEoZGXfyV58JqqH85okdHmpN8U2q8owgPUXSCPxe",
      wormhole: "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth",
    },
  },
  testnet: {
    arb: "0x0C981337fFe39a555d3A40dbb32f21aD0eF33FFA",
    base: "0xa56b860017152cD296ad723E8409Abd6e5D86d4d",
    eth: "0x68a86e0Ea5B1d39F385c1326e4d493526dFe4401",
    near: "omni.n-bridge.testnet",
    sol: {
      locker: "862HdJV59Vp83PbcubUnvuXc4EAXP8CDDs6LTxFpunTe",
      wormhole: "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5",
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
  get eth() {
    return ADDRESSES[selectedNetwork].eth
  },
  get near() {
    return ADDRESSES[selectedNetwork].near
  },
  get sol() {
    return ADDRESSES[selectedNetwork].sol
  },
  get network() {
    return selectedNetwork
  },
}
