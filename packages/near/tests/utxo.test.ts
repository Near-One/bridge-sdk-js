import { describe, expect, it } from "vitest"
import { createNearBuilder } from "../src/builder.js"
import { GAS, DEPOSIT } from "../src/types.js"

describe("NearBuilder UTXO methods", () => {
  const builder = createNearBuilder({ network: "testnet" })

  describe("getUtxoConnectorAddress", () => {
    it("returns BTC connector address for btc chain", () => {
      const address = builder.getUtxoConnectorAddress("btc")
      expect(address).toBe("btc-connector.n-bridge.testnet")
    })

    it("returns Zcash connector address for zcash chain", () => {
      const address = builder.getUtxoConnectorAddress("zcash")
      expect(address).toBe("zcash_connector.n-bridge.testnet")
    })
  })

  describe("getUtxoTokenAddress", () => {
    it("returns nBTC token address for btc chain", () => {
      const address = builder.getUtxoTokenAddress("btc")
      expect(address).toBe("nbtc.n-bridge.testnet")
    })

    it("returns nZEC token address for zcash chain", () => {
      const address = builder.getUtxoTokenAddress("zcash")
      expect(address).toBe("nzcash.n-bridge.testnet")
    })
  })

  describe("buildUtxoDepositFinalization", () => {
    it("builds verify_deposit transaction for BTC", () => {
      const tx = builder.buildUtxoDepositFinalization({
        chain: "btc",
        depositMsg: {
          recipient_id: "alice.testnet",
        },
        txBytes: [0x01, 0x02, 0x03],
        vout: 0,
        txBlockBlockhash: "00000000000000000001abc123",
        txIndex: 5,
        merkleProof: ["hash1", "hash2"],
        signerId: "relayer.testnet",
      })

      expect(tx.type).toBe("near")
      expect(tx.signerId).toBe("relayer.testnet")
      expect(tx.receiverId).toBe("btc-connector.n-bridge.testnet")
      expect(tx.actions).toHaveLength(1)
      expect(tx.actions[0]?.methodName).toBe("verify_deposit")
      expect(tx.actions[0]?.gas).toBe(GAS.UTXO_VERIFY_DEPOSIT)
      expect(tx.actions[0]?.deposit).toBe(0n)
    })

    it("builds verify_deposit transaction for Zcash", () => {
      const tx = builder.buildUtxoDepositFinalization({
        chain: "zcash",
        depositMsg: {
          recipient_id: "bob.testnet",
        },
        txBytes: [0x04, 0x05, 0x06],
        vout: 1,
        txBlockBlockhash: "00000000000000000002def456",
        txIndex: 3,
        merkleProof: ["hash3", "hash4"],
        signerId: "relayer.testnet",
      })

      expect(tx.receiverId).toBe("zcash_connector.n-bridge.testnet")
      expect(tx.actions[0]?.methodName).toBe("verify_deposit")
    })

    it("includes post_actions when provided", () => {
      const tx = builder.buildUtxoDepositFinalization({
        chain: "btc",
        depositMsg: {
          recipient_id: "alice.testnet",
          post_actions: [
            {
              receiver_id: "bridge.testnet",
              amount: 1000000n,
              msg: '{"recipient":"eth:0x123"}',
            },
          ],
        },
        txBytes: [0x01],
        vout: 0,
        txBlockBlockhash: "blockhash",
        txIndex: 0,
        merkleProof: [],
        signerId: "relayer.testnet",
      })

      const argsJson = new TextDecoder().decode(tx.actions[0]?.args)
      const args = JSON.parse(argsJson)
      expect(args.deposit_msg.post_actions).toHaveLength(1)
      expect(args.deposit_msg.post_actions[0].amount).toBe("1000000")
    })
  })

  describe("buildUtxoWithdrawalInit", () => {
    it("builds ft_transfer_call transaction for BTC withdrawal", () => {
      const tx = builder.buildUtxoWithdrawalInit({
        chain: "btc",
        targetAddress: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
        inputs: ["txid1:0", "txid2:1"],
        outputs: [
          { value: 50000, script_pubkey: "0014751e76e8199196d454941c45d1b3a323f1433bd6" },
          { value: 10000, script_pubkey: "0014abcdef1234567890" },
        ],
        totalAmount: 65000n,
        signerId: "user.testnet",
      })

      expect(tx.type).toBe("near")
      expect(tx.signerId).toBe("user.testnet")
      expect(tx.receiverId).toBe("nbtc.n-bridge.testnet")
      expect(tx.actions).toHaveLength(1)
      expect(tx.actions[0]?.methodName).toBe("ft_transfer_call")
      expect(tx.actions[0]?.gas).toBe(GAS.UTXO_INIT_WITHDRAWAL)
      expect(tx.actions[0]?.deposit).toBe(DEPOSIT.ONE_YOCTO)

      const argsJson = new TextDecoder().decode(tx.actions[0]?.args)
      const args = JSON.parse(argsJson)
      expect(args.receiver_id).toBe("btc-connector.n-bridge.testnet")
      expect(args.amount).toBe("65000")

      const msg = JSON.parse(args.msg)
      expect(msg.Withdraw.target_btc_address).toBe(
        "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
      )
      expect(msg.Withdraw.input).toEqual(["txid1:0", "txid2:1"])
      expect(msg.Withdraw.output).toHaveLength(2)
    })

    it("builds ft_transfer_call transaction for Zcash withdrawal", () => {
      const tx = builder.buildUtxoWithdrawalInit({
        chain: "zcash",
        targetAddress: "tmSiwS1U9MGa9kSDS8Ei5iqe9Tzw9uQWGW3",
        inputs: ["txid1:0"],
        outputs: [{ value: 40000, script_pubkey: "76a914abcdef88ac" }],
        totalAmount: 45000n,
        signerId: "user.testnet",
      })

      expect(tx.receiverId).toBe("nzcash.n-bridge.testnet")

      const argsJson = new TextDecoder().decode(tx.actions[0]?.args)
      const args = JSON.parse(argsJson)
      expect(args.receiver_id).toBe("zcash_connector.n-bridge.testnet")
    })

    it("includes max_gas_fee when provided", () => {
      const tx = builder.buildUtxoWithdrawalInit({
        chain: "btc",
        targetAddress: "tb1qtest",
        inputs: ["txid:0"],
        outputs: [{ value: 10000, script_pubkey: "script" }],
        totalAmount: 15000n,
        maxGasFee: 5000n,
        signerId: "user.testnet",
      })

      const argsJson = new TextDecoder().decode(tx.actions[0]?.args)
      const args = JSON.parse(argsJson)
      const msg = JSON.parse(args.msg)
      expect(msg.Withdraw.max_gas_fee).toBe("5000")
    })
  })

  describe("buildUtxoWithdrawalVerify", () => {
    it("builds btc_verify_withdraw transaction for BTC", () => {
      const tx = builder.buildUtxoWithdrawalVerify({
        chain: "btc",
        blockHeight: 800000,
        merkle: ["hash1", "hash2", "hash3"],
        pos: 5,
        signerId: "relayer.testnet",
      })

      expect(tx.type).toBe("near")
      expect(tx.signerId).toBe("relayer.testnet")
      expect(tx.receiverId).toBe("btc-connector.n-bridge.testnet")
      expect(tx.actions).toHaveLength(1)
      expect(tx.actions[0]?.methodName).toBe("btc_verify_withdraw")
      expect(tx.actions[0]?.gas).toBe(GAS.UTXO_VERIFY_WITHDRAWAL)
      expect(tx.actions[0]?.deposit).toBe(DEPOSIT.ONE_YOCTO)

      const argsJson = new TextDecoder().decode(tx.actions[0]?.args)
      const args = JSON.parse(argsJson)
      expect(args.tx_proof.block_height).toBe(800000)
      expect(args.tx_proof.merkle).toEqual(["hash1", "hash2", "hash3"])
      expect(args.tx_proof.pos).toBe(5)
    })

    it("builds btc_verify_withdraw transaction for Zcash", () => {
      const tx = builder.buildUtxoWithdrawalVerify({
        chain: "zcash",
        blockHeight: 2000000,
        merkle: ["zechash1"],
        pos: 0,
        signerId: "relayer.testnet",
      })

      expect(tx.receiverId).toBe("zcash_connector.n-bridge.testnet")
      expect(tx.actions[0]?.methodName).toBe("btc_verify_withdraw")
    })
  })

  describe("mainnet addresses", () => {
    const mainnetBuilder = createNearBuilder({ network: "mainnet" })

    it("uses mainnet BTC connector address", () => {
      expect(mainnetBuilder.getUtxoConnectorAddress("btc")).toBe("btc-connector.bridge.near")
    })

    it("uses mainnet Zcash connector address", () => {
      expect(mainnetBuilder.getUtxoConnectorAddress("zcash")).toBe("zcash-connector.bridge.near")
    })

    it("uses mainnet BTC token address", () => {
      expect(mainnetBuilder.getUtxoTokenAddress("btc")).toBe("nbtc.bridge.near")
    })

    it("uses mainnet Zcash token address", () => {
      expect(mainnetBuilder.getUtxoTokenAddress("zcash")).toBe("zec.omft.near")
    })
  })
})
