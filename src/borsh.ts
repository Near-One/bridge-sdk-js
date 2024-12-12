import { BorshSchema, borshSerialize } from "borsher"
import type { BindTokenArgs, FinDeployTokenArgs, FinTransferArgs, OmniAddress } from "./types"
import { Chain } from "./types"

const chainKindSchema = BorshSchema.Enum({
  Eth: BorshSchema.Unit,
  Near: BorshSchema.Unit,
  Sol: BorshSchema.Unit,
  Arb: BorshSchema.Unit,
  Base: BorshSchema.Unit,
})

const omniAddressSchema = BorshSchema.Enum({
  Eth: BorshSchema.String,
  Near: BorshSchema.String,
  Sol: BorshSchema.String,
  Arb: BorshSchema.String,
  Base: BorshSchema.String,
})

const transferIdSchema = BorshSchema.Struct({
  origin_chain: BorshSchema.String,
  origin_nonce: BorshSchema.u64,
})

const finTransferMessageSchema = BorshSchema.Struct({
  transfer_id: transferIdSchema,
  fee_recipient: BorshSchema.String,
  amount: BorshSchema.String,
  emitter_address: omniAddressSchema,
})

const logMetadataMessageSchema = BorshSchema.Struct({
  token_address: omniAddressSchema,
  name: BorshSchema.String,
  symbol: BorshSchema.String,
  decimals: BorshSchema.u8,
  emitter_address: omniAddressSchema,
})

const deployTokenMessageSchema = BorshSchema.Struct({
  token: BorshSchema.String,
  token_address: BorshSchema.String,
  emitter_address: omniAddressSchema,
})

const proverResultSchema = BorshSchema.Enum({
  InitTransfer: finTransferMessageSchema,
  FinTransfer: finTransferMessageSchema,
  DeployToken: deployTokenMessageSchema,
  LogMetadata: logMetadataMessageSchema,
})

const deployTokenArgsSchema = BorshSchema.Struct({
  chain_kind: chainKindSchema,
  prover_args: BorshSchema.Vec(BorshSchema.u8),
})

export type SerializedArgs<T> = Omit<T, "prover_args"> & {
  prover_args: Uint8Array
}

function serializeOmniAddress(addr: OmniAddress): { [key: string]: string } {
  const [chain, address] = addr.split(":")

  switch (chain) {
    case "eth":
      return { Eth: address }
    case "near":
      return { Near: address }
    case "sol":
      return { Sol: address }
    case "arb":
      return { Arb: address }
    case "base":
      return { Base: address }
    default:
      throw new Error(`Unknown chain: ${chain}`)
  }
}

function serializeChainKind(chain: Chain): { [key: string]: null } {
  switch (chain) {
    case Chain.Ethereum:
      return { Eth: null }
    case Chain.Near:
      return { Near: null }
    case Chain.Solana:
      return { Sol: null }
    case Chain.Arbitrum:
      return { Arb: null }
    case Chain.Base:
      return { Base: null }
  }
}

export function serializeDeployTokenArgs(args: FinDeployTokenArgs) {
  const emitter_address = serializeOmniAddress(args.prover_args.emitter_address)
  const token_address = serializeOmniAddress(args.prover_args.token_address)
  const wrappedMessage = {
    LogMetadata: {
      ...args.prover_args,
      token_address,
      emitter_address,
    },
  }
  const prover_args_vec: Uint8Array = borshSerialize(proverResultSchema, wrappedMessage)
  const deployTokenArgs = {
    chain_kind: serializeChainKind(args.chain_kind),
    prover_args: Array.from(prover_args_vec),
  }
  const result = borshSerialize(deployTokenArgsSchema, deployTokenArgs)
  return result
}

export function serializeBindTokenArgs(args: BindTokenArgs): SerializedArgs<BindTokenArgs> {
  const wrappedMessage = {
    DeployToken: args.prover_args,
  }
  return {
    ...args,
    prover_args: borshSerialize(proverResultSchema, wrappedMessage),
  }
}

export function serializeFinTransferArgs(args: FinTransferArgs): SerializedArgs<FinTransferArgs> {
  const wrappedMessage = {
    FinTransfer: args.prover_args,
  }
  return {
    ...args,
    prover_args: borshSerialize(proverResultSchema, wrappedMessage),
  }
}
