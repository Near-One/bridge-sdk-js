import type { ChainKind } from "./chain"
import type { OmniAddress } from "./common"
import type { EvmVerifyProofArgs, ProofKind } from "./prover"

export type TokenDeployment = {
  id: string
  tokenAddress: OmniAddress
  sourceChain: ChainKind
  destinationChain: ChainKind
  status: "pending" | "ready_for_finalize" | "finalized" | "ready_for_bind" | "completed"
  proof?: {
    proof_kind: ProofKind
    vaa: string
  }
  metadata?: {
    nearAddress: string
    tokenAddress: OmniAddress
    emitterAddress: OmniAddress
  }
  deploymentTx?: string
  bindTx?: string
}

/**
 * Common interface for all chain-specific deployers
 * @template TWallet - The wallet type for the specific chain
 */
export interface ChainDeployer<_TWallet> {
  /**
   * Initializes token deployment by logging metadata
   * @param tokenAddress - The Omni address of the token to be deployed
   * @returns Transaction hash of the initialization
   */
  initDeployToken(tokenAddress: OmniAddress): Promise<string>

  /**
   * Finalizes token deployment using a VAA
   * @param destinationChain - Target chain for deployment
   * @param vaa - The Verified Action Approval
   * @returns Transaction hash of the deployment
   */
  finDeployToken(destinationChain: ChainKind, vaa: string): Promise<string>

  /**
   * Binds a token using either a VAA (Wormhole) or EVM proof
   * @param sourceChain - Source chain for binding
   * @param vaa - The Verified Action Approval
   * @param evmProof - The EVM proof
   * @returns Transaction hash of the binding
   */
  bindToken(sourceChain: ChainKind, vaa?: string, evmProof?: EvmVerifyProofArgs): Promise<string>
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

export enum Status {
  Pending = 0,
  Completed = 1,
  Failed = 2,
}
