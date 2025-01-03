export type U128 = bigint
export type Nonce = bigint
export type AccountId = string
export type Fee = bigint
export type OmniAddress =
  | `eth:${string}`
  | `near:${string}`
  | `sol:${string}`
  | `arb:${string}`
  | `base:${string}`
