export enum Chain {
  Ethereum = "eth",
  Near = "near",
  Solana = "sol",
  Arbitrum = "arb",
  Base = "base",
}

export type OmniAddress = `${Chain}:${string}`

export type TokenDeployment = {
  id: string
  tokenAddress: OmniAddress
  sourceChain: Chain
  destinationChain: Chain
  status: "pending" | "ready_for_finalize" | "finalized" | "ready_for_bind" | "completed"
  proof?: string
  deploymentTx?: string
  bindTx?: string
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
