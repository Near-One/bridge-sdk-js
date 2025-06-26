import { z } from "zod"

// Constants
const GAS_UNITS = {
  TGAS: BigInt(10 ** 12),
  GGAS: BigInt(10 ** 9),
} as const

const NEAR_UNITS = {
  NEAR: BigInt(10 ** 24),
  MILLI_NEAR: BigInt(10 ** 21),
  MICRO_NEAR: BigInt(10 ** 18),
} as const

// Compile-time type safety with template literals
type GasUnit = "TGas" | "GGas" | "Gas" | "tgas" | "ggas" | "gas"
type NearUnit =
  | "NEAR"
  | "mNEAR"
  | "milliNEAR"
  | "μNEAR"
  | "microNEAR"
  | "yoctoNEAR"
  | "yocto"
  | "near"
  | "mnear"
  | "millinear"
  | "micronear"
  | "yoctonear"

// Strict template literal types
type GasString = `${number} ${GasUnit}` | `${number}${GasUnit}`
type NearString = `${number} ${NearUnit}` | `${number}${NearUnit}`

// Branded types for validated values
declare const __gas_brand: unique symbol
declare const __near_brand: unique symbol

export type ValidatedGas = bigint & { [__gas_brand]: true }
export type ValidatedNear = bigint & { [__near_brand]: true }

// Input and output types
export type GasInput = GasString | bigint
export type NearInput = NearString | bigint
export type GasOutput = ValidatedGas
export type NearOutput = ValidatedNear

// Gas validation schema
export const gasSchema = z
  .union([z.string().regex(/^\d+(\.\d+)?\s*(TGas|GGas|Gas)$/i), z.bigint()])
  .transform((value, ctx) => {
    if (typeof value === "string") {
      const match = value.match(/^(\d+(?:\.\d+)?)\s*(TGas|GGas|Gas)$/i)
      if (!match) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid gas format. Use format like "25.5 TGas", "300 GGas", or "1000 Gas"',
        })
        return z.NEVER
      }

      const [, amount, unit] = match
      const numAmount = Number.parseFloat(amount)

      switch (unit.toLowerCase()) {
        case "tgas":
          return BigInt(Math.floor(numAmount * Number(GAS_UNITS.TGAS))) as ValidatedGas
        case "ggas":
          return BigInt(Math.floor(numAmount * Number(GAS_UNITS.GGAS))) as ValidatedGas
        case "gas":
          return BigInt(Math.floor(numAmount)) as ValidatedGas
        default:
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Unknown gas unit. Supported: TGas, GGas, Gas",
          })
          return z.NEVER
      }
    }

    // BigInt - warn if suspiciously small
    if (value < 300n) {
      console.warn(`⚠️  Gas limit ${value} seems very small. Did you mean "${value} TGas"?`)
    }
    return value as ValidatedGas
  })

// NEAR token validation schema
export const nearSchema = z
  .union([
    z.string().regex(/^\d+(\.\d+)?\s*(NEAR|mNEAR|milliNEAR|μNEAR|microNEAR|yoctoNEAR|yocto)$/i),
    z.bigint(),
  ])
  .transform((value, ctx) => {
    if (typeof value === "string") {
      const match = value.match(
        /^(\d+(?:\.\d+)?)\s*(NEAR|mNEAR|milliNEAR|μNEAR|microNEAR|yoctoNEAR|yocto)$/i,
      )
      if (!match) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Invalid NEAR format. Use format like "0.01 NEAR", "500 mNEAR", "1000 μNEAR", or "100 yocto"',
        })
        return z.NEVER
      }

      const [, amount, unit] = match
      const numAmount = Number.parseFloat(amount)

      switch (unit.toLowerCase()) {
        case "near":
          return BigInt(Math.floor(numAmount * Number(NEAR_UNITS.NEAR))) as ValidatedNear
        case "mnear":
        case "millinear":
          return BigInt(Math.floor(numAmount * Number(NEAR_UNITS.MILLI_NEAR))) as ValidatedNear
        case "μnear":
        case "micronear":
          return BigInt(Math.floor(numAmount * Number(NEAR_UNITS.MICRO_NEAR))) as ValidatedNear
        case "yoctonear":
        case "yocto":
          return BigInt(Math.floor(numAmount)) as ValidatedNear
        default:
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Unknown NEAR unit. Supported: NEAR, mNEAR/milliNEAR, μNEAR/microNEAR, yoctoNEAR/yocto",
          })
          return z.NEVER
      }
    }

    // BigInt - warn if suspiciously small
    if (value < BigInt(10 ** 20)) {
      console.warn(
        `⚠️  NEAR amount ${value} yoctoNEAR seems very small. Did you mean a larger unit?`,
      )
    }
    return value as ValidatedNear
  })

