import { b } from "@zorsh/zorsh"

export enum ChainKind {
  Eth = 0,
  Near = 1,
  Sol = 2,
  Arb = 3,
  Base = 4,
}

export const ChainKindSchema = b.nativeEnum(ChainKind)
