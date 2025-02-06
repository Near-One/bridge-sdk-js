import { beforeEach, describe, expect, it } from "vitest"
import { addresses, setNetwork } from "../src/config"
import { OmniBridgeAPI } from "./api"

describe("Config", () => {
  beforeEach(() => {
    // Reset to mainnet before each test
    setNetwork("mainnet")
  })

  it("should set the network to testnet", () => {
    setNetwork("testnet")
    expect(addresses.near).toBe("omni-locker.testnet")
  })

  it("should set the network to mainnet", () => {
    setNetwork("mainnet")
    expect(addresses.near).toBe("omni.bridge.near")
  })

  it("should return the correct addresses for mainnet", () => {
    expect(addresses.arb).toBe("0xd025b38762B4A4E36F0Cde483b86CB13ea00D989")
    expect(addresses.base).toBe("0xd025b38762B4A4E36F0Cde483b86CB13ea00D989")
    expect(addresses.eth).toBe("0x3701B9859Dbb9a4333A3dd933ab18e9011ddf2C8")
    expect(addresses.near).toBe("omni.bridge.near")
    expect(addresses.sol.locker).toBe("dahPEoZGXfyV58JqqH85okdHmpN8U2q8owgPUXSCPxe")
  })

  it("should return the correct addresses for testnet", () => {
    setNetwork("testnet")
    expect(addresses.arb).toBe("0xd025b38762B4A4E36F0Cde483b86CB13ea00D989")
    expect(addresses.base).toBe("0x0C981337fFe39a555d3A40dbb32f21aD0eF33FFA")
    expect(addresses.eth).toBe("0x3701B9859Dbb9a4333A3dd933ab18e9011ddf2C8")
    expect(addresses.near).toBe("omni-locker.testnet")
    expect(addresses.sol.locker).toBe("Gy1XPwYZURfBzHiGAxnw3SYC33SfqsEpGSS5zeBge28p")
  })

  it("should set the base URL for OmniBridgeAPI", () => {
    const api = new OmniBridgeAPI()
    expect(api.getBaseUrl()).toBe("https://api.bridge.nearone.org")
    setNetwork("testnet")
    expect(api.getBaseUrl()).toBe("https://testnet.api.bridge.nearone.org")
  })
})