// Main function call schema
export const callFunctionSchema = z.object({
  gasLimit: gasSchema,
  attachedDeposit: nearSchema,
})

// Type-safe helper constructors
export const gas = {
  tgas: (amount: number): ValidatedGas =>
    BigInt(Math.floor(amount * Number(GAS_UNITS.TGAS))) as ValidatedGas,
  ggas: (amount: number): ValidatedGas =>
    BigInt(Math.floor(amount * Number(GAS_UNITS.GGAS))) as ValidatedGas,
  raw: (amount: bigint): ValidatedGas => amount as ValidatedGas,
}

export const near = {
  near: (amount: number): ValidatedNear =>
    BigInt(Math.floor(amount * Number(NEAR_UNITS.NEAR))) as ValidatedNear,
  milli: (amount: number): ValidatedNear =>
    BigInt(Math.floor(amount * Number(NEAR_UNITS.MILLI_NEAR))) as ValidatedNear,
  micro: (amount: number): ValidatedNear =>
    BigInt(Math.floor(amount * Number(NEAR_UNITS.MICRO_NEAR))) as ValidatedNear,
  yocto: (amount: bigint): ValidatedNear => amount as ValidatedNear,
}

// Utility functions
export const gasUtils = {
  toTGas: (gasAmount: ValidatedGas): number => Number(gasAmount) / Number(GAS_UNITS.TGAS),
  toGGas: (gasAmount: ValidatedGas): number => Number(gasAmount) / Number(GAS_UNITS.GGAS),
  fromTGas: (amount: number): ValidatedGas => gas.tgas(amount),
  fromGGas: (amount: number): ValidatedGas => gas.ggas(amount),
  format: (gasAmount: ValidatedGas): string => {
    const tgas = Number(gasAmount) / Number(GAS_UNITS.TGAS)
    if (tgas >= 1) return `${tgas} TGas`
    const ggas = Number(gasAmount) / Number(GAS_UNITS.GGAS)
    if (ggas >= 1) return `${ggas} GGas`
    return `${gasAmount} Gas`
  },
}

export const nearUtils = {
  toNEAR: (yoctoAmount: ValidatedNear): number => Number(yoctoAmount) / Number(NEAR_UNITS.NEAR),
  toMilliNEAR: (yoctoAmount: ValidatedNear): number =>
    Number(yoctoAmount) / Number(NEAR_UNITS.MILLI_NEAR),
  toMicroNEAR: (yoctoAmount: ValidatedNear): number =>
    Number(yoctoAmount) / Number(NEAR_UNITS.MICRO_NEAR),
  fromNEAR: (amount: number): ValidatedNear => near.near(amount),
  fromMilliNEAR: (amount: number): ValidatedNear => near.milli(amount),
  fromMicroNEAR: (amount: number): ValidatedNear => near.micro(amount),
  format: (yoctoAmount: ValidatedNear): string => {
    const nearVal = Number(yoctoAmount) / Number(NEAR_UNITS.NEAR)
    if (nearVal >= 1) return `${nearVal} NEAR`
    const milli = Number(yoctoAmount) / Number(NEAR_UNITS.MILLI_NEAR)
    if (milli >= 1) return `${milli} mNEAR`
    const micro = Number(yoctoAmount) / Number(NEAR_UNITS.MICRO_NEAR)
    if (micro >= 1) return `${micro} μNEAR`
    return `${yoctoAmount} yocto`
  },
}
