import type { Account } from "@near-js/accounts"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NearBridgeClient } from "../../src/clients/near.js"
import { addresses, setNetwork } from "../../src/config.js"
import type {
  BitcoinTransaction,
  BtcConnectorConfig,
  BtcDepositArgs,
} from "../../src/types/bitcoin.js"
import { ChainKind } from "../../src/types/chain.js"
import type { ZcashService } from "../../src/services/zcash.js"

// Set network to testnet for consistency
setNetwork("testnet")

// Test data from playground files and real transactions
const REAL_TEST_DATA = {
  // From playground-deposit.ts
  depositTxHash: "1f33f2668594bc29b1b4c3594b141a76f538429e0d2f1406cf135ba711d062d1",
  depositVout: 1,

  // From playground-withdraw.ts  
  withdrawAddress: "tb1q7jn2426dwpsf3xlasazzjuwcvayjn6fhlm2vjp",

  // Test account from playground
  testAccount: "bridge-sdk-test.testnet",
  bridgeContract: "omni.n-bridge.testnet",
  relayerAccount: "cosmosfirst.testnet",
}

// Mock Bitcoin transaction data based on real structure
const mockBitcoinTx: BitcoinTransaction = {
  txid: REAL_TEST_DATA.depositTxHash,
  version: 2,
  locktime: 0,
  vin: [
    {
      txid: "input_tx_hash_example",
      vout: 0,
      scriptsig: "473044022012345...",
      scriptsig_asm: "OP_PUSHBYTES_71 3044022012345... OP_PUSHBYTES_33 021234567890abcdef...",
      witness: [],
      is_coinbase: false,
      sequence: 4294967295,
    },
  ],
  vout: [
    {
      scriptpubkey: "76a914abcdef1234567890abcdef1234567890abcdef88ac",
      scriptpubkey_asm: "OP_DUP OP_HASH160 OP_PUSHBYTES_20 abcdef1234567890abcdef1234567890abcdef OP_EQUALVERIFY OP_CHECKSIG",
      scriptpubkey_type: "p2pkh",
      scriptpubkey_address: "mvd6qFeVkqH6MNAS2Y2cLifbdaX5XUkbZJ",
      value: 1000000, // 0.01 BTC in satoshis
    },
    {
      scriptpubkey: "0014abcdef1234567890abcdef1234567890abcdef12",
      scriptpubkey_asm: "OP_0 OP_PUSHBYTES_20 abcdef1234567890abcdef1234567890abcdef12",
      scriptpubkey_type: "v0_p2wpkh",
      scriptpubkey_address: REAL_TEST_DATA.withdrawAddress,
      value: 500000, // 0.005 BTC in satoshis
    },
  ],
  size: 250,
  weight: 1000,
  fee: 1000,
  status: {
    confirmed: true,
    block_height: 2800000,
    block_hash: "00000000000000000001234567890abcdef1234567890abcdef1234567890abc",
    block_time: 1640995200,
  },
}

const mockMerkleProof = {
  block_height: 2800000,
  merkle: [
    "hash1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
    "hash2345678901bcdef0123456789abcdef01234567890abcdef1234567890bc",
    "hash3456789012cdef01234567890abcdef123456789abcdef01234567890cd",
  ],
  pos: 42,
}

