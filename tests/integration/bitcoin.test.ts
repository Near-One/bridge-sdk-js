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
  NearBlocksReceiptsResponse,
} from "../../src/types/bitcoin.js"
import { ChainKind } from "../../src/types/chain.js"

/**
 * Bitcoin Integration Tests
 * 
 * These tests verify the complete Bitcoin deposit and withdrawal flows
 * using real transaction data from the playground files. They test:
 * 
 * 1. End-to-end deposit flow with real Bitcoin transaction data
 * 2. End-to-end withdrawal flow with MPC signing simulation 
 * 3. Error scenarios and edge cases
 * 4. Cross-chain integration within broader bridge context
 * 
 * The tests use data from actual Bitcoin testnet transactions to ensure
 * compatibility with real-world scenarios.
 */

setNetwork("testnet")

// Mock Bitcoin transaction bytes (minimal valid transaction)
const MOCK_TX_BYTES = new Uint8Array([
  2, 0, 0, 0, // version
  1, // input count
  // input 0
  0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd, 0xef, 0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd, 0xef,
  0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd, 0xef, 0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd, 0xef, // prevout hash
  0, 0, 0, 0, // prevout index
  0, // script length
  0xff, 0xff, 0xff, 0xff, // sequence
  1, // output count
  0x40, 0x42, 0x0f, 0x00, 0x00, 0x00, 0x00, 0x00, // value (1000000 sats)
  0x19, // script length (25 bytes)
  0x76, 0xa9, 0x14, 0x89, 0xab, 0xcd, 0xef, 0xab, 0xba, 0xab, 0xba, 0xab, 0xba, 0xab, 0xba, 0xab, 0xba, 0xab, 0xba, 0xab, 0xba, 0xab, 0xba, 0x88, 0xac, // P2PKH script
  0, 0, 0, 0 // locktime
])

// Real data from playground files
const REAL_WITHDRAWAL_DATA = {
  // From playground-deposit.ts - Real Bitcoin testnet transaction
  realDepositTx: "1f33f2668594bc29b1b4c3594b141a76f538429e0d2f1406cf135ba711d062d1",
  realDepositVout: 1,
  
  // From playground-withdraw.ts - Real testnet address
  realWithdrawAddress: "tb1q7jn2426dwpsf3xlasazzjuwcvayjn6fhlm2vjp",
  
  // Playground config
  testAccount: "bridge-sdk-test.testnet",
  bridgeContract: "omni.n-bridge.testnet",
  relayerAccount: "cosmosfirst.testnet",
  
  // Real config values that would be returned by get_config
  minDepositAmount: "10000", // 10,000 sats
  minWithdrawAmount: "20000", // 20,000 sats
}

// Mock real Bitcoin transaction data based on the actual transaction structure
const mockRealBitcoinTx: BitcoinTransaction = {
  txid: REAL_WITHDRAWAL_DATA.realDepositTx,
  version: 2,
  locktime: 2790000, // Real locktime from Bitcoin testnet
  vin: [
    {
      txid: "f1e2d3c4b5a6978869504132210fedcba9876543210fedcba987654321abcdef",
      vout: 0,
      scriptsig: "473044022012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678",
      scriptsig_asm: "OP_PUSHBYTES_71 3044022012345... OP_PUSHBYTES_33 02123456789...",
      witness: [],
      is_coinbase: false,
      sequence: 4294967294, // RBF enabled
    },
  ],
  vout: [
    {
      // Output 0: Change back to sender  
      scriptpubkey: "76a914sender_address_hash160_placeholder_20bytes88ac",
      scriptpubkey_asm: "OP_DUP OP_HASH160 OP_PUSHBYTES_20 sender_address_hash160... OP_EQUALVERIFY OP_CHECKSIG",
      scriptpubkey_type: "p2pkh",
      scriptpubkey_address: "mvSenderAddress123TestnetExample",
      value: 990000, // Change amount
    },
    {
      // Output 1: Deposit to bridge (this is what we're depositing)
      scriptpubkey: "0014bridge_deposit_address_hash160_20bytes",
      scriptpubkey_asm: "OP_0 OP_PUSHBYTES_20 bridge_deposit_address_hash160_20bytes",
      scriptpubkey_type: "v0_p2wpkh",
      scriptpubkey_address: "tb1qrp33g0a4c5tg0hdx5jq6sjz5jh4t9q6s3v6x3zl",
      value: 50000, // 50,000 sats deposit amount
    },
  ],
  size: 225,
  weight: 900,
  fee: 2000,
  status: {
    confirmed: true,
    block_height: 2800000,
    block_hash: "00000000000000000012345678901234567890abcdef1234567890abcdef12",
    block_time: 1640995200,
  },
}

