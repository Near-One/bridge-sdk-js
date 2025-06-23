import type { U128 } from "./common.js"
import type { TransferId } from "./evm.js"

export interface DepositPayload {
  destination_nonce: bigint
  transfer_id: TransferId
  token: string
  amount: U128
  recipient: string
  fee_recipient: string | null
}
