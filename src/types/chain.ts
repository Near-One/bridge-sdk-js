import { BorshSchema } from "borsher"

export enum ChainKind {
  Eth = 0,
  Near = 1,
  Sol = 2,
  Arb = 3,
  Base = 4,
}

// TypeScript Enums like this serialize to simple numbers in Borsh.
// This is highly specific to numeric enums, though. It does not apply to much else.
export const ChainKindSchema = BorshSchema.u8
