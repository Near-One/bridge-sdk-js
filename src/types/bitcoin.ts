/**
 * Comprehensive Bitcoin types matching Rust SDK exactly
 * All types needed for Bitcoin bridge operations
 */

export interface BitcoinMerkleProofResponse {
  block_height: number
  merkle: string[]
  pos: number
}

/**
 * DEPOSIT OPERATIONS (BTC -> NEAR)
 */
export interface BtcPostAction {
  receiver_id: string
  amount: bigint
  memo?: string
  msg: string
  gas?: bigint
}

export interface DepositMsg {
  recipient_id: string // NEAR account to receive tokens
  post_actions?: BtcPostAction[]
  extra_msg?: string // Optional metadata
}

export interface BtcDepositArgs {
  deposit_msg: DepositMsg
}

export interface FinBtcTransferArgs {
  deposit_msg: DepositMsg
  tx_bytes: Array<number>
  vout: number // Output index in the transaction
  tx_block_blockhash: string
  tx_index: number
  merkle_proof: string[]
}

export interface InitBtcTransferMsg {
  Withdraw: {
    target_btc_address: string
    input: string[] // "txid:vout"
    output: {
      value: number
      script_pubkey: string
    }[]
  }
}

export interface UTXO {
  path: string // HD derivation path
  tx_bytes: Uint8Array // Raw transaction bytes
  vout: number // Output index
  balance: string // Balance in satoshis
  txid: string // Transaction ID (for convenience)
}

/**
 * NETWORK DATA STRUCTURES
 */
export interface BitcoinTransaction {
  txid: string
  version: number
  locktime: number
  vin: BitcoinInput[]
  vout: BitcoinOutput[]
  size: number
  weight: number
  fee: number
  status?: {
    confirmed: boolean
    block_height?: number
    block_hash?: string
    block_time?: number
  }
}

export interface BitcoinInput {
  txid: string
  vout: number
  prevout?: BitcoinOutput
  scriptsig: string
  scriptsig_asm: string
  witness?: string[]
  is_coinbase: boolean
  sequence: number
}

export interface BitcoinOutput {
  scriptpubkey: string
  scriptpubkey_asm: string
  scriptpubkey_type: string
  scriptpubkey_address?: string
  value: number
}

export interface BridgeFee {
  fee_min: string
  fee_rate: number
  protocol_fee_rate: number
}

/**
 * BTC CONNECTOR CONFIG (for get_config contract call)
 */
export interface BtcConnectorConfig {
  btc_light_client_account_id: string
  nbtc_account_id: string
  chain_signatures_account_id: string
  chain_signatures_root_public_key: string
  change_address: string
  confirmations_strategy: Record<string, number>
  confirmations_delta: number
  deposit_bridge_fee: BridgeFee
  withdraw_bridge_fee: BridgeFee
  min_deposit_amount: string
  min_withdraw_amount: string
  min_change_amount: string
  max_change_amount: string
  min_btc_gas_fee: string
  max_btc_gas_fee: string
  max_withdrawal_input_number: number
  max_change_number: number
  max_active_utxo_management_input_number: number
  max_active_utxo_management_output_number: number
  active_management_lower_limit: number
  active_management_upper_limit: number
  passive_management_lower_limit: number
  passive_management_upper_limit: number
  rbf_num_limit: number
  max_btc_tx_pending_sec: number
}

/**
 * NEARBLOCKS API TYPES FOR TRANSACTION LOOKUP
 */
export interface NearBlocksReceiptAction {
  action: string
  method: string
  args: string
  args_json?: Record<string, unknown>
}

export interface NearBlocksTransaction {
  transaction_hash: string
  included_in_block_hash: string
  block_timestamp: string
  signer_account_id: string
  receiver_account_id: string
  actions: NearBlocksReceiptAction[]
}

export interface NearBlocksReceiptsResponse {
  txns: NearBlocksTransaction[]
}
