/**
 * NEAR-specific types for Omni Bridge
 *
 * Re-uses zorsh schemas for Borsh serialization matching the on-chain contract format.
 */

import { ChainKind, type OmniAddress } from "@omni-bridge/core"
import { b } from "@zorsh/zorsh"
import { parseAmount, parseGas } from "near-kit"

// Gas constants (using near-kit for readability)
export const GAS = {
  LOG_METADATA: BigInt(parseGas("300 Tgas")),
  DEPLOY_TOKEN: BigInt(parseGas("120 Tgas")),
  BIND_TOKEN: BigInt(parseGas("300 Tgas")),
  INIT_TRANSFER: BigInt(parseGas("300 Tgas")),
  FIN_TRANSFER: BigInt(parseGas("300 Tgas")),
  SIGN_TRANSFER: BigInt(parseGas("300 Tgas")),
  STORAGE_DEPOSIT: BigInt(parseGas("10 Tgas")),
  FAST_FIN_TRANSFER: BigInt(parseGas("300 Tgas")),
} as const

// Deposit constants
export const DEPOSIT = {
  ONE_YOCTO: BigInt(parseAmount("1 yocto")),
} as const

/**
 * Transfer ID for identifying cross-chain transfers
 */
export interface TransferId {
  origin_chain: ChainKind | number | string
  origin_nonce: bigint | string
}

/**
 * Fee structure for transfers
 */
export interface TransferFee {
  fee: string
  native_fee: string
}

/**
 * Proof kind enumeration matching on-chain values
 */
export enum ProofKind {
  InitTransfer = 0,
  FinTransfer = 1,
  DeployToken = 2,
  LogMetadata = 3,
}

// Zorsh schemas for Borsh serialization (matching src/types/)
export const ProofKindSchema = b.nativeEnum(ProofKind)
export const ChainKindSchema = b.nativeEnum(ChainKind)

export const StorageDepositActionSchema = b.struct({
  token_id: b.string(),
  account_id: b.string(),
  storage_deposit_amount: b.option(b.u128()),
})
export type StorageDepositAction = b.infer<typeof StorageDepositActionSchema>

export const EvmProofSchema = b.struct({
  log_index: b.u64(),
  log_entry_data: b.bytes(),
  receipt_index: b.u64(),
  receipt_data: b.bytes(),
  header_data: b.bytes(),
  proof: b.vec(b.bytes()),
})
export type NearEvmProof = b.infer<typeof EvmProofSchema>

export const EvmVerifyProofArgsSchema = b.struct({
  proof_kind: ProofKindSchema,
  proof: EvmProofSchema,
})
export type EvmVerifyProofArgs = b.infer<typeof EvmVerifyProofArgsSchema>

export const WormholeVerifyProofArgsSchema = b.struct({
  proof_kind: ProofKindSchema,
  vaa: b.string(),
})
export type WormholeVerifyProofArgs = b.infer<typeof WormholeVerifyProofArgsSchema>

export const FinTransferArgsSchema = b.struct({
  chain_kind: ChainKindSchema,
  storage_deposit_actions: b.vec(StorageDepositActionSchema),
  prover_args: b.bytes(),
})
export type FinTransferArgs = b.infer<typeof FinTransferArgsSchema>

export const DeployTokenArgsSchema = b.struct({
  chain_kind: ChainKindSchema,
  prover_args: b.bytes(),
})
export type DeployTokenArgs = b.infer<typeof DeployTokenArgsSchema>

export const BindTokenArgsSchema = b.struct({
  chain_kind: ChainKindSchema,
  prover_args: b.bytes(),
})
export type BindTokenArgs = b.infer<typeof BindTokenArgsSchema>

/**
 * Finalization parameters
 */
export interface FinalizationParams {
  sourceChain: ChainKind
  storageDepositActions: StorageDepositAction[]
  vaa?: string
  evmProof?: EvmVerifyProofArgs
  signerId: string
}

/**
 * Fast finalization transfer parameters
 */
export interface FastFinTransferParams {
  tokenId: string
  amount: string
  amountToSend: string
  transferId: TransferId
  recipient: OmniAddress
  fee: TransferFee
  msg?: string
  storageDepositAmount?: string
  relayer: string
}

/**
 * Init transfer event from NEAR (parsed from logs)
 */
export interface InitTransferEvent {
  transfer_message: {
    origin_nonce: number
    token: OmniAddress
    amount: string
    recipient: OmniAddress
    fee: TransferFee
    sender: OmniAddress
    msg: string
    destination_nonce: number
  }
}

/**
 * MPC signature affine point
 */
export interface AffinePoint {
  affine_point: string
}

/**
 * MPC signature scalar
 */
export interface Scalar {
  scalar: string
}

/**
 * MPC signature structure (raw from contract logs)
 */
export interface MPCSignatureRaw {
  big_r: AffinePoint
  s: Scalar
  recovery_id: number
}

function fromHex(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) || [])
}

/**
 * MPC signature class with toBytes() conversion
 */
export class MPCSignature {
  constructor(
    public big_r: AffinePoint,
    public s: Scalar,
    public recovery_id: number,
  ) {}

  /**
   * Convert signature to bytes for Solana/EVM
   * @param forEvm - If true, adds 27 to recovery_id for EVM compatibility
   */
  toBytes(forEvm = false): Uint8Array {
    const bigRBytes = fromHex(this.big_r.affine_point)
    const sBytes = fromHex(this.s.scalar)
    const result = [...bigRBytes.slice(1), ...sBytes, this.recovery_id + (forEvm ? 27 : 0)]
    return new Uint8Array(result)
  }

  /**
   * Create from raw signature object from contract logs
   */
  static fromRaw(raw: MPCSignatureRaw): MPCSignature {
    return new MPCSignature(raw.big_r, raw.s, raw.recovery_id)
  }
}

/**
 * Sign transfer event from NEAR
 */
export interface SignTransferEvent {
  signature: MPCSignature
  message_payload: {
    prefix: string
    destination_nonce: string
    transfer_id: TransferId
    token_address: OmniAddress
    amount: string
    recipient: OmniAddress
    fee_recipient: string | null
  }
}

/**
 * Log metadata event
 */
export interface LogMetadataEvent {
  metadata_payload: {
    decimals: number
    name: string
    prefix: string
    symbol: string
    token: string
  }
  signature: MPCSignature
}
