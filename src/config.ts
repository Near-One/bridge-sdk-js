export type NetworkType = "mainnet" | "testnet"

const ADDRESSES = {
  mainnet: {
    arb: "0xd025b38762B4A4E36F0Cde483b86CB13ea00D989",
    base: "0xd025b38762B4A4E36F0Cde483b86CB13ea00D989",
    eth: "0x3701B9859Dbb9a4333A3dd933ab18e9011ddf2C8",
    near: "omni.bridge.near",
    sol: "dahPEoZGXfyV58JqqH85okdHmpN8U2q8owgPUXSCPxe",
  },
  testnet: {
    arb: "0xd025b38762B4A4E36F0Cde483b86CB13ea00D989",
    base: "0x0C981337fFe39a555d3A40dbb32f21aD0eF33FFA",
    eth: "0x3701B9859Dbb9a4333A3dd933ab18e9011ddf2C8",
    near: "omni-locker.testnet",
    sol: "Gy1XPwYZURfBzHiGAxnw3SYC33SfqsEpGSS5zeBge28p",
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
}