const mockRealMerkleProof = {
  block_height: 2800000,
  merkle: [
    "merkle_sibling_hash_1_64_characters_0123456789abcdef0123456789abcdef",
    "merkle_sibling_hash_2_64_characters_fedcba9876543210fedcba9876543210",
    "merkle_sibling_hash_3_64_characters_abcdef0123456789abcdef0123456789",
  ],
  pos: 15, // Position in block
}

const UNKNOWN_TX_ID = "0".repeat(64)
const UNCONFIRMED_TX_ID = "1".repeat(64)

const mockRealBtcConfig: BtcConnectorConfig = {
  btc_light_client_account_id: "btc-light-client.testnet",
  nbtc_account_id: "nbtc.n-bridge.testnet",
  chain_signatures_account_id: "v1.signer-dev.testnet",
  chain_signatures_root_public_key: "secp256k1:3tFRbMqmoa6AAALMrEFAYCEYJCPT3FwyeAkMuLz6fwcmWfJL5FMAwOJpRAasRSXhZRp9LJ6e9U7xhNgwGaVFgtfVXj",
  change_address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
  confirmations_strategy: { "10000": 1, "100000": 3, "1000000": 6 },
  confirmations_delta: 0,
  deposit_bridge_fee: {
    fee_min: "1000",
    fee_rate: 20,
    protocol_fee_rate: 10,
  },
  withdraw_bridge_fee: {
    fee_min: "2000",
    fee_rate: 30,
    protocol_fee_rate: 15,
  },
  min_deposit_amount: REAL_WITHDRAWAL_DATA.minDepositAmount,
  min_withdraw_amount: REAL_WITHDRAWAL_DATA.minWithdrawAmount,
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


// Mock server for external APIs
const BITCOIN_RPC_URL = "https://rpc.testnet.example.com"
const BITCOIN_API_URL = "https://btc.example.com/testnet/api"

const server = setupServer(
  http.post(BITCOIN_RPC_URL, async ({ request }) => {
    const body = (await request.json()) as {
      method: string
      params?: unknown[]
    }

    if (body.method === "getrawtransaction") {
      const [txid] = (body.params ?? []) as [string]
      if (txid === REAL_WITHDRAWAL_DATA.realDepositTx) {
        return HttpResponse.json({
          jsonrpc: "2.0",
          id: "1",
            result: {
              blockhash: mockRealBitcoinTx.status?.block_hash,
              height: mockRealBitcoinTx.status?.block_height,
              hex: "0200000001f1e2d3c4b5a6978869504132210fedcba9876543210fedcba987654321abcdef00000000",
              vout: [
              { n: 0, value: 0.005 },
              { n: 1, value: 0.0005 },
              ],
            },
          })
      }
      if (txid === UNCONFIRMED_TX_ID) {
        return HttpResponse.json({
          jsonrpc: "2.0",
          id: "1",
          result: {
            hex: "0200000001abcdef",
            vout: [{ n: 0, value: 0.001 }],
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
          tx: [REAL_WITHDRAWAL_DATA.realDepositTx, "b".repeat(64)],
          height: mockRealBitcoinTx.status?.block_height,
        },
      })
    }

    return HttpResponse.json({ jsonrpc: "2.0", id: "1", result: null })
  }),

  // Real Bitcoin transaction endpoints
  http.get(`${BITCOIN_API_URL}/tx/${REAL_WITHDRAWAL_DATA.realDepositTx}`, () => {
    return HttpResponse.json(mockRealBitcoinTx)
  }),

  http.get(`${BITCOIN_API_URL}/tx/${REAL_WITHDRAWAL_DATA.realDepositTx}/merkle-proof`, () => {
    return HttpResponse.json(mockRealMerkleProof)
  }),

  http.get(`${BITCOIN_API_URL}/tx/${REAL_WITHDRAWAL_DATA.realDepositTx}/hex`, () => {
    // Simplified hex representation
    return new HttpResponse("0200000001f1e2d3c4b5a6978869504132210fedcba9876543210fedcba987654321abcdef00000000", {
      headers: { "Content-Type": "text/plain" },
    })
  }),

  // Bitcoin broadcast endpoint
  http.post(`${BITCOIN_API_URL}/tx`, () => {
    return new HttpResponse("broadcast_real_bitcoin_withdrawal_tx_hash", {
      headers: { "Content-Type": "text/plain" },
    })
  }),

  // OmniBridge API for real relayer monitoring
  http.get("https://testnet.api.bridge.nearone.org/api/v2/transfers/transfer", ({ request }) => {
    const url = new URL(request.url)
    const txHash = url.searchParams.get("transaction_hash")
    
    const baseTransfer = {
      id: {
        origin_chain: "Near",
        origin_nonce: 123
      },
      initialized: null,
      fast_finalised_on_near: null,
      finalised_on_near: null,
      fast_finalised: null,
      finalised: null,
      claimed: null,
      transfer_message: null,
      updated_fee: [],
      utxo_transfer: null
    }
    
    if (txHash === "real_init_withdrawal_tx_hash") {
      return HttpResponse.json([{
        ...baseTransfer,
        signed: {
          NearReceipt: {
            block_height: 12345,
            block_timestamp_seconds: 1640995200,
            transaction_hash: "real_near_signing_transaction_hash_example"
          }
        }
      }])
    }
    
    if (txHash === "near_init_withdrawal_tx_hash") {
      return HttpResponse.json([{
        ...baseTransfer,
        signed: {
          NearReceipt: {
            block_height: 12345,
            block_timestamp_seconds: 1640995200,
            transaction_hash: "real_near_signing_transaction_hash_example"
          }
        }
      }])
    }
    
    if (txHash === "automated_init_tx") {
      return HttpResponse.json([{
        ...baseTransfer,
        signed: {
          NearReceipt: {
            block_height: 12346,
            block_timestamp_seconds: 1640995300,
            transaction_hash: "automated_signing_tx"
          }
        }
      }])
    }
    
    if (txHash === "init_tx_hash") {
      return HttpResponse.json([{
        ...baseTransfer,
        signed: {
          NearReceipt: {
            block_height: 12347,
            block_timestamp_seconds: 1640995400,
            transaction_hash: "e2e_near_signing_hash"
          }
        }
      }])
    }
    
    // Return empty array for unknown transaction hashes (to simulate timeout scenarios)
    return HttpResponse.json([])
  }),

  // Error scenarios
  http.get(`${BITCOIN_API_URL}/tx/${UNCONFIRMED_TX_ID}` , () => {
    return HttpResponse.json({
      ...mockRealBitcoinTx,
      status: { confirmed: false },
    })
  }),

  http.get(`${BITCOIN_API_URL}/tx/${UNCONFIRMED_TX_ID}/merkle-proof`, () => {
    return new HttpResponse("Bad Request", { status: 400 })
  }),

  http.get("https://api-testnet.nearblocks.io/v1/account/slow.relayer.testnet/receipts", () => {
    // Simulate slow/missing relayer
    return HttpResponse.json({ txns: [] })
  }),
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const originalBtcAddresses = { ...addresses.btc }

beforeEach(() => {
  Object.assign(addresses.btc, {
    apiUrl: BITCOIN_API_URL,
    rpcUrl: BITCOIN_RPC_URL,
  })
})

afterAll(() => {
  Object.assign(addresses.btc, originalBtcAddresses)
})

describe("Bitcoin Integration Tests", () => {
  let mockWallet: Account
  let client: NearBridgeClient

  beforeEach(() => {
    // Create mock wallet matching real playground setup
    mockWallet = {
      accountId: REAL_WITHDRAWAL_DATA.testAccount,
      connection: { networkId: "testnet" },
      viewFunction: vi.fn(),
      signAndSendTransaction: vi.fn(),
      provider: {
        viewTransactionStatus: vi.fn(),
        callFunction: vi.fn(),
      },
    } as any

    client = new NearBridgeClient(mockWallet, REAL_WITHDRAWAL_DATA.bridgeContract)
  })

  describe("End-to-End Deposit Flow", () => {
    it("should complete full deposit flow using real transaction data", async () => {
      // Step 1: Get deposit address (mock the NEAR contract response)
      const mockDepositResponse = "tb1qreal_deposit_address_from_bridge_contract"
      
      // Mock both getUtxoDepositAddress and getUtxoBridgeConfig calls
      mockWallet.provider.callFunction = vi.fn()
        .mockImplementation((contractId: string, methodName: string) => {
          if (methodName === "get_user_deposit_address") {
            return Promise.resolve(mockDepositResponse)
          }
          if (methodName === "get_config") {
            return Promise.resolve(mockRealBtcConfig)
          }
          return Promise.resolve({})
        })

      const depositAddressResult = await client.getUtxoDepositAddress(ChainKind.Btc, 
        REAL_WITHDRAWAL_DATA.testAccount
      )

      expect(depositAddressResult.depositAddress).toBe(mockDepositResponse)
      expect(depositAddressResult.depositArgs.deposit_msg.recipient_id).toBe(
        REAL_WITHDRAWAL_DATA.testAccount
      )

      // Step 2: User sends Bitcoin to deposit address (simulated - this would be done externally)
      // The real transaction is already confirmed: 1f33f2668594bc29b1b4c3594b141a76f538429e0d2f1406cf135ba711d062d1

      // Step 3: Finalize deposit using real transaction hash and vout
      const mockFinalizeResult = {
        transaction: { hash: "near_deposit_finalization_tx_hash" },
        receipts_outcome: [],
      }
      
      mockWallet.signAndSendTransaction = vi.fn().mockResolvedValue(mockFinalizeResult)

      const finalizeResult = await client.finalizeUtxoDeposit(
        ChainKind.Btc,
        REAL_WITHDRAWAL_DATA.realDepositTx,
        REAL_WITHDRAWAL_DATA.realDepositVout,
        depositAddressResult.depositArgs
      )

      expect(finalizeResult).toBe("near_deposit_finalization_tx_hash")

      // Verify the correct parameters were passed to NEAR contract
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
    })

    it("should handle unconfirmed Bitcoin transactions", async () => {
      const mockDepositArgs: BtcDepositArgs = {
        deposit_msg: { recipient_id: REAL_WITHDRAWAL_DATA.testAccount },
      }

      await expect(
        client.finalizeUtxoDeposit(ChainKind.Btc, UNCONFIRMED_TX_ID, 0, mockDepositArgs)
      ).rejects.toThrow("UTXO: Transaction not confirmed")
    })

    it("should validate deposit amounts against bridge configuration", async () => {
      // Mock bridge config fetch
      mockWallet.provider.callFunction = vi.fn().mockResolvedValue(mockRealBtcConfig)

      const config = (await client.getUtxoBridgeConfig(ChainKind.Btc)) as BtcConnectorConfig
      
      expect(config.min_deposit_amount).toBe(REAL_WITHDRAWAL_DATA.minDepositAmount)
      
      // Verify the real transaction amount meets minimum requirements
      const depositOutputValue = mockRealBitcoinTx.vout[REAL_WITHDRAWAL_DATA.realDepositVout].value
      expect(depositOutputValue).toBeGreaterThan(parseInt(config.min_deposit_amount))
    })
  })

  describe("End-to-End Withdrawal Flow", () => {
    it("should complete full withdrawal flow with automated relayer monitoring", async () => {
      // Mock UTXO and config data for withdrawal initialization
      const mockUTXOs = {
        "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890@0": {
          path: "m/44'/1'/0'/0/0",
          tx_bytes: MOCK_TX_BYTES,
          vout: 0,
          balance: "100000"
        }
      }

      mockWallet.provider.callFunction = vi.fn()
        .mockImplementation((contractId: string, methodName: string) => {
          if (methodName === "get_utxos_paged") {
            return Promise.resolve(mockUTXOs)
          }
          if (methodName === "get_config") {
            return Promise.resolve(mockRealBtcConfig)
          }
          return Promise.resolve({})
        })

      // Step 1: Initialize withdrawal
      const mockInitResult = {
        transaction: { hash: "near_init_withdrawal_tx_hash" },
        receipts_outcome: [
          {
            outcome: {
              logs: [
                'EVENT_JSON:{"standard":"nep297","version":"1.0.0","event":"generate_btc_pending_info","data":[{"btc_pending_id":"real_pending_btc_withdrawal_123"}]}',
              ],
            },
          },
        ],
      }

      mockWallet.signAndSendTransaction = vi.fn().mockResolvedValue(mockInitResult)

      const result = await client.initUtxoWithdrawal(
        ChainKind.Btc,
        REAL_WITHDRAWAL_DATA.realWithdrawAddress,
        BigInt(REAL_WITHDRAWAL_DATA.minWithdrawAmount),
      )

      expect(result.pendingId).toBe("real_pending_btc_withdrawal_123")
      expect(result.nearTxHash).toBe("near_init_withdrawal_tx_hash")

      // Step 2: Wait for relayer to sign (automated via waitForUtxoTransactionSigning)
      const nearSigningTxHash = await client.waitForUtxoTransactionSigning(
        ChainKind.Btc,
        result.nearTxHash,
        1, // Single attempt for testing
        100, // Quick timeout
      )

      expect(nearSigningTxHash).toBe("real_near_signing_transaction_hash_example")

      // Step 3: Finalize withdrawal (extract signed tx and broadcast)
      const mockSignedTxStatus = {
        receipts_outcome: [
          {
            outcome: {
              logs: [
                'EVENT_JSON:{"standard":"nep297","event":"signed_btc_transaction","data":[{"tx_bytes":[2,0,0,0,1,241,226,211,196,181,166,151,136,105,80,65,50,33,15,237,203,169,135,101,67,33,15,237,203,169,135,101,67,33,171,205,239]}]}',
              ],
            },
          },
        ],
      }

      mockWallet.provider.viewTransactionStatus = vi.fn().mockResolvedValue(mockSignedTxStatus)

      const bitcoinTxHash = await client.finalizeUtxoWithdrawal(ChainKind.Btc, nearSigningTxHash)
      
      expect(bitcoinTxHash).toBe("broadcast_real_bitcoin_withdrawal_tx_hash")

      // Verify complete flow worked
      expect(mockWallet.signAndSendTransaction).toHaveBeenCalledTimes(1)
      expect(mockWallet.provider.viewTransactionStatus).toHaveBeenCalledWith(
        nearSigningTxHash,
        REAL_WITHDRAWAL_DATA.testAccount,
        "FINAL"
      )
    })

    it("should use executeUtxoWithdrawal for complete automation", async () => {
      // Mock UTXO and config data for withdrawal initialization
      const mockUTXOs = {
        "fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321@0": {
          path: "m/44'/1'/0'/0/1",
          tx_bytes: MOCK_TX_BYTES,
          vout: 0,
          balance: "200000"
        }
      }

      mockWallet.provider.callFunction = vi.fn()
        .mockImplementation((contractId: string, methodName: string) => {
          if (methodName === "get_utxos_paged") {
            return Promise.resolve(mockUTXOs)
          }
          if (methodName === "get_config") {
            return Promise.resolve(mockRealBtcConfig)
          }
          return Promise.resolve({})
        })

      // Mock all steps of the withdrawal process
      const mockInitResult = {
        transaction: { hash: "automated_init_tx" },
        receipts_outcome: [
          {
            outcome: {
              logs: [
                'EVENT_JSON:{"standard":"nep297","version":"1.0.0","event":"generate_btc_pending_info","data":[{"btc_pending_id":"automated_pending_123"}]}',
              ],
            },
          },
        ],
      }

      const mockSignedTxStatus = {
        receipts_outcome: [
          {
            outcome: {
              logs: [
                'EVENT_JSON:{"standard":"nep297","version":"1.0.0","event":"signed_btc_transaction","data":[{"tx_bytes":[2,0,0,0,1,171,205,239]}]}',
              ],
            },
          },
        ],
      }

      mockWallet.signAndSendTransaction = vi.fn().mockResolvedValue(mockInitResult)
      mockWallet.provider.viewTransactionStatus = vi.fn().mockResolvedValue(mockSignedTxStatus)

      // Mock NearBlocks response for the automated pending ID
      server.use(
        http.get(`https://api-testnet.nearblocks.io/v1/account/${REAL_WITHDRAWAL_DATA.relayerAccount}/receipts`, () => {
          return HttpResponse.json({
            txns: [
              {
                transaction_hash: "automated_signing_tx_hash",
                actions: [
                  {
                    args: '{"btc_pending_id":"automated_pending_123"}',
                  },
                ],
              },
            ],
          })
        })
      )

      // Execute complete withdrawal in one call
      const bitcoinTxHash = await client.executeUtxoWithdrawal(
        ChainKind.Btc,
        REAL_WITHDRAWAL_DATA.realWithdrawAddress,
        BigInt(30000), // 30,000 sats
        1, // Single attempt for testing
        50, // Quick timeout
      )

      expect(bitcoinTxHash).toBe("broadcast_real_bitcoin_withdrawal_tx_hash")
    })

    it("should handle relayer delays and timeouts", async () => {
      await expect(
        client.waitForUtxoTransactionSigning(
          ChainKind.Btc,
          "pending_that_will_timeout",
          2, // 2 attempts
          10,
        )
      ).rejects.toThrow(/Bitcoin: Transaction signing not found after 2 attempts/)
    })

    it("should validate withdrawal amounts against bridge configuration", async () => {
      // Mock UTXO and config data for withdrawal
      const mockUTXOs = {
        "9876543210abcdef9876543210abcdef9876543210abcdef9876543210abcdef@0": {
          path: "m/44'/1'/0'/0/2",
          tx_bytes: MOCK_TX_BYTES,
          vout: 0,
          balance: "50000"
        }
      }

      mockWallet.provider.callFunction = vi.fn()
        .mockImplementation((contractId: string, methodName: string) => {
          if (methodName === "get_utxos_paged") {
            return Promise.resolve(mockUTXOs)
          }
          if (methodName === "get_config") {
            return Promise.resolve(mockRealBtcConfig)
          }
          return Promise.resolve({})
        })

      const config = (await client.getUtxoBridgeConfig(ChainKind.Btc)) as BtcConnectorConfig
      
      // Test that validation works correctly - amount below minimum should throw
      const belowMinimum = BigInt(config.min_withdraw_amount) - 1n

      // Expect the validation to throw an error for amount below minimum
      await expect(
        client.initUtxoWithdrawal(
          ChainKind.Btc,
          REAL_WITHDRAWAL_DATA.realWithdrawAddress,
          belowMinimum,
        ),
      ).rejects.toThrow(/Amount \d+ is below minimum withdrawal amount/)

      // Test with valid amount at the minimum
      const validAmount = BigInt(config.min_withdraw_amount)
      
      const mockInitResult = {
        transaction: { hash: "test_tx" },
        receipts_outcome: [
          { outcome: { logs: ['EVENT_JSON:{"standard":"nep297","version":"1.0.0","event":"generate_btc_pending_info","data":[{"btc_pending_id":"test_pending"}]}'] } }
        ],
      }
      
      mockWallet.signAndSendTransaction = vi.fn().mockResolvedValue(mockInitResult)

      const result = await client.initUtxoWithdrawal(
        ChainKind.Btc,
        REAL_WITHDRAWAL_DATA.realWithdrawAddress,
        validAmount
      )

      expect(result.pendingId).toBe("test_pending")
      expect(result.nearTxHash).toBe("test_tx")
    })
  })

  describe("Error Scenarios and Recovery", () => {
    it("should handle Bitcoin network failures gracefully", async () => {
      // Mock Bitcoin RPC failure
      server.use(
        http.post(BITCOIN_RPC_URL, async ({ request }) => {
          const body = (await request.json()) as { method: string }
          if (body.method === "getrawtransaction") {
            return new HttpResponse("Service Unavailable", { status: 503, statusText: "Service Unavailable" })
          }
          return HttpResponse.json({ jsonrpc: "2.0", id: "1", result: null })
        })
      )

      const mockDepositArgs: BtcDepositArgs = {
        deposit_msg: { recipient_id: REAL_WITHDRAWAL_DATA.testAccount },
      }

      await expect(
        client.finalizeUtxoDeposit(
          ChainKind.Btc,
          REAL_WITHDRAWAL_DATA.realDepositTx,
          REAL_WITHDRAWAL_DATA.realDepositVout,
          mockDepositArgs
        )
      ).rejects.toThrow(/UTXO RPC request failed/)
    })

    it("should handle NEAR contract failures", async () => {
      // Mock NEAR contract failure
      mockWallet.provider.callFunction = vi.fn().mockRejectedValue(new Error("Contract method not found"))

      await expect(client.getUtxoBridgeConfig(ChainKind.Btc)).rejects.toThrow("Contract method not found")
    })

    it("should handle malformed transaction logs", async () => {
      // Mock UTXO and config data
      const mockUTXOs = {
        "5678901234abcdef5678901234abcdef5678901234abcdef5678901234abcdef@0": {
          path: "m/44'/1'/0'/0/3",
          tx_bytes: MOCK_TX_BYTES,
          vout: 0,
          balance: "75000"
        }
      }

      mockWallet.provider.callFunction = vi.fn()
        .mockImplementation((contractId: string, methodName: string) => {
          if (methodName === "get_utxos_paged") {
            return Promise.resolve(mockUTXOs)
          }
          if (methodName === "get_config") {
            return Promise.resolve(mockRealBtcConfig)
          }
          return Promise.resolve({})
        })

      const mockMalformedResult = {
        transaction: { hash: "malformed_tx" },
        receipts_outcome: [
          {
            outcome: {
              logs: ["Invalid log format without EVENT_JSON"],
            },
          },
        ],
      }

      mockWallet.signAndSendTransaction = vi.fn().mockResolvedValue(mockMalformedResult)

      await expect(
        client.initUtxoWithdrawal(ChainKind.Btc, REAL_WITHDRAWAL_DATA.realWithdrawAddress, BigInt(50000))
      ).rejects.toThrow("Bitcoin: Pending transaction not found in NEAR logs")
    })

    it("should handle network mismatches", async () => {
      // Test with mainnet address on testnet
      const mainnetAddress = "bc1qmainnetaddressshoulfailontestnet123456789abc"

      expect(() => {
        client.bitcoinService.addressToScriptPubkey(mainnetAddress)
      }).toThrow(/Bitcoin: Failed to convert address to script_pubkey/)
    })
  })

  describe("Cross-Chain Integration", () => {
    it("should work within broader bridge context", async () => {
      // Test that Bitcoin operations don't interfere with other bridge operations
      mockWallet.provider.callFunction = vi.fn()
        .mockResolvedValueOnce(mockRealBtcConfig) // getUtxoBridgeConfig
        .mockResolvedValueOnce("tb1qtest") // getUtxoDepositAddress

      // Get Bitcoin config
      const btcConfig = await client.getUtxoBridgeConfig(ChainKind.Btc)
      expect(btcConfig.min_deposit_amount).toBe(REAL_WITHDRAWAL_DATA.minDepositAmount)

      // Get deposit address  
      const depositResult = await client.getUtxoDepositAddress(ChainKind.Btc, "test.near")
      expect(depositResult.depositAddress).toBe("tb1qtest")

      // Verify both calls were made correctly
      expect(mockWallet.provider.callFunction).toHaveBeenCalledTimes(2)
      expect(mockWallet.provider.callFunction).toHaveBeenNthCalledWith(1, 
        "btc-connector.n-bridge.testnet",
        "get_config",
        {}
      )
      expect(mockWallet.provider.callFunction).toHaveBeenNthCalledWith(2,
        "btc-connector.n-bridge.testnet",
        "get_user_deposit_address",
        { deposit_msg: { recipient_id: "test.near" } }
      )
    })

    it("should maintain proper network configuration", async () => {
      // Verify testnet configuration is properly set
      expect(client.networkId).toBe("testnet")
      expect(client.bridgeContractId).toBe(REAL_WITHDRAWAL_DATA.bridgeContract)
      
      // Verify Bitcoin service rejects mainnet address and accepts testnet address
      const testnetScript = client.bitcoinService.addressToScriptPubkey(
        REAL_WITHDRAWAL_DATA.realWithdrawAddress
      )
      expect(typeof testnetScript).toBe("string")
      expect(testnetScript).toMatch(/^[0-9a-f]+$/)

      expect(() =>
        client.bitcoinService.addressToScriptPubkey("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")
      ).toThrow("Bitcoin: Failed to convert address to script_pubkey")
    })
  })

  describe("Real Data Validation", () => {
    it("should handle actual playground transaction correctly", () => {
      // Validate the real transaction data structure
      expect(REAL_WITHDRAWAL_DATA.realDepositTx).toHaveLength(64)
      expect(REAL_WITHDRAWAL_DATA.realDepositTx).toMatch(/^[0-9a-f]+$/i)
      expect(REAL_WITHDRAWAL_DATA.realDepositVout).toBeGreaterThanOrEqual(0)
      expect(REAL_WITHDRAWAL_DATA.realWithdrawAddress).toMatch(/^tb1q/)
    })

    it("should use realistic amounts from bridge configuration", () => {
      expect(parseInt(REAL_WITHDRAWAL_DATA.minDepositAmount)).toBeGreaterThan(1000) // > 1000 sats
      expect(parseInt(REAL_WITHDRAWAL_DATA.minWithdrawAmount)).toBeGreaterThan(
        parseInt(REAL_WITHDRAWAL_DATA.minDepositAmount)
      )
    })

    it("should handle real relayer account format", () => {
      expect(REAL_WITHDRAWAL_DATA.relayerAccount).toMatch(/\.testnet$/)
      expect(REAL_WITHDRAWAL_DATA.testAccount).toMatch(/\.testnet$/)
      expect(REAL_WITHDRAWAL_DATA.bridgeContract).toMatch(/\.testnet$/)
    })
  })

  describe("Performance and Scalability", () => {
    it("should handle multiple concurrent operations", async () => {
      // Mock successful operations
      mockWallet.provider.callFunction = vi.fn().mockResolvedValue(mockRealBtcConfig)

      // Execute multiple config fetches concurrently
      const promises = Array(5).fill(null).map(() => client.getUtxoBridgeConfig(ChainKind.Btc))
      const results = await Promise.all(promises)

      // All should succeed
      results.forEach(config => {
        expect(config.min_deposit_amount).toBe(REAL_WITHDRAWAL_DATA.minDepositAmount)
      })

      // Verify all calls were made
      expect(mockWallet.provider.callFunction).toHaveBeenCalledTimes(5)
    })

    it("should handle large amounts correctly", async () => {
      // Mock UTXO and config data for large amount withdrawal
      const mockUTXOs = {
        "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef@0": {
          path: "m/44'/1'/0'/0/0",
          tx_bytes: MOCK_TX_BYTES,
          vout: 0,
          balance: "1000000" // 1M satoshis (matches MOCK_TX_BYTES)
        },
        "2345678901abcdef2345678901abcdef2345678901abcdef2345678901abcdef@0": {
          path: "m/44'/1'/0'/0/1",
          tx_bytes: MOCK_TX_BYTES,
          vout: 0,
          balance: "1000000" // 1M satoshis (matches MOCK_TX_BYTES)
        },
        "3456789012abcdef3456789012abcdef3456789012abcdef3456789012abcdef@0": {
          path: "m/44'/1'/0'/0/2",
          tx_bytes: MOCK_TX_BYTES,
          vout: 0,
          balance: "1000000" // 1M satoshis (matches MOCK_TX_BYTES)
        }
      }

      mockWallet.provider.callFunction = vi.fn()
        .mockImplementation((contractId: string, methodName: string) => {
          if (methodName === "get_utxos_paged") {
            return Promise.resolve(mockUTXOs)
          }
          if (methodName === "get_config") {
            return Promise.resolve(mockRealBtcConfig)
          }
          return Promise.resolve({})
        })

      const largeAmount = BigInt("2500000") // 2.5M satoshis (0.025 BTC) - large amount using available UTXOs
      
      const mockInitResult = {
        transaction: { hash: "large_amount_tx" },
        receipts_outcome: [
          { outcome: { logs: ['EVENT_JSON:{"standard":"nep297","version":"1.0.0","event":"generate_btc_pending_info","data":[{"btc_pending_id":"large_amount_pending"}]}'] } }
        ],
      }
      
      mockWallet.signAndSendTransaction = vi.fn().mockResolvedValue(mockInitResult)

      const result = await client.initUtxoWithdrawal(
        ChainKind.Btc,
        REAL_WITHDRAWAL_DATA.realWithdrawAddress,
        largeAmount
      )

      expect(result.pendingId).toBe("large_amount_pending")
      expect(result.nearTxHash).toBe("large_amount_tx")
    })
  })
})
