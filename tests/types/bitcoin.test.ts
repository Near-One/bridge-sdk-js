import { describe, expect, it } from "vitest"
import type {
  BitcoinInput,
  BitcoinMerkleProofResponse,
  BitcoinOutput,
  BitcoinTransaction,
  BridgeFee,
  BtcConnectorConfig,
  BtcDepositArgs,
  BtcPostAction,
  DepositMsg,
  FinBtcTransferArgs,
  InitBtcTransferMsg,
  NearBlocksReceiptsResponse,
  NearBlocksTransaction,
  UTXO,
} from "../../src/types/bitcoin.js"

describe("Bitcoin Types", () => {
  describe("BitcoinTransaction", () => {
    it("should have correct structure for confirmed transaction", () => {
      const confirmedTx: BitcoinTransaction = {
        txid: "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
        version: 2,
        locktime: 0,
        vin: [
          {
            txid: "input_tx_hash",
            vout: 0,
            scriptsig: "473044022012345...",
            scriptsig_asm: "OP_PUSHBYTES_71 3044022012345...",
            witness: ["304402201234567890abcdef"],
            is_coinbase: false,
            sequence: 4294967295,
          },
        ],
        vout: [
          {
            scriptpubkey: "76a914abcdef1234567890abcdef1234567890abcdef88ac",
            scriptpubkey_asm: "OP_DUP OP_HASH160 OP_PUSHBYTES_20 abcdef...",
            scriptpubkey_type: "p2pkh",
            scriptpubkey_address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
            value: 5000000000,
          },
        ],
        size: 250,
        weight: 1000,
        fee: 1000,
        status: {
          confirmed: true,
          block_height: 800000,
          block_hash: "00000000000000000001234567890abcdef1234567890abcdef1234567890abc",
          block_time: 1640995200,
        },
      }

      expect(confirmedTx.txid).toHaveLength(64)
      expect(confirmedTx.status?.confirmed).toBe(true)
      expect(confirmedTx.vin).toHaveLength(1)
      expect(confirmedTx.vout).toHaveLength(1)
      expect(confirmedTx.fee).toBeGreaterThan(0)
    })

    it("should handle unconfirmed transaction", () => {
      const unconfirmedTx: BitcoinTransaction = {
        txid: "b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678",
        version: 1,
        locktime: 0,
        vin: [],
        vout: [],
        size: 150,
        weight: 600,
        fee: 500,
        status: {
          confirmed: false,
        },
      }

      expect(unconfirmedTx.status?.confirmed).toBe(false)
      expect(unconfirmedTx.status?.block_height).toBeUndefined()
      expect(unconfirmedTx.status?.block_hash).toBeUndefined()
    })

    it("should handle coinbase transaction", () => {
      const coinbaseTx: BitcoinTransaction = {
        txid: "c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567890",
        version: 1,
        locktime: 0,
        vin: [
          {
            txid: "0000000000000000000000000000000000000000000000000000000000000000",
            vout: 4294967295,
            scriptsig: "03abcdef",
            scriptsig_asm: "OP_PUSHBYTES_3 abcdef",
            witness: [],
            is_coinbase: true,
            sequence: 4294967295,
          },
        ],
        vout: [
          {
            scriptpubkey: "76a914abcdef1234567890abcdef1234567890abcdef88ac",
            scriptpubkey_asm: "OP_DUP OP_HASH160 OP_PUSHBYTES_20 abcdef...",
            scriptpubkey_type: "p2pkh",
            scriptpubkey_address: "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
            value: 5000000000,
          },
        ],
        size: 200,
        weight: 800,
        fee: 0,
      }

      expect(coinbaseTx.vin[0].is_coinbase).toBe(true)
      expect(coinbaseTx.fee).toBe(0)
    })
  })

  describe("BitcoinInput and BitcoinOutput", () => {
    it("should represent P2PKH input correctly", () => {
      const p2pkhInput: BitcoinInput = {
        txid: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        vout: 1,
        scriptsig: "473044022012345678901234567890123456789012345678901234567890123456789012345601210212345678901234567890123456789012345678901234567890123456789012",
        scriptsig_asm: "OP_PUSHBYTES_71 3044022012345... OP_PUSHBYTES_33 0212345...",
        witness: [],
        is_coinbase: false,
        sequence: 4294967295,
        prevout: {
          scriptpubkey: "76a914abcdef1234567890abcdef1234567890abcdef88ac",
          scriptpubkey_asm: "OP_DUP OP_HASH160 OP_PUSHBYTES_20 abcdef... OP_EQUALVERIFY OP_CHECKSIG",
          scriptpubkey_type: "p2pkh",
          scriptpubkey_address: "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
          value: 1000000,
        },
      }

      expect(p2pkhInput.witness).toHaveLength(0)
      expect(p2pkhInput.prevout?.scriptpubkey_type).toBe("p2pkh")
      expect(p2pkhInput.is_coinbase).toBe(false)
    })

    it("should represent P2WPKH input correctly", () => {
      const p2wpkhInput: BitcoinInput = {
        txid: "def1234567890abcdef1234567890abcdef1234567890abcdef1234567890abc",
        vout: 0,
        scriptsig: "",
        scriptsig_asm: "",
        witness: [
          "3044022012345678901234567890123456789012345678901234567890123456789012345601",
          "0212345678901234567890123456789012345678901234567890123456789012",
        ],
        is_coinbase: false,
        sequence: 4294967295,
        prevout: {
          scriptpubkey: "0014abcdef1234567890abcdef1234567890abcdef12",
          scriptpubkey_asm: "OP_0 OP_PUSHBYTES_20 abcdef1234567890abcdef1234567890abcdef12",
          scriptpubkey_type: "v0_p2wpkh",
          scriptpubkey_address: "bc1q40x77y35v4ufp0472v3x2nt8jz4lwufxvr8h8v",
          value: 2000000,
        },
      }

      expect(p2wpkhInput.witness).toHaveLength(2)
      expect(p2wpkhInput.scriptsig).toBe("")
      expect(p2wpkhInput.prevout?.scriptpubkey_type).toBe("v0_p2wpkh")
    })

    it("should represent different output types", () => {
      const outputs: BitcoinOutput[] = [
        // P2PKH output
        {
          scriptpubkey: "76a914abcdef1234567890abcdef1234567890abcdef88ac",
          scriptpubkey_asm: "OP_DUP OP_HASH160 OP_PUSHBYTES_20 abcdef... OP_EQUALVERIFY OP_CHECKSIG",
          scriptpubkey_type: "p2pkh",
          scriptpubkey_address: "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
          value: 1000000,
        },
        // P2WPKH output
        {
          scriptpubkey: "0014abcdef1234567890abcdef1234567890abcdef12",
          scriptpubkey_asm: "OP_0 OP_PUSHBYTES_20 abcdef1234567890abcdef1234567890abcdef12",
          scriptpubkey_type: "v0_p2wpkh",
          scriptpubkey_address: "bc1q40x77y35v4ufp0472v3x2nt8jz4lwufxvr8h8v",
          value: 500000,
        },
        // P2SH output
        {
          scriptpubkey: "a914abcdef1234567890abcdef1234567890abcdef87",
          scriptpubkey_asm: "OP_HASH160 OP_PUSHBYTES_20 abcdef1234567890abcdef1234567890abcdef OP_EQUAL",
          scriptpubkey_type: "p2sh",
          scriptpubkey_address: "3GjNnwjU3h3eFRdz8gRvHHKbtoXG1VZz6s",
          value: 250000,
        },
        // OP_RETURN output (null data)
        {
          scriptpubkey: "6a24aa21a9ede2f61c3f71d1defd3fa999dfa36953755c690689799962b48bebd836974e8cf9",
          scriptpubkey_asm: "OP_RETURN OP_PUSHBYTES_36 aa21a9ede2f61c3f71d1defd3fa999dfa36953755c690689799962b48bebd836974e8cf9",
          scriptpubkey_type: "op_return",
          value: 0,
        },
      ]

      expect(outputs[0].scriptpubkey_type).toBe("p2pkh")
      expect(outputs[1].scriptpubkey_type).toBe("v0_p2wpkh")
      expect(outputs[2].scriptpubkey_type).toBe("p2sh")
      expect(outputs[3].scriptpubkey_type).toBe("op_return")
      expect(outputs[3].value).toBe(0)
    })
  })

  describe("UTXO", () => {
    it("should have required fields for Bitcoin operations", () => {
      const utxo: UTXO = {
        path: "m/44'/1'/0'/0/5",
        tx_bytes: new Uint8Array([2, 0, 0, 0, 1, 171, 205, 239, 18, 52, 86, 120, 144]),
        vout: 1,
        balance: "1500000",
        txid: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      }

      expect(utxo.path).toMatch(/^m\/44'\/[01]'\/\d+'\/[01]\/\d+$/)
      expect(utxo.tx_bytes).toBeInstanceOf(Uint8Array)
      expect(utxo.vout).toBeGreaterThanOrEqual(0)
      expect(BigInt(utxo.balance)).toBeGreaterThan(0n)
      expect(utxo.txid).toHaveLength(64)
    })

    it("should handle different derivation paths", () => {
      const paths = [
        "m/44'/0'/0'/0/0", // Mainnet first address
        "m/44'/1'/0'/0/0", // Testnet first address
        "m/44'/0'/1'/1/999", // High index addresses
        "m/49'/0'/0'/0/0", // P2SH-P2WPKH
        "m/84'/0'/0'/0/0", // P2WPKH
      ]

      for (const derivationPath of paths) {
        const utxo: UTXO = {
          path: derivationPath,
          tx_bytes: new Uint8Array([2, 0, 0, 0]),
          vout: 0,
          balance: "100000",
          txid: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        }

        expect(utxo.path).toBe(derivationPath)
      }
    })
  })

  describe("BitcoinMerkleProofResponse", () => {
    it("should contain merkle proof data", () => {
      const merkleProof: BitcoinMerkleProofResponse = {
        block_height: 800000,
        merkle: [
          "abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
          "bcde2345678901bcdef0123456789abcdef01234567890abcdef1234567890bc",
          "cdef3456789012cdef01234567890abcdef123456789abcdef01234567890123",
        ],
        pos: 42,
      }

      expect(merkleProof.block_height).toBeGreaterThan(0)
      expect(merkleProof.merkle).toBeInstanceOf(Array)
      expect(merkleProof.merkle.length).toBeGreaterThan(0)
      expect(merkleProof.pos).toBeGreaterThanOrEqual(0)
      
      // Each merkle hash should be 64 characters (32 bytes in hex)
      merkleProof.merkle.forEach(hash => {
        expect(hash).toHaveLength(64)
        expect(hash).toMatch(/^[0-9a-f]+$/i)
      })
    })
  })

  describe("BtcConnectorConfig", () => {
    it("should have all required configuration fields", () => {
      const config: BtcConnectorConfig = {
        btc_light_client_account_id: "btc-light-client.near",
        nbtc_account_id: "nbtc.near",
        chain_signatures_account_id: "v1.signer.near",
        chain_signatures_root_public_key: "secp256k1:3tFRbMqmoa6AAALMrEFAYCEYJCPT3FwyeAkMuLz6fwcmWfJL5FMAwOJpRAasRSXhZRp9LJ6e9U7xhNgwGaVFgtfVXj",
        change_address: "bc1qchange_address_example",
        confirmations_strategy: { "100": 1, "1000": 3, "10000": 6 },
        confirmations_delta: 0,
        deposit_bridge_fee: {
          fee_min: "1000",
          fee_rate: 0.002,
          protocol_fee_rate: 0.001,
        },
        withdraw_bridge_fee: {
          fee_min: "2000",
          fee_rate: 0.003,
          protocol_fee_rate: 0.0015,
        },
        min_deposit_amount: "10000",
        min_withdraw_amount: "20000",
        min_change_amount: "1000",
        max_change_amount: "100000",
        min_btc_gas_fee: "1000",
        max_btc_gas_fee: "50000",
        max_withdrawal_input_number: 10,
        max_change_number: 2,
        max_active_utxo_management_input_number: 50,
        max_active_utxo_management_output_number: 20,
        active_management_lower_limit: 5,
        active_management_upper_limit: 15,
        passive_management_lower_limit: 2,
        passive_management_upper_limit: 8,
        rbf_num_limit: 3,
        max_btc_tx_pending_sec: 3600,
      }

      // Validate account IDs
      expect(config.btc_light_client_account_id).toMatch(/\.near$/)
      expect(config.nbtc_account_id).toMatch(/\.near$/)
      expect(config.chain_signatures_account_id).toMatch(/\.near$/)

      // Validate amounts are strings (for BigInt compatibility)
      expect(typeof config.min_deposit_amount).toBe("string")
      expect(typeof config.min_withdraw_amount).toBe("string")
      expect(BigInt(config.min_deposit_amount)).toBeGreaterThan(0n)
      expect(BigInt(config.min_withdraw_amount)).toBeGreaterThan(0n)

      // Validate fee structures
      expect(config.deposit_bridge_fee.fee_rate).toBeGreaterThan(0)
      expect(config.withdraw_bridge_fee.fee_rate).toBeGreaterThan(0)
      expect(config.deposit_bridge_fee.protocol_fee_rate).toBeGreaterThanOrEqual(0)

      // Validate limits
      expect(config.max_withdrawal_input_number).toBeGreaterThan(0)
      expect(config.max_change_number).toBeGreaterThan(0)
      expect(config.rbf_num_limit).toBeGreaterThan(0)
    })

    it("should handle different network configurations", () => {
      const mainnetConfig: Partial<BtcConnectorConfig> = {
        btc_light_client_account_id: "btc-light-client.bridge.near",
        nbtc_account_id: "btc-client.bridge.near",
        change_address: "bc1qmainnet_change_address",
        confirmations_strategy: { "1000": 3, "10000": 6 },
      }

      const testnetConfig: Partial<BtcConnectorConfig> = {
        btc_light_client_account_id: "btc-light-client.testnet",
        nbtc_account_id: "nbtc-dev.testnet",
        change_address: "tb1qtestnet_change_address",
        confirmations_strategy: { "100": 1, "1000": 2 },
      }

      expect(mainnetConfig.change_address?.startsWith("bc1q")).toBe(true)
      expect(testnetConfig.change_address?.startsWith("tb1q")).toBe(true)
    })
  })

  describe("Deposit and Withdrawal Messages", () => {
    it("should structure deposit message correctly", () => {
      const postAction: BtcPostAction = {
        receiver_id: "app.near",
        amount: 1000000n,
        msg: "swap_exact_token_for_near",
        gas: 50000000000000n,
        memo: "Automated swap after deposit",
      }

      const depositMsg: DepositMsg = {
        recipient_id: "user.near",
        post_actions: [postAction],
        extra_msg: "Bitcoin deposit via SDK",
      }

      const btcDepositArgs: BtcDepositArgs = {
        deposit_msg: depositMsg,
      }

      expect(btcDepositArgs.deposit_msg.recipient_id).toMatch(/\.near$/)
      expect(btcDepositArgs.deposit_msg.post_actions).toHaveLength(1)
      expect(btcDepositArgs.deposit_msg.post_actions?.[0].amount).toBe(1000000n)
    })

    it("should structure withdrawal message correctly", () => {
      const withdrawMsg: InitBtcTransferMsg = {
        Withdraw: {
          target_btc_address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
          input: ["abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890:0", "fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321:1"],
          output: [
            {
              value: 500000,
              script_pubkey: "0014abcdef1234567890abcdef1234567890abcdef12",
            },
            {
              value: 250000,
              script_pubkey: "0014fedcba0987654321fedcba0987654321fedcba",
            },
          ],
        },
      }

      expect(withdrawMsg.Withdraw.target_btc_address).toMatch(/^(bc1|tb1)/);
      expect(withdrawMsg.Withdraw.input).toBeInstanceOf(Array)
      expect(withdrawMsg.Withdraw.output).toBeInstanceOf(Array)
      expect(withdrawMsg.Withdraw.input[0]).toMatch(/^[0-9a-f]+:\d+$/)
    })

    it("should handle finalize transfer arguments", () => {
      const finArgs: FinBtcTransferArgs = {
        deposit_msg: {
          recipient_id: "recipient.near",
        },
        tx_bytes: [2, 0, 0, 0, 1, 171, 205, 239, 18, 52, 86, 120, 144],
        vout: 1,
        tx_block_blockhash: "00000000000000000001234567890abcdef1234567890abcdef1234567890abc",
        tx_index: 42,
        merkle_proof: [
          "hash1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
          "hash2345678901bcdef0123456789abcdef01234567890abcdef1234567890bc",
        ],
      }

      expect(finArgs.tx_bytes).toBeInstanceOf(Array)
      expect(finArgs.vout).toBeGreaterThanOrEqual(0)
      expect(finArgs.tx_block_blockhash).toHaveLength(64)
      expect(finArgs.tx_index).toBeGreaterThanOrEqual(0)
      expect(finArgs.merkle_proof).toBeInstanceOf(Array)
    })
  })

  describe("NearBlocks API Types", () => {
    it("should parse NearBlocks receipts response", () => {
      const response: NearBlocksReceiptsResponse = {
        txns: [
          {
            transaction_hash: "AbCdEf123456789aBcDeF123456789AbCdEf123456789aBcDeF123456789ABC",
            included_in_block_hash: "near_block_hash_example",
            block_timestamp: "2024-01-01T10:00:00.000Z",
            signer_account_id: "cosmosfirst.testnet",
            receiver_account_id: "v1.signer-dev.testnet",
            actions: [
              {
                action: "FunctionCall",
                method: "sign_btc_transaction",
                args: '{"btc_pending_id":"pending_123","sign_index":0}',
                args_json: {
                  btc_pending_id: "pending_123",
                  sign_index: 0,
                },
              },
            ],
          },
        ],
      }

      expect(response.txns).toHaveLength(1)
      expect(response.txns[0].transaction_hash).toMatch(/^[0-9a-zA-Z]+$/)
      expect(response.txns[0].actions[0].method).toBe("sign_btc_transaction")
      expect(response.txns[0].actions[0].args).toContain("pending_123")
    })

    it("should handle different action types", () => {
      const transaction: NearBlocksTransaction = {
        transaction_hash: "tx_hash_example",
        included_in_block_hash: "block_hash_example",
        block_timestamp: "2024-01-01T10:00:00.000Z",
        signer_account_id: "signer.near",
        receiver_account_id: "receiver.near",
        actions: [
          {
            action: "FunctionCall",
            method: "sign_btc_transaction",
            args: '{"btc_pending_id":"pending_456"}',
          },
          {
            action: "Transfer",
            method: "",
            args: "",
          },
          {
            action: "CreateAccount",
            method: "",
            args: "",
          },
        ],
      }

      expect(transaction.actions).toHaveLength(3)
      expect(transaction.actions[0].action).toBe("FunctionCall")
      expect(transaction.actions[1].action).toBe("Transfer")
      expect(transaction.actions[2].action).toBe("CreateAccount")
    })
  })

  describe("Bridge Fee Types", () => {
    it("should calculate fees correctly", () => {
      const bridgeFee: BridgeFee = {
        fee_min: "1000",
        fee_rate: 0.002, // 0.2%
        protocol_fee_rate: 0.001, // 0.1%
      }

      // Test fee calculation logic
      const amount = 1000000 // 0.01 BTC in satoshis
      const calculatedFee = Math.max(
        parseInt(bridgeFee.fee_min),
        Math.floor(amount * bridgeFee.fee_rate)
      )
      const protocolFee = Math.floor(amount * bridgeFee.protocol_fee_rate)

      expect(calculatedFee).toBe(2000) // 0.2% of 1M sats
      expect(protocolFee).toBe(1000) // 0.1% of 1M sats
      expect(calculatedFee).toBeGreaterThan(parseInt(bridgeFee.fee_min))
    })

    it("should enforce minimum fees", () => {
      const bridgeFee: BridgeFee = {
        fee_min: "5000",
        fee_rate: 0.001, // 0.1%
        protocol_fee_rate: 0.0005, // 0.05%
      }

      // Small amount where calculated fee would be less than minimum
      const smallAmount = 100000 // 0.001 BTC
      const calculatedFee = Math.max(
        parseInt(bridgeFee.fee_min),
        Math.floor(smallAmount * bridgeFee.fee_rate)
      )

      expect(Math.floor(smallAmount * bridgeFee.fee_rate)).toBe(100) // 0.1% of 100k sats
      expect(calculatedFee).toBe(5000) // Should use minimum instead
    })
  })

  describe("Type Compatibility", () => {
    it("should be compatible with existing transfer types", () => {
      // Bitcoin addresses should work with OmniAddress format when prefixed
      const bitcoinAddress = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"
      const omniAddress = `btc:${bitcoinAddress}` // Hypothetical future format

      expect(omniAddress).toMatch(/^btc:/)
      expect(omniAddress.split(":")[1]).toBe(bitcoinAddress)
    })

    it("should handle amount serialization for API calls", () => {
      // Amounts in Bitcoin are often strings to handle BigInt serialization
      const amounts = {
        deposit_amount: "1000000",
        withdraw_amount: "500000",
        fee_amount: "1000",
      }

      // Should be convertible to BigInt
      expect(BigInt(amounts.deposit_amount)).toBe(1000000n)
      expect(BigInt(amounts.withdraw_amount)).toBe(500000n)
      expect(BigInt(amounts.fee_amount)).toBe(1000n)

      // Should serialize back to string for API
      expect(BigInt(amounts.deposit_amount).toString()).toBe(amounts.deposit_amount)
    })
  })

  describe("Edge Cases and Validation", () => {
    it("should handle empty or null values appropriately", () => {
      // Optional fields should handle undefined
      const minimalDepositMsg: DepositMsg = {
        recipient_id: "user.near",
        // post_actions and extra_msg are optional
      }

      expect(minimalDepositMsg.post_actions).toBeUndefined()
      expect(minimalDepositMsg.extra_msg).toBeUndefined()
      expect(minimalDepositMsg.recipient_id).toBeTruthy()
    })

    it("should handle maximum values", () => {
      // Bitcoin has a maximum of 21 million coins = 2.1e15 satoshis
      const maxBitcoinAmount = "2100000000000000"
      const maxAmountBigInt = BigInt(maxBitcoinAmount)

      expect(maxAmountBigInt).toBe(2100000000000000n)
      expect(maxAmountBigInt.toString()).toBe(maxBitcoinAmount)
    })

    it("should validate transaction hash formats", () => {
      const validTxHashes = [
        "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
        "ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      ]

      const invalidTxHashes = [
        "too_short",
        "way_too_long_hash_that_exceeds_64_characters_1234567890abcdef1234567890",
        "invalid_chars_!@#$%^&*()1234567890abcdef1234567890abcdef1234567890",
        "", // Empty
      ]

      validTxHashes.forEach(hash => {
        expect(hash).toHaveLength(64)
        expect(hash).toMatch(/^[0-9a-fA-F]+$/)
      })

      invalidTxHashes.forEach(hash => {
        expect(hash.length !== 64 || !/^[0-9a-fA-F]+$/.test(hash)).toBe(true)
      })
    })
  })
})