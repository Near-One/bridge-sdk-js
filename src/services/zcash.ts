import type { BitcoinMerkleProofResponse, UTXO } from "../types/bitcoin.js"
import { ChainKind } from "../types/chain.js"
import { getZcashScript } from "../utils/zcash.js"
import {
  type NormalizedUTXO,
  selectUtxos,
  type UtxoDepositProof,
  type UtxoPlanOverrides,
  type UtxoWithdrawalPlan,
} from "../utxo/index.js"
import { UtxoRpcClient } from "../utxo/rpc.js"

const ZCASH_DUST_THRESHOLD = 5000n

export class ZcashService {
  constructor(
    private rpcUrl: string,
    private apiKey: string,
  ) {
    this.rpc = new UtxoRpcClient({
      url: this.rpcUrl,
      headers: { "x-api-key": this.apiKey },
      chain: ChainKind.Zcash,
    })
  }

  private rpc: UtxoRpcClient

  async decodeTransaction(txHex: string) {
    const tx = await this.rpc.call("decoderawtransaction", [txHex])
    return tx
  }

  async getDepositProof(txHash: string, vout: number): Promise<UtxoDepositProof> {
    return await this.rpc.buildDepositProof(txHash, vout)
  }

  async getMerkleProof(txHash: string): Promise<BitcoinMerkleProofResponse> {
    return await this.rpc.buildMerkleProof(txHash)
  }

  async broadcastTransaction(txHex: string): Promise<string> {
    return await this.rpc.call("sendrawtransaction", [txHex])
  }

  calculateZcashFee(inputs: number, outputs: number): bigint {
    const marginalFee = 5000 // zatoshis per logical action
    const graceActions = 2

    // Simplified calculation for transparent transactions
    // Real implementation would need to account for Sapling/Orchard actions too
    const logicalActions = Math.max(inputs, outputs)

    const fee = Math.max(
      marginalFee * Math.max(graceActions, logicalActions),
      marginalFee * graceActions,
    )

    return BigInt(fee)
  }

  buildWithdrawalPlan(
    utxos: UTXO[],
    amount: bigint,
    targetAddress: string,
    changeAddress: string,
    _feeRate: number = 0,
    overrides?: UtxoPlanOverrides,
  ): UtxoWithdrawalPlan {
    if (!utxos.length) {
      throw new Error("Zcash: No UTXOs available")
    }

    if (!changeAddress) {
      throw new Error("Zcash: Bridge configuration is missing change address")
    }

    const normalized = this.normalizeUtxos(utxos)

    const dustThreshold = overrides?.dustThreshold ?? ZCASH_DUST_THRESHOLD
    const minChange = overrides?.minChange ?? dustThreshold

    const selection = selectUtxos(normalized, amount, {
      feeCalculator: (inputs, outputs) => this.calculateZcashFee(inputs, outputs),
      dustThreshold,
      minChange,
      maxInputs: overrides?.maxInputs ?? undefined,
      sort: overrides?.sort ?? "largest-first",
    })

    const outputs = [{ value: Number(amount), script_pubkey: getZcashScript(targetAddress) }]

    if (selection.change > 0n) {
      outputs.push({
        value: Number(selection.change),
        script_pubkey: getZcashScript(changeAddress),
      })
    }

    return {
      inputs: selection.inputs.map((input) => `${input.txid}:${input.vout}`),
      outputs,
      fee: selection.fee,
    }
  }

  private normalizeUtxos(utxos: UTXO[]): NormalizedUTXO[] {
    return utxos.map((utxo) => {
      const bytes = utxo.tx_bytes
      let rawTx: Uint8Array
      if (bytes instanceof Uint8Array) {
        rawTx = bytes
      } else {
        rawTx = Uint8Array.from(bytes)
      }

      return {
        txid: utxo.txid,
        vout: utxo.vout,
        amount: BigInt(utxo.balance),
        path: utxo.path,
        rawTx,
      }
    })
  }
}
