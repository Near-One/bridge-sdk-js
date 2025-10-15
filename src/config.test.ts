import { beforeEach, describe, expect, it } from "vitest"
import { addresses, resetConfig, setConfig, setNetwork } from "../src/config.js"
import { OmniBridgeAPI } from "./api.js"

describe("Config", () => {
  beforeEach(() => {
    // Reset to mainnet and clear overrides before each test
    setNetwork("mainnet")
    resetConfig()
  })

  it("should set the network to testnet", () => {
    setNetwork("testnet")
    expect(addresses.near.contract).toBe("omni.n-bridge.testnet")
    expect(addresses.near.rpcUrl).toBe("https://rpc.testnet.near.org")
  })

  it("should set the network to mainnet", () => {
    setNetwork("mainnet")
    expect(addresses.near.contract).toBe("omni.bridge.near")
    expect(addresses.near.rpcUrl).toBe("https://rpc.near.org")
  })

  it("should return the correct addresses for mainnet", () => {
    expect(addresses.arb).toBe("0xd025b38762B4A4E36F0Cde483b86CB13ea00D989")
    expect(addresses.base).toBe("0xd025b38762B4A4E36F0Cde483b86CB13ea00D989")
    expect(addresses.eth).toBe("0xe00c629afaccb0510995a2b95560e446a24c85b9")
    expect(addresses.near.contract).toBe("omni.bridge.near")
    expect(addresses.near.rpcUrl).toBe("https://rpc.near.org")
    expect(addresses.sol.locker).toBe("dahPEoZGXfyV58JqqH85okdHmpN8U2q8owgPUXSCPxe")
  })

  it("should return the correct addresses for testnet", () => {
    setNetwork("testnet")
    expect(addresses.arb).toBe("0x0C981337fFe39a555d3A40dbb32f21aD0eF33FFA")
    expect(addresses.base).toBe("0xa56b860017152cD296ad723E8409Abd6e5D86d4d")
    expect(addresses.eth).toBe("0x68a86e0Ea5B1d39F385c1326e4d493526dFe4401")
    expect(addresses.near.contract).toBe("omni.n-bridge.testnet")
    expect(addresses.near.rpcUrl).toBe("https://rpc.testnet.near.org")
    expect(addresses.sol.locker).toBe("862HdJV59Vp83PbcubUnvuXc4EAXP8CDDs6LTxFpunTe")
  })

  it("should set the base URL for OmniBridgeAPI", () => {
    const api = new OmniBridgeAPI()
    expect(api.getDefaultBaseUrl()).toBe("https://mainnet.api.bridge.nearone.org")
    setNetwork("testnet")
    expect(api.getDefaultBaseUrl()).toBe("https://testnet.api.bridge.nearone.org")
  })

  describe("Config Overrides", () => {
    it("should override NEAR RPC URL", () => {
      const customRpc = "https://my-custom-near-rpc.com"
      setConfig({
        near: {
          rpcUrl: customRpc,
        },
      })
      expect(addresses.near.rpcUrl).toBe(customRpc)
      expect(addresses.near.contract).toBe("omni.bridge.near")
    })

    it("should override NEAR contract address", () => {
      const customContract = "custom.bridge.near"
      setConfig({
        near: {
          contract: customContract,
        },
      })
      expect(addresses.near.contract).toBe(customContract)
      expect(addresses.near.rpcUrl).toBe("https://rpc.near.org")
    })

    it("should override BTC RPC URL", () => {
      const customBtcRpc = "https://my-bitcoin-node.com"
      setConfig({
        btc: {
          rpcUrl: customBtcRpc,
        },
      })
      expect(addresses.btc.rpcUrl).toBe(customBtcRpc)
      expect(addresses.btc.apiUrl).toBe("https://blockstream.info/api")
    })

    it("should override EVM contract addresses", () => {
      const customEth = "0x1111111111111111111111111111111111111111"
      setConfig({
        eth: customEth,
      })
      expect(addresses.eth).toBe(customEth)
    })

    it("should reset config overrides", () => {
      setConfig({
        near: {
          rpcUrl: "https://custom.rpc",
        },
      })
      expect(addresses.near.rpcUrl).toBe("https://custom.rpc")

      resetConfig()
      expect(addresses.near.rpcUrl).toBe("https://rpc.near.org")
    })

    it("should merge multiple config calls", () => {
      setConfig({
        near: {
          rpcUrl: "https://custom.rpc",
        },
      })
      setConfig({
        near: {
          contract: "custom.contract",
        },
      })

      expect(addresses.near.rpcUrl).toBe("https://custom.rpc")
      expect(addresses.near.contract).toBe("custom.contract")
    })

    it("should work with network switching", () => {
      setConfig({
        near: {
          rpcUrl: "https://custom.rpc",
        },
      })

      setNetwork("testnet")
      expect(addresses.near.contract).toBe("omni.n-bridge.testnet")
      expect(addresses.near.rpcUrl).toBe("https://custom.rpc")

      setNetwork("mainnet")
      expect(addresses.near.contract).toBe("omni.bridge.near")
      expect(addresses.near.rpcUrl).toBe("https://custom.rpc")
    })
  })
})
