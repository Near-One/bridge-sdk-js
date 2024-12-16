import type { Unit } from "borsher"
import { BorshSchema } from "borsher"

export type ChainKind =
  | { Eth: Unit }
  | { Near: Unit }
  | { Sol: Unit }
  | { Arb: Unit }
  | { Base: Unit }

export const ChainKind = {
  Eth: { Eth: {} } as ChainKind,
  Near: { Near: {} } as ChainKind,
  Sol: { Sol: {} } as ChainKind,
  Arb: { Arb: {} } as ChainKind,
  Base: { Base: {} } as ChainKind,
} as const

export const ChainKindSchema = BorshSchema.Enum({
  Eth: BorshSchema.Unit,
  Near: BorshSchema.Unit,
  Sol: BorshSchema.Unit,
  Arb: BorshSchema.Unit,
  Base: BorshSchema.Unit,
})
