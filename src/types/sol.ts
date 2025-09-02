import type BN from "bn.js"

export interface DepositPayload {
  destinationNonce: BN
  transferId: {
    originChain: number
    originNonce: BN
  }
  amount: BN
  feeRecipient: string | null
}
