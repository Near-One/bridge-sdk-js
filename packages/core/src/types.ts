/**
 * Core types for Omni Bridge SDK
 */

// Chain enumeration matching on-chain values
export enum ChainKind {
  Eth = 0,
  Near = 1,
  Sol = 2,
  Arb = 3,
  Base = 4,
  Bnb = 5,
  Btc = 6,
  Zcash = 7,
  Pol = 8,
}

// Network configuration
export type Network = "mainnet" | "testnet"

// Cross-chain address format with chain prefix
export type OmniAddress =
  | `eth:${string}`
  | `near:${string}`
  | `sol:${string}`
  | `arb:${string}`
  | `base:${string}`
  | `bnb:${string}`
  | `btc:${string}`
  | `zec:${string}`
  | `pol:${string}`

// Common type aliases
export type U128 = bigint
export type Nonce = bigint
export type AccountId = string
export type Fee = bigint

// UTXO chain subset
export type UtxoChain = ChainKind.Btc | ChainKind.Zcash

// =============================================================================
// UTXO TYPES (shared between @omni-bridge/btc and @omni-bridge/near)
// =============================================================================

/**
 * Unspent Transaction Output (UTXO) for Bitcoin/Zcash operations.
 * Used for both fetching available outputs and building withdrawal plans.
 */
export interface UTXO {
  /** Transaction ID */
  txid: string
  /** Output index in the transaction */
  vout: number
  /** Balance in satoshis/zatoshis (flexible input types for convenience) */
  balance: bigint | number | string
  /** Raw transaction bytes (optional, for signing) */
  tx_bytes?: Uint8Array | number[] | undefined
  /** HD derivation path (optional, for hardware wallets) */
  path?: string | undefined
}

// Transfer parameters (input from consumer)
export interface TransferParams {
  token: OmniAddress
  amount: bigint
  fee: bigint
  nativeFee: bigint
  sender: OmniAddress
  recipient: OmniAddress
  message?: string
}

// Validated transfer (output from validation)
export interface ValidatedTransfer {
  params: TransferParams
  sourceChain: ChainKind
  destChain: ChainKind
  normalizedAmount: bigint
  normalizedFee: bigint
  contractAddress: string
  bridgedToken?: OmniAddress | undefined
}

// Token decimal information
export interface TokenDecimals {
  decimals: number
  origin_decimals: number
}

// Unsigned transaction types for each chain

/**
 * EVM unsigned transaction - compatible with both viem and ethers v6.
 * Can be passed directly to walletClient.sendTransaction() or signer.sendTransaction()
 */
export interface EvmUnsignedTransaction {
  to: `0x${string}`
  data: `0x${string}`
  value: bigint
  chainId: number
}

export interface NearAction {
  type: "FunctionCall"
  methodName: string
  args: Uint8Array
  gas: bigint
  deposit: bigint
}

export interface NearUnsignedTransaction {
  type: "near"
  signerId: string
  receiverId: string
  actions: NearAction[]
}

export interface SolanaInstruction {
  programId: string
  keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>
  data: Uint8Array
}

export interface SolanaUnsignedTransaction {
  type: "solana"
  feePayer: string
  instructions: SolanaInstruction[]
}

export interface BtcUnsignedTransaction {
  type: "btc"
  inputs: Array<{ txid: string; vout: number; value: bigint }>
  outputs: Array<{ address: string; value: bigint }>
}

// Chain prefix type for address parsing
export type ChainPrefix = "eth" | "near" | "sol" | "arb" | "base" | "bnb" | "btc" | "zec" | "pol"
