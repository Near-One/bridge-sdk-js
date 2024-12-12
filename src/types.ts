export enum Chain {
  Ethereum = "eth",
  Near = "near",
  Solana = "sol",
  Arbitrum = "arb",
  Base = "base",
}

export type OmniAddress = `${Chain}:${string}`

export interface TransferId {
  origin_chain: Chain
  origin_nonce: bigint
}

export interface FinTransferMessage {
  transfer_id: TransferId
  fee_recipient: string // AccountId
  amount: string // U128
  emitter_address: OmniAddress
}

export interface LogMetadataMessage {
  token_address: OmniAddress
  name: string
  symbol: string
  decimals: number
  emitter_address: OmniAddress
}

export interface DeployTokenMessage {
  token: string // AccountId
  token_address: OmniAddress
  emitter_address: OmniAddress
}

export interface StorageDepositAction {
  token_id: string // AccountId
  account_id: string // AccountId
  storage_deposit_amount?: string // Optional U128
}

export interface InitDeployTokenArgs {
  token_id: string
}
export interface FinTransferArgs {
  chain_kind: Chain
  storage_deposit_actions: StorageDepositAction[]
  prover_args: FinTransferMessage
}

export interface ClaimFeeArgs {
  chain_kind: Chain
  prover_args: FinTransferMessage
}

export interface BindTokenArgs {
  chain_kind: Chain
  prover_args: DeployTokenMessage
}

export interface FinDeployTokenArgs {
  chain_kind: Chain
  prover_args: LogMetadataMessage
}
export type ProofKind = "InitTransfer" | "FinTransfer" | "DeployToken"
export type TokenDeployment = {
  id: string
  tokenAddress: OmniAddress
  sourceChain: Chain
  destinationChain: Chain
  status: "pending" | "ready_for_finalize" | "finalized" | "ready_for_bind" | "completed"
  proof?: {
    proof_kind: ProofKind
    vaa: string
  }
  deploymentTx?: string
  bindTx?: string
  logMetadata: LogMetadataMessage
}

export interface ChainDeployer {
  initDeployToken(tokenAddress: OmniAddress, destinationChain: Chain): Promise<TokenDeployment>
  finDeployToken(deployment: TokenDeployment): Promise<TokenDeployment>
  bindToken(deployment: TokenDeployment): Promise<TokenDeployment>
}
export interface TransferMessage {
  tokenAddress: OmniAddress
  amount: bigint
  fee: bigint
  nativeFee: bigint
  recipient: OmniAddress
  message: string | null
}

export interface OmniTransfer {
  txId: string
  nonce: bigint
  transferMessage: TransferMessage
}

export interface Fee {
  fee: bigint
  nativeFee: bigint
}

export enum Status {
  Pending = 0,
  Completed = 1,
  Failed = 2,
}
