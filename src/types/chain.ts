import { b } from "@zorsh/zorsh"

export enum ChainKind {
  Eth = 0,
  Near = 1,
  Sol = 2,
  Arb = 3,
  Base = 4,
  Bnb = 5,
  Btc = 6,
  Zcash = 7,
}

export const ChainKindSchema = b.nativeEnum(ChainKind)

export type UtxoChain = ChainKind.Btc | ChainKind.Zcash

export const UTXO_CHAIN_LABELS: Record<UtxoChain, string> = {
  [ChainKind.Btc]: "Bitcoin",
  [ChainKind.Zcash]: "Zcash",
}
