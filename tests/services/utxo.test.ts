import { describe, expect, it } from "vitest"
import { UtxoService, type UtxoSelectionResult } from "../../src/services/utxo.js"
import type { UTXO } from "../../src/types/bitcoin.js"

// Test implementation of abstract UtxoService
class TestUtxoService extends UtxoService {
  selectUtxos(
    utxos: UTXO[],
    amount: bigint,
    targetAddress: string,
    changeAddress: string,
    feeRate: number,
  ): UtxoSelectionResult {
    this.validateUtxos(utxos)
    this.validateAmount(amount)
    this.validateAddress(targetAddress)
    this.validateAddress(changeAddress)

    const sorted = this.sortUtxosByValue(utxos)
    const selected = [sorted[0]] // Select largest UTXO
    const fee = this.calculateFee(1, 2, feeRate)
    
    return {
      selected,
      total: this.calculateTotalValue(selected),
      fee,
    }
  }

  calculateFee(inputs: number, outputs: number, feeRate?: number): bigint {
    return BigInt((inputs + outputs) * (feeRate || 10))
  }

  async broadcastTransaction(txHex: string): Promise<string> {
    if (txHex === "invalid") {
      throw new Error("Test: Invalid transaction")
    }
    return "test_tx_hash"
  }

  isValidAddress(address: string): boolean {
    return address.startsWith("test")
  }
}

const mockUTXOs: UTXO[] = [
  {
    path: "m/44'/1'/0'/0/0",
    tx_bytes: new Uint8Array([0x02, 0x00, 0x00, 0x00]),
    vout: 0,
    balance: "100000",
    txid: "utxo1",
  },
  {
    path: "m/44'/1'/0'/0/1", 
    tx_bytes: new Uint8Array([0x02, 0x00, 0x00, 0x01]),
    vout: 1,
    balance: "50000",
    txid: "utxo2",
  },
]

describe("UtxoService", () => {
  describe("abstract class behavior", () => {
    const service = new TestUtxoService("https://test.api", "testnet")

    it("should store network type correctly", () => {
      expect(service.getNetworkType()).toBe("testnet")
    })

    it("should validate UTXOs correctly", () => {
      expect(() => service.selectUtxos([], BigInt(1000), "testaddr", "testchange", 10))
        .toThrow("TestUtxoService: No UTXOs available for transaction")
    })

    it("should validate amount correctly", () => {
      expect(() => service.selectUtxos(mockUTXOs, BigInt(0), "testaddr", "testchange", 10))
        .toThrow("TestUtxoService: Amount must be greater than zero")
    })

    it("should validate addresses correctly", () => {
      expect(() => service.selectUtxos(mockUTXOs, BigInt(1000), "", "testchange", 10))
        .toThrow("TestUtxoService: Invalid address provided")
    })

    it("should calculate total value correctly", () => {
      const result = service.selectUtxos(mockUTXOs, BigInt(1000), "testaddr", "testchange", 10)
      expect(result.total).toBe(BigInt(100000)) // Largest UTXO
    })

    it("should sort UTXOs by value", () => {
      const sorted = service['sortUtxosByValue'](mockUTXOs)
      expect(sorted[0].balance).toBe("100000") // Largest first
      expect(sorted[1].balance).toBe("50000")
    })

    it("should implement fee calculation", () => {
      const fee = service.calculateFee(2, 1, 5)
      expect(fee).toBe(BigInt(15)) // (2 + 1) * 5
    })

    it("should implement address validation", () => {
      expect(service.isValidAddress("testaddr")).toBe(true)
      expect(service.isValidAddress("invalid")).toBe(false)
    })

    it("should implement transaction broadcasting", async () => {
      const result = await service.broadcastTransaction("valid_tx")
      expect(result).toBe("test_tx_hash")

      await expect(service.broadcastTransaction("invalid"))
        .rejects.toThrow("Test: Invalid transaction")
    })
  })

  describe("helper methods", () => {
    const service = new TestUtxoService("https://test.api", "mainnet")

    it("should calculate total value of UTXOs", () => {
      const total = service['calculateTotalValue'](mockUTXOs)
      expect(total).toBe(BigInt(150000)) // 100000 + 50000
    })

    it("should handle empty UTXO array", () => {
      const total = service['calculateTotalValue']([])
      expect(total).toBe(BigInt(0))
    })

    it("should sort UTXOs largest first", () => {
      const unsorted = [...mockUTXOs].reverse()
      const sorted = service['sortUtxosByValue'](unsorted)
      
      expect(sorted[0].balance).toBe("100000")
      expect(sorted[1].balance).toBe("50000")
    })
  })

  describe("network configuration", () => {
    it("should handle mainnet configuration", () => {
      const mainnetService = new TestUtxoService("https://mainnet.api", "mainnet")
      expect(mainnetService.getNetworkType()).toBe("mainnet")
    })

    it("should handle testnet configuration", () => {
      const testnetService = new TestUtxoService("https://testnet.api", "testnet")
      expect(testnetService.getNetworkType()).toBe("testnet")
    })
  })
})