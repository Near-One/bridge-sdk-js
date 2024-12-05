import { Chain } from "./types"

export interface NetworkConfig {
  factoryAddress: string
  lockerAddress: string
  apiEndpoint: string
}

export const TESTNET_CONFIG: Record<Chain, NetworkConfig> = {
  [Chain.Ethereum]: {
    factoryAddress: "0x9Bb4BEC352c456183852AfB9b6C4098E20009928",
    lockerAddress: "omni-locker.testnet",
    apiEndpoint: "https://testnet.api.bridge.nearone.org",
  },
  [Chain.Near]: {
    factoryAddress: "",
    lockerAddress: "omni-locker.testnet",
    apiEndpoint: "https://testnet.api.bridge.nearone.org",
  },
  [Chain.Solana]: {
    factoryAddress: "",
    lockerAddress: "",
    apiEndpoint: "",
  },
  [Chain.Arbitrum]: {
    factoryAddress: "",
    lockerAddress: "",
    apiEndpoint: "",
  },
  [Chain.Base]: {
    factoryAddress: "",
    lockerAddress: "",
    apiEndpoint: "",
  },
}
