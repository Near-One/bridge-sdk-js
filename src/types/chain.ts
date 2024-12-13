import type { Unit } from "borsher"

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