const mockBtcConnectorConfig: BtcConnectorConfig = {
  btc_light_client_account_id: "btc-light-client.testnet",
  nbtc_account_id: "nbtc.n-bridge.testnet",
  chain_signatures_account_id: "v1.signer-dev.testnet",
  chain_signatures_root_public_key: "secp256k1:3tFRbMqmoa6AAALMrEFAYCEYJCPT3FwyeAkMuLz6fwcmWfJL5FMAwOJpRAasRSXhZRp9LJ6e9U7xhNgwGaVFgtfVXj",
  change_address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
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


// Mock server setup
const BITCOIN_RPC_URL = "https://rpc.testnet.example.com"
const BITCOIN_API_URL = "https://btc.example.com/testnet/api"

const server = setupServer(
  // Bitcoin RPC endpoint
  http.post(BITCOIN_RPC_URL, async ({ request }) => {
    const body = (await request.json()) as { method: string; params?: unknown[] }
    if (body.method === "getrawtransaction") {
      const [txid] = (body.params ?? []) as [string]
      if (txid === REAL_TEST_DATA.depositTxHash) {
        return HttpResponse.json({
          jsonrpc: "2.0",
          id: "1",
          result: {
            blockhash: mockBitcoinTx.status?.block_hash,
            height: mockBitcoinTx.status?.block_height,
            hex: "0200000001abcdef1234567890abcdef1234567890abcdef12",
            vout: [
              { n: 0, value: 0.01 },
              { n: 1, value: 0.005 },
            ],
          },
        })
      }

      return HttpResponse.json({
        jsonrpc: "2.0",
        id: "1",
        error: { code: -5, message: "No such mempool or blockchain transaction" },
      })
    }

    if (body.method === "getblock") {
      return HttpResponse.json({
        jsonrpc: "2.0",
        id: "1",
        result: {
          tx: [REAL_TEST_DATA.depositTxHash, "b".repeat(64)],
          height: mockBitcoinTx.status?.block_height,
        },
      })
    }

    return HttpResponse.json({ jsonrpc: "2.0", id: "1", result: null })
  }),

  // Bitcoin API endpoints
  http.get(`${BITCOIN_API_URL}/tx/${REAL_TEST_DATA.depositTxHash}`, () => {
    return HttpResponse.json(mockBitcoinTx)
  }),

  http.get(`${BITCOIN_API_URL}/tx/${REAL_TEST_DATA.depositTxHash}/merkle-proof`, () => {
    return HttpResponse.json(mockMerkleProof)
  }),

  http.get(`${BITCOIN_API_URL}/tx/${REAL_TEST_DATA.depositTxHash}/hex`, () => {
    return new HttpResponse("0200000001abcdef1234567890abcdef1234567890abcdef12", {
      headers: { "Content-Type": "text/plain" },
    })
  }),

  http.post(`${BITCOIN_API_URL}/tx`, () => {
    return new HttpResponse("broadcast_bitcoin_tx_hash_example", {
      headers: { "Content-Type": "text/plain" },
    })
  }),

  // OmniBridge API endpoints will be set up per-test basis

  // NEAR contract call mocks would go here - for now we'll mock the wallet calls
)

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' })
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const originalBtcConfig = { ...addresses.btc }

beforeEach(() => {
  Object.assign(addresses.btc, {
    apiUrl: BITCOIN_API_URL,
    rpcUrl: BITCOIN_RPC_URL,
  })
})

afterAll(() => {
  Object.assign(addresses.btc, originalBtcConfig)
})

describe("NearBridgeClient Bitcoin Methods", () => {
  let mockWallet: Account
  let client: NearBridgeClient

  beforeEach(() => {
    // Create comprehensive mock wallet based on existing patterns
    mockWallet = {
      accountId: REAL_TEST_DATA.testAccount,
      connection: {
        networkId: "testnet",
        provider: {
          query: vi.fn(),
          sendTransaction: vi.fn(),
          txStatus: vi.fn(),
        },
      },

      // Mock the wallet methods used by NearBridgeClient
      signAndSendTransaction: vi.fn(),
      viewFunction: vi.fn(),
      functionCall: vi.fn(),
      provider: {
        viewTransactionStatus: vi.fn(),
        callFunction: vi.fn(),
      },
    } as any

    client = new NearBridgeClient(mockWallet, REAL_TEST_DATA.bridgeContract)

    // Mock the Bitcoin service's withdrawal planner to avoid complex transaction byte requirements
    client.bitcoinService.buildWithdrawalPlan = vi.fn().mockReturnValue({
      inputs: [
        "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890:0",
      ],
      outputs: [
        {
          value: 50000,
          script_pubkey: "0014aa0d9b",
        },
        {
          value: 45000,
          script_pubkey: "0014bb0d9b",
        },
      ],
      fee: 5000n,
    })

    client.bitcoinService.getDepositProof = vi.fn().mockResolvedValue({
      merkle_proof: ["hash1", "hash2"],
      tx_block_blockhash: "mock_block_hash",
      tx_bytes: [0, 1, 2],
      tx_index: 0,
      amount: 95_000n,
    })


  })

  describe("getUtxoBridgeConfig (btc)", () => {
    it("should fetch Bitcoin bridge configuration", async () => {
      // Mock the NEAR contract call via provider.callFunction (not viewFunction)
      mockWallet.provider.callFunction = vi.fn().mockResolvedValue(mockBtcConnectorConfig)

      const config = (await client.getUtxoBridgeConfig(ChainKind.Btc)) as BtcConnectorConfig

      expect(config).toEqual(mockBtcConnectorConfig)
      expect(config.min_deposit_amount).toBe("10000")
      expect(config.min_withdraw_amount).toBe("20000")
      expect(config.deposit_bridge_fee.fee_rate).toBe(0.002)
      expect(mockWallet.provider.callFunction).toHaveBeenCalledWith(
        "btc-connector.n-bridge.testnet", // from config.addresses.btc.btcConnector
        "get_config",
        {},
      )
    })

    it("should handle config fetch errors", async () => {
      mockWallet.provider.callFunction = vi.fn().mockRejectedValue(new Error("Contract not found"))

      await expect(client.getUtxoBridgeConfig(ChainKind.Btc)).rejects.toThrow("Contract not found")
    })
  })

  describe("getUtxoDepositAddress (btc)", () => {
    const mockDepositResponse = {
      deposit_address: "tb1qdeposit_address_example_for_recipient",
      recipient_id: REAL_TEST_DATA.testAccount,
    }

    it("should get Bitcoin deposit address for recipient", async () => {
      mockWallet.provider.callFunction = vi.fn().mockResolvedValue(mockDepositResponse.deposit_address)

      const result = await client.getUtxoDepositAddress(ChainKind.Btc, REAL_TEST_DATA.testAccount)

      expect(result.depositAddress).toBe(mockDepositResponse.deposit_address)
      expect(result.depositArgs.deposit_msg.recipient_id).toBe(REAL_TEST_DATA.testAccount)

      expect(mockWallet.provider.callFunction).toHaveBeenCalledWith(
        "btc-connector.n-bridge.testnet",
        "get_user_deposit_address",
        {
          deposit_msg: {
            recipient_id: REAL_TEST_DATA.testAccount,
          },
        },
      )
    })

    it("should handle invalid recipient ID", async () => {
      mockWallet.provider.callFunction = vi.fn().mockRejectedValue(new Error("Invalid account ID"))

      await expect(client.getUtxoDepositAddress(ChainKind.Btc, "invalid.account")).rejects.toThrow(
        "Invalid account ID"
      )
    })

    it("should work with different recipient types", async () => {
      const recipients = [
        "user1.testnet",
        "a".repeat(64) + ".testnet", // Long account ID
        "sub.account.testnet", // Nested account
      ]

      for (const recipient of recipients) {
        mockWallet.provider.callFunction = vi.fn().mockResolvedValue(`tb1q${recipient.slice(0, 10)}`)

        const result = await client.getUtxoDepositAddress(ChainKind.Btc, recipient)
        expect(result.depositArgs.deposit_msg.recipient_id).toBe(recipient)
      }
    })
  })

  describe("UTXO helpers", () => {
    it("should surface unified UTXO deposit address API", async () => {
      mockWallet.provider.callFunction = vi.fn().mockResolvedValue("tb1qunified")

      const result = await client.getUtxoDepositAddress(ChainKind.Btc, REAL_TEST_DATA.testAccount)

      expect(result.depositAddress).toBe("tb1qunified")
      expect(result.depositArgs).toEqual({ deposit_msg: { recipient_id: REAL_TEST_DATA.testAccount } })
    })

    it("should throw for unsupported UTXO chains", async () => {
      await expect(
        // @ts-expect-error - deliberately incorrect chain for runtime guard
        client.getUtxoDepositAddress("doge", REAL_TEST_DATA.testAccount),
      ).rejects.toThrow("Unsupported UTXO chain")
    })
  })

  describe("finalizeBitcoinDeposit", () => {
    const mockBtcDepositArgs: BtcDepositArgs = {
      deposit_msg: {
        recipient_id: REAL_TEST_DATA.testAccount,
      },
    }

    it("should finalize Bitcoin deposit with real transaction data", async () => {
      // Mock getUtxoBridgeConfig for amount validation
      mockWallet.provider.callFunction = vi.fn().mockResolvedValue(mockBtcConnectorConfig)

      const mockTransactionResult = {
        transaction: { hash: "near_finalize_tx_hash" },
        receipts_outcome: [],
      }

      mockWallet.signAndSendTransaction = vi.fn().mockResolvedValue(mockTransactionResult)

      const result = await client.finalizeUtxoDeposit(
        ChainKind.Btc,
        REAL_TEST_DATA.depositTxHash,
        REAL_TEST_DATA.depositVout,
        mockBtcDepositArgs
      )

      expect(result).toBe("near_finalize_tx_hash")

      // Verify the call was made with correct receiverId
      expect(mockWallet.signAndSendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          receiverId: "btc-connector.n-bridge.testnet",
          actions: expect.arrayContaining([
            expect.objectContaining({
              functionCall: expect.objectContaining({
                methodName: "verify_deposit"
              })
            })
          ])
        })
      )
    })

    it("should throw error for unconfirmed Bitcoin transaction", async () => {
      mockWallet.provider.callFunction = vi.fn().mockResolvedValue(mockBtcConnectorConfig)
      vi.spyOn(client.bitcoinService, "getDepositProof").mockRejectedValue(
        new Error("UTXO: Transaction not confirmed"),
      )

      await expect(
        client.finalizeUtxoDeposit(
          ChainKind.Btc,
          REAL_TEST_DATA.depositTxHash,
          REAL_TEST_DATA.depositVout,
          mockBtcDepositArgs
        )
      ).rejects.toThrow("UTXO: Transaction not confirmed")
    })

    it("should handle different vout values", async () => {
      // Mock getUtxoBridgeConfig for amount validation
      mockWallet.provider.callFunction = vi.fn().mockResolvedValue(mockBtcConnectorConfig)

      mockWallet.signAndSendTransaction = vi.fn().mockResolvedValue({
        transaction: { hash: "test_hash" },
      })

      for (const vout of [0, 1]) { // Only test valid vout indices that exist in mockBitcoinTx
        await client.finalizeUtxoDeposit(
          ChainKind.Btc,
          REAL_TEST_DATA.depositTxHash,
          vout,
          mockBtcDepositArgs
        )

        expect(mockWallet.signAndSendTransaction).toHaveBeenCalledWith(
          expect.objectContaining({
            receiverId: "btc-connector.n-bridge.testnet",
            actions: [
              expect.objectContaining({
                functionCall: expect.objectContaining({
                  methodName: "verify_deposit",
                }),
              }),
            ],
          })
        )
      }
    })
  })

  describe("initUtxoWithdrawal (btc)", () => {
    it("should initialize Bitcoin withdrawal", async () => {
      // Mock the required dependencies for initUtxoWithdrawal
      const validTxid = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
      const mockUTXOs = [
        {
          path: "m/44'/1'/0'/0/0",
          tx_bytes: new Uint8Array([2, 0, 0, 0, 1]),
          vout: 0,
          balance: "100000",
          txid: validTxid,
        },
      ]

      // Mock provider.callFunction to handle different contract calls
      mockWallet.provider.callFunction = vi.fn()
        .mockImplementation((contractId: string, methodName: string) => {
          if (methodName === "get_utxos_paged") {
            return Promise.resolve({
              [`${validTxid}@0`]: {
                path: mockUTXOs[0].path,
                tx_bytes: mockUTXOs[0].tx_bytes,
                vout: mockUTXOs[0].vout,
                balance: mockUTXOs[0].balance,
                // Note: txid will be extracted from the key by getAvailableUTXOs
              }
            })
          }
          if (methodName === "get_config") {
            return Promise.resolve(mockBtcConnectorConfig)
          }
          return Promise.resolve({})
        })

      const mockNearTxResult = {
        transaction: { hash: "near_init_tx_hash" },
        receipts_outcome: [
          {
            outcome: {
              logs: [
                'EVENT_JSON:{"standard":"nep297","version":"1.0.0","event":"generate_btc_pending_info","data":[{"btc_pending_id":"pending_btc_12345"}]}',
              ],
            },
          },
        ],
      }

      mockWallet.signAndSendTransaction = vi.fn().mockResolvedValue(mockNearTxResult)

      const result = await client.initUtxoWithdrawal(ChainKind.Btc,
        REAL_TEST_DATA.withdrawAddress,
        BigInt(50000) // 50,000 satoshis
      )

      expect(result.pendingId).toBe("pending_btc_12345")
      expect(result.nearTxHash).toBe("near_init_tx_hash")

      // Verify the transaction was called with correct receiver ID
      expect(mockWallet.signAndSendTransaction).toHaveBeenCalled()
      const calls = (mockWallet.signAndSendTransaction as any).mock.calls
      expect(calls[0][0].receiverId).toBe("nbtc.n-bridge.testnet")
      expect(calls[0][0].actions).toHaveLength(1)
      expect(calls[0][0].actions[0]?.functionCall?.methodName).toBe("ft_transfer_call")
    })

    it("should throw error when pending ID not found in logs", async () => {
      // Mock the required dependencies
      const validTxid = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
      mockWallet.provider.callFunction = vi.fn()
        .mockImplementation((contractId: string, methodName: string) => {
          if (methodName === "get_utxos_paged") {
            return Promise.resolve({
              [`${validTxid}@0`]: {
                path: "m/44'/1'/0'/0/0",
                tx_bytes: new Uint8Array([2, 0, 0, 0, 1]),
                vout: 0,
                balance: "100000"
              }
            })
          }
          if (methodName === "get_config") {
            return Promise.resolve(mockBtcConnectorConfig)
          }
          return Promise.resolve({})
        })

      const mockNearTxResult = {
        transaction: { hash: "near_init_tx_hash" },
        receipts_outcome: [
          {
            outcome: {
              logs: ["Some other log without pending info"],
            },
          },
        ],
      }

      mockWallet.signAndSendTransaction = vi.fn().mockResolvedValue(mockNearTxResult)

      await expect(
        client.initUtxoWithdrawal(ChainKind.Btc, REAL_TEST_DATA.withdrawAddress, BigInt(50000))
      ).rejects.toThrow("Bitcoin: Pending transaction not found in NEAR logs")
    })

    it("should validate minimum withdrawal amounts", async () => {
      // Mock the required dependencies
      const validTxid = "2345678901abcdef2345678901abcdef2345678901abcdef2345678901abcdef"
      mockWallet.provider.callFunction = vi.fn()
        .mockImplementation((contractId: string, methodName: string) => {
          if (methodName === "get_utxos_paged") {
            return Promise.resolve({
              [`${validTxid}@0`]: {
                path: "m/44'/1'/0'/0/0",
                tx_bytes: new Uint8Array([2, 0, 0, 0, 1]),
                vout: 0,
                balance: "200000"
              }
            })
          }
          if (methodName === "get_config") {
            return Promise.resolve(mockBtcConnectorConfig)
          }
          return Promise.resolve({})
        })

      // This would ideally check against the bridge config minimums
      // For now, we test that the method accepts valid amounts
      const mockNearTxResult = {
        transaction: { hash: "test" },
        receipts_outcome: [
          {
            outcome: {
              logs: [
                'EVENT_JSON:{"standard":"nep297","version":"1.0.0","event":"generate_btc_pending_info","data":[{"btc_pending_id":"test_pending"}]}',
              ],
            },
          },
        ],
      }

      mockWallet.signAndSendTransaction = vi.fn().mockResolvedValue(mockNearTxResult)

    const result = await client.initUtxoWithdrawal(ChainKind.Btc,
      REAL_TEST_DATA.withdrawAddress,
      BigInt(100000) // Larger amount
    )

    expect(result.pendingId).toBe("test_pending")
    expect(result.nearTxHash).toBe("test")
    })

    it("should include Bitcoin label when change address is missing", async () => {
      const configSpy = vi
        .spyOn(client, "getUtxoBridgeConfig")
        .mockResolvedValue({
          ...mockBtcConnectorConfig,
          change_address: "",
        })
      const utxoSpy = vi
        .spyOn(client, "getUtxoAvailableOutputs")
        .mockResolvedValue([
          {
            path: "m/44'/1'/0'/0/0",
            tx_bytes: new Uint8Array([2, 0, 0, 0, 1]),
            vout: 0,
            balance: "90000",
            txid: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          },
        ])

      await expect(
        client.initUtxoWithdrawal(ChainKind.Btc, REAL_TEST_DATA.withdrawAddress, BigInt(40000)),
      ).rejects.toThrow("Bitcoin: Bridge configuration is missing change address")

      configSpy.mockRestore()
      utxoSpy.mockRestore()
    })

    it("should forward bridge config overrides to the planner", async () => {
      const configSpy = vi
        .spyOn(client, "getUtxoBridgeConfig")
        .mockResolvedValue({
          ...mockBtcConnectorConfig,
          min_change_amount: "4321",
          max_withdrawal_input_number: 1,
        })
      const utxoSpy = vi
        .spyOn(client, "getUtxoAvailableOutputs")
        .mockResolvedValue([
          {
            path: "m/44'/1'/0'/0/0",
            tx_bytes: new Uint8Array([2, 0, 0, 0, 1]),
            vout: 0,
            balance: "100000",
            txid: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          },
        ])

      const planSpy = vi
        .spyOn(client.bitcoinService, "buildWithdrawalPlan")
        .mockImplementation((...args) => {
          return {
            inputs: ["ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff:0"],
            outputs: [
              { value: 20000, script_pubkey: "0014aa" },
              { value: 18000, script_pubkey: "0014bb" },
            ],
            fee: 1000n,
          }
        })

      mockWallet.signAndSendTransaction = vi.fn().mockResolvedValue({
        transaction: { hash: "init-override" },
        receipts_outcome: [
          {
            outcome: {
              logs: [
                'EVENT_JSON:{"standard":"nep297","version":"1.0.0","event":"generate_btc_pending_info","data":[{"btc_pending_id":"override_pending"}]}',
              ],
            },
          },
        ],
      })

      const result = await client.initUtxoWithdrawal(
        ChainKind.Btc,
        REAL_TEST_DATA.withdrawAddress,
        BigInt(20000),
      )

      expect(result.pendingId).toBe("override_pending")
      expect(planSpy).toHaveBeenCalled()
      const overrides = planSpy.mock.calls[0][5]
      expect(overrides).toMatchObject({ dustThreshold: 4321n, minChange: 4321n, maxInputs: 1 })

      planSpy.mockRestore()
      configSpy.mockRestore()
      utxoSpy.mockRestore()
    })
  })

  describe("waitForUtxoTransactionSigning (btc)", () => {

    it("should wait for and find Bitcoin transaction signing", async () => {
      // Set up specific mock for this test
      server.use(
        http.get("https://testnet.api.bridge.nearone.org/api/v2/transfers/transfer", ({ request }) => {
          const url = new URL(request.url)
          const transactionHash = url.searchParams.get("transaction_hash")

          if (transactionHash === "test_pending_bitcoin_123") {
            return HttpResponse.json([
              {
                id: null,
                initialized: {
                  NearReceipt: {
                    block_height: 123,
                    block_timestamp_seconds: 123,
                    transaction_hash: "test_pending_bitcoin_123"
                  }
                },
                signed: {
                  NearReceipt: {
                    block_height: 1234,
                    block_timestamp_seconds: 1234,
                    transaction_hash: "near_signing_tx_hash_12345"
                  }
                },
                updated_fee: [],
                fast_finalised_on_near: null,
                finalised_on_near: null,
                fast_finalised: null,
                finalised: null,
                claimed: null,
                transfer_message: null,
                utxo_transfer: null,
              }
            ])
          }

          // Return empty array for other transaction hashes
          return HttpResponse.json([])
        })
      )

      const nearTxHash = await client.waitForUtxoTransactionSigning(ChainKind.Btc,
        "test_pending_bitcoin_123",
        1, // Only 1 attempt for testing
        100 // Short delay
      )

      expect(nearTxHash).toBe("near_signing_tx_hash_12345")
    })

    it("should use default parameters when not specified", async () => {
      // Set up specific mock for this test
      server.use(
        http.get("https://testnet.api.bridge.nearone.org/api/v2/transfers/transfer", ({ request }) => {
          const url = new URL(request.url)
          const transactionHash = url.searchParams.get("transaction_hash")

          if (transactionHash === "test_pending_bitcoin_123") {
            return HttpResponse.json([
              {
                id: null,
                initialized: {
                  NearReceipt: {
                    block_height: 123,
                    block_timestamp_seconds: 123,
                    transaction_hash: "test_pending_bitcoin_123"
                  }
                },
                signed: {
                  NearReceipt: {
                    block_height: 1234,
                    block_timestamp_seconds: 1234,
                    transaction_hash: "near_signing_tx_hash_12345"
                  }
                },
                updated_fee: [],
                fast_finalised_on_near: null,
                finalised_on_near: null,
                fast_finalised: null,
                finalised: null,
                claimed: null,
                transfer_message: null,
                utxo_transfer: null,
              }
            ])
          }

          // Return empty array for other transaction hashes
          return HttpResponse.json([])
        })
      )

      const nearTxHash = await client.waitForUtxoTransactionSigning(ChainKind.Btc,
        "test_pending_bitcoin_123"
      )

      expect(nearTxHash).toBe("near_signing_tx_hash_12345")
    })

    it("should timeout after max attempts", async () => {
      // Set up specific mock for this test that returns empty array for the nonexistent pending ID
      server.use(
        http.get("https://testnet.api.bridge.nearone.org/api/v2/transfers/transfer", ({ request }) => {
          const url = new URL(request.url)
          const transactionHash = url.searchParams.get("transaction_hash")

          if (transactionHash === "nonexistent_pending_id") {
            // Return empty array to simulate not found
            return HttpResponse.json([])
          }

          // Return empty array for other transaction hashes too
          return HttpResponse.json([])
        })
      )

      await expect(
        client.waitForUtxoTransactionSigning(ChainKind.Btc,
          "nonexistent_pending_id",
          2, // 2 attempts
          50 // 50ms delay
        )
      ).rejects.toThrow(/Bitcoin: Transaction signing not found after 2 attempts/)
    })

    it("should handle OmniBridge API errors", async () => {
      server.use(
        http.get("https://testnet.api.bridge.nearone.org/api/v2/transfers/transfer", () => {
          return new HttpResponse("Server Error", { status: 500 })
        })
      )

      await expect(
        client.waitForUtxoTransactionSigning(ChainKind.Btc, "test_pending", 1, 100)
      ).rejects.toThrow(/Bitcoin: Transaction signing not found/)
    })
  })

  describe("finalizeUtxoWithdrawal (btc)", () => {
    it("should finalize Bitcoin withdrawal and broadcast transaction", async () => {
      const mockNearTxStatus = {
        receipts_outcome: [
          {
            outcome: {
              logs: [
                'EVENT_JSON:{"standard":"nep297","event":"signed_btc_transaction","data":[{"tx_bytes":[2,0,0,0,1,171,205,239,18,52,86,120,144]}]}',
              ],
            },
          },
        ],
      }

      mockWallet.provider.viewTransactionStatus = vi.fn().mockResolvedValue(mockNearTxStatus)

      const bitcoinTxHash = await client.finalizeUtxoWithdrawal(ChainKind.Btc, "near_signing_tx_hash_12345")

      expect(bitcoinTxHash).toBe("broadcast_bitcoin_tx_hash_example")
      expect(mockWallet.provider.viewTransactionStatus).toHaveBeenCalledWith(
        "near_signing_tx_hash_12345",
        REAL_TEST_DATA.testAccount,
        "FINAL"
      )
    })

    it("should throw error when signed transaction not found in logs", async () => {
      const mockNearTxStatus = {
        receipts_outcome: [
          {
            outcome: {
              logs: ["Some other log without signed transaction"],
            },
          },
        ],
      }

      mockWallet.provider.viewTransactionStatus = vi.fn().mockResolvedValue(mockNearTxStatus)

      await expect(client.finalizeUtxoWithdrawal(ChainKind.Btc, "invalid_tx_hash")).rejects.toThrow(
        "Bitcoin: Signed transaction not found in NEAR logs"
      )
    })
  })

  describe("executeUtxoWithdrawal (btc)", () => {
    it("should execute complete Bitcoin withdrawal flow", async () => {
      // Set up specific mock for this test with correct transaction hash mapping
      server.use(
        http.get("https://testnet.api.bridge.nearone.org/api/v2/transfers/transfer", ({ request }) => {
          const url = new URL(request.url)
          const transactionHash = url.searchParams.get("transaction_hash")

          if (transactionHash === "init_tx_hash") {
            return HttpResponse.json([
              {
                id: null,
                initialized: {
                  NearReceipt: {
                    block_height: 123,
                    block_timestamp_seconds: 123,
                    transaction_hash: "init_tx_hash"
                  }
                },
                signed: {
                  NearReceipt: {
                    block_height: 1234,
                    block_timestamp_seconds: 1234,
                    transaction_hash: "e2e_near_signing_hash"
                  }
                },
                updated_fee: [],
                fast_finalised_on_near: null,
                finalised_on_near: null,
                fast_finalised: null,
                finalised: null,
                claimed: null,
                transfer_message: null,
                utxo_transfer: null,
              }
            ])
          }

          // Return empty array for other transaction hashes
          return HttpResponse.json([])
        })
      )

      // Mock the required dependencies for initUtxoWithdrawal
      const validTxid = "5678901234abcdef5678901234abcdef5678901234abcdef5678901234abcdef"
      mockWallet.provider.callFunction = vi.fn()
        .mockImplementation((contractId: string, methodName: string) => {
          if (methodName === "get_utxos_paged") {
            return Promise.resolve({
              [`${validTxid}@0`]: {
                path: "m/44'/1'/0'/0/0",
                tx_bytes: new Uint8Array([2, 0, 0, 0, 1]),
                vout: 0,
                balance: "100000"
              }
            })
          }
          if (methodName === "get_config") {
            return Promise.resolve(mockBtcConnectorConfig)
          }
          return Promise.resolve({})
        })

      // Mock init withdrawal
      const mockInitResult = {
        transaction: { hash: "init_tx_hash" },
        receipts_outcome: [
          {
            outcome: {
              logs: [
                'EVENT_JSON:{"standard":"nep297","version":"1.0.0","event":"generate_btc_pending_info","data":[{"btc_pending_id":"e2e_pending_123"}]}',
              ],
            },
          },
        ],
      }

      // Mock finalize withdrawal
      const mockFinalizeStatus = {
        receipts_outcome: [
          {
            outcome: {
              logs: [
                'EVENT_JSON:{"event":"signed_btc_transaction","data":[{"tx_bytes":[2,0,0,0,1,171,205,239]}]}',
              ],
            },
          },
        ],
      }

      mockWallet.signAndSendTransaction = vi.fn().mockResolvedValue(mockInitResult)
      mockWallet.provider.viewTransactionStatus = vi.fn().mockResolvedValue(mockFinalizeStatus)

      const bitcoinTxHash = await client.executeUtxoWithdrawal(ChainKind.Btc,
        REAL_TEST_DATA.withdrawAddress,
        BigInt(75000),
        1, // Only 1 attempt for testing
        50 // Short delay
      )

      expect(bitcoinTxHash).toBe("broadcast_bitcoin_tx_hash_example")

      // Verify all steps were called
      expect(mockWallet.signAndSendTransaction).toHaveBeenCalledTimes(1)
      expect(mockWallet.provider.viewTransactionStatus).toHaveBeenCalledWith(
        "e2e_near_signing_hash",
        REAL_TEST_DATA.testAccount,
        "FINAL"
      )
    })

    it("should handle errors in any step of the flow", async () => {
      // Mock the required dependencies
      const validTxid = "6789012345abcdef6789012345abcdef6789012345abcdef6789012345abcdef"
      mockWallet.provider.callFunction = vi.fn()
        .mockImplementation((contractId: string, methodName: string) => {
          if (methodName === "get_utxos_paged") {
            return Promise.resolve({
              [`${validTxid}@0`]: {
                path: "m/44'/1'/0'/0/0",
                tx_bytes: new Uint8Array([2, 0, 0, 0, 1]),
                vout: 0,
                balance: "100000"
              }
            })
          }
          if (methodName === "get_config") {
            return Promise.resolve(mockBtcConnectorConfig)
          }
          return Promise.resolve({})
        })

      // Mock init withdrawal failure
      mockWallet.signAndSendTransaction = vi.fn().mockRejectedValue(new Error("Init failed"))

      await expect(
        client.executeUtxoWithdrawal(ChainKind.Btc, REAL_TEST_DATA.withdrawAddress, BigInt(50000))
      ).rejects.toThrow("Init failed")
    })
  })

  describe("Input Validation", () => {
    it("should validate Bitcoin addresses", async () => {
      const invalidAddresses = [
        "invalid_address",
        "bc1qmainnet_on_testnet", // Wrong network
        "",
        "tb1qtoo_short",
      ]

      for (const address of invalidAddresses) {
        // The validation would happen in the Bitcoin service addressToScriptPubkey
        // which is called during withdrawal initialization
        expect(() => {
          client.bitcoinService.addressToScriptPubkey(address)
        }).toThrow(/Bitcoin: Failed to convert address to script_pubkey/)
      }
    })

    it("should handle very large amounts", async () => {
      // Mock the required dependencies
      const validTxid = "3456789012abcdef3456789012abcdef3456789012abcdef3456789012abcdef"
      mockWallet.provider.callFunction = vi.fn()
        .mockImplementation((contractId: string, methodName: string) => {
          if (methodName === "get_utxos_paged") {
            return Promise.resolve({
              [`${validTxid}@0`]: {
                path: "m/44'/1'/0'/0/0",
                tx_bytes: new Uint8Array([2, 0, 0, 0, 1]),
                vout: 0,
                balance: "10000000000"
              }
            })
          }
          if (methodName === "get_config") {
            return Promise.resolve(mockBtcConnectorConfig)
          }
          return Promise.resolve({})
        })

      const mockResult = {
        transaction: { hash: "test" },
        receipts_outcome: [{
          outcome: { logs: ['EVENT_JSON:{"standard":"nep297","version":"1.0.0","event":"generate_btc_pending_info","data":[{"btc_pending_id":"large_amount_test"}]}'] }
        }],
      }

      mockWallet.signAndSendTransaction = vi.fn().mockResolvedValue(mockResult)

      const result = await client.initUtxoWithdrawal(ChainKind.Btc,
        REAL_TEST_DATA.withdrawAddress,
        BigInt("2100000000000000") // Close to max Bitcoin supply in sats
      )

      expect(result.pendingId).toBe("large_amount_test")
      expect(result.nearTxHash).toBe("test")
    })

    it("should handle minimum amounts", async () => {
      // Mock the required dependencies
      const validTxid = "4567890123abcdef4567890123abcdef4567890123abcdef4567890123abcdef"
      mockWallet.provider.callFunction = vi.fn()
        .mockImplementation((contractId: string, methodName: string) => {
          if (methodName === "get_utxos_paged") {
            return Promise.resolve({
              [`${validTxid}@0`]: {
                path: "m/44'/1'/0'/0/0",
                tx_bytes: new Uint8Array([2, 0, 0, 0, 1]),
                vout: 0,
                balance: "100000"
              }
            })
          }
          if (methodName === "get_config") {
            return Promise.resolve(mockBtcConnectorConfig)
          }
          return Promise.resolve({})
        })

      const mockResult = {
        transaction: { hash: "test" },
        receipts_outcome: [{
          outcome: { logs: ['EVENT_JSON:{"standard":"nep297","version":"1.0.0","event":"generate_btc_pending_info","data":[{"btc_pending_id":"min_amount_test"}]}'] }
        }],
      }

      mockWallet.signAndSendTransaction = vi.fn().mockResolvedValue(mockResult)

      // Test with amount that meets minimum requirement (min_withdraw_amount is "20000")
      const result = await client.initUtxoWithdrawal(ChainKind.Btc,
        REAL_TEST_DATA.withdrawAddress,
        BigInt(20000) // Use minimum withdrawal amount
      )

      expect(result.pendingId).toBe("min_amount_test")
      expect(result.nearTxHash).toBe("test")
    })

    it("should validate and reject amounts below minimum", async () => {
      // Mock the required dependencies
      const validTxid = "5678901234abcdef5678901234abcdef5678901234abcdef5678901234abcdef"
      mockWallet.provider.callFunction = vi.fn()
        .mockImplementation((contractId: string, methodName: string) => {
          if (methodName === "get_utxos_paged") {
            return Promise.resolve({
              [`${validTxid}@0`]: {
                path: "m/44'/1'/0'/0/0",
                tx_bytes: new Uint8Array([2, 0, 0, 0, 1]),
                vout: 0,
                balance: "100000"
              }
            })
          }
          if (methodName === "get_config") {
            return Promise.resolve(mockBtcConnectorConfig)
          }
          return Promise.resolve({})
        })

      // Test with amount below minimum withdrawal amount
      await expect(
        client.initUtxoWithdrawal(ChainKind.Btc,
          REAL_TEST_DATA.withdrawAddress,
          BigInt(1) // 1 satoshi, well below minimum of 20000
        )
      ).rejects.toThrow(/Amount 1 is below minimum withdrawal amount 20000/)

      // Test with amount just below minimum
      await expect(
        client.initUtxoWithdrawal(ChainKind.Btc,
          REAL_TEST_DATA.withdrawAddress,
          BigInt(19999) // Just below minimum of 20000
        )
      ).rejects.toThrow(/Amount 19999 is below minimum withdrawal amount 20000/)
    })
  })

  describe("Network Configuration", () => {
    it("should work with testnet configuration", () => {
      // Already testing with testnet - verify config is correct
      expect((mockWallet as any).connection.networkId).toBe("testnet")
      // Note: lockerAddress is private, so we test the behavior instead
    })

    it("should decode testnet Bitcoin addresses", () => {
      const script = client.bitcoinService.addressToScriptPubkey(REAL_TEST_DATA.withdrawAddress)
      expect(typeof script).toBe("string")
      expect(script).toMatch(/^[0-9a-f]+$/)
      expect(script.length).toBeGreaterThan(0)
    })
  })
})
