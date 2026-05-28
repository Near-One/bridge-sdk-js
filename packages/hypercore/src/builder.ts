import { ChainKind, getAddress, getChain, type Network, type OmniAddress } from "@omni-bridge/core"
import type { Address, Hex } from "viem"
import {
  DEFAULT_GAS_LIMIT_INIT_TRANSFER,
  DEFAULT_GAS_LIMIT_TRANSFER,
  DEFAULT_SIGNATURE_CHAIN_ID,
  HYPERCORE_API_URL,
  HYPEREVM_CHAIN_ID,
  HYPERLIQUID_CHAIN,
} from "./config.js"
import {
  ACTION_INIT_TRANSFER,
  ACTION_TRANSFER,
  encodeInitTransferAction,
  encodeTransferAction,
} from "./encoders.js"
import { formatAmount } from "./format-amount.js"
import {
  resolveSpotTokenCached,
  type SpotMetaFetchOptions,
  type SpotTokenInfo,
} from "./spot-meta.js"
import { buildSendToEvmWithDataTypedData, type HyperCoreTypedData } from "./typed-data.js"
import type { SendToEvmWithDataAction } from "./types.js"

export interface HyperCoreBuilderConfig {
  network: Network
  /** Override Hyperliquid REST base URL. Defaults to the per-network mainnet/testnet API. */
  apiUrl?: string
  /** Override `signatureChainId` (hex string). Defaults to `0x66eee` (Arb-Sepolia). */
  signatureChainId?: string
  /** Custom fetch (e.g. for tests or proxies). Defaults to global `fetch`. */
  fetch?: typeof fetch
}

export interface HyperCoreTransferParams {
  /** Hyperliquid spot token name (e.g. "USDC", "PURR"). */
  spotToken: string
  /** Amount in bridge ERC-20 wei units. */
  amount: bigint
  /** Recipient as an OmniAddress. HyperEVM destination → pool release; any other chain → routed via `OmniBridge.initTransfer`. */
  recipient: OmniAddress
  /** Bridge fee in bridge ERC-20 wei (only used when `recipient` is not HyperEVM). */
  fee?: bigint
  /** Optional message forwarded with the bridge event (only used for non-HyperEVM recipients). */
  message?: string
  /** Override gas limit. Defaults to 800k for `initTransfer`, 300k for pool release. */
  gasLimit?: number
  /**
   * Pre-resolved HlBridgeToken contract on HyperEVM. When supplied together with `decimals`,
   * skips the `/info spotMeta` lookup — useful for offline/deterministic builds.
   */
  hlBridgeToken?: Address
  /** Pre-resolved bridge-token decimals (szDecimals + evmExtraWeiDecimals). */
  decimals?: number
  /** Pre-resolved Hyperliquid spot identifier (`NAME:0x<32hex>`). */
  spotId?: string
}

export interface HyperCoreUnsignedAction {
  /** Ready-to-post action JSON (omitting the signature/envelope). */
  action: SendToEvmWithDataAction
  /** EIP-712 typed-data envelope including a precomputed digest. */
  typedData: HyperCoreTypedData
  /** Resolved HlBridgeToken address (also present in `action.destinationRecipient`). */
  hlBridgeToken: Address
}

export interface HyperCoreBuilder {
  readonly network: Network
  readonly apiUrl: string
  buildTransfer(params: HyperCoreTransferParams): Promise<HyperCoreUnsignedAction>
}

class HyperCoreBuilderImpl implements HyperCoreBuilder {
  readonly network: Network
  readonly apiUrl: string
  private readonly signatureChainId: string
  private readonly fetchImpl: typeof fetch | undefined

  constructor(config: HyperCoreBuilderConfig) {
    this.network = config.network
    this.apiUrl = config.apiUrl ?? HYPERCORE_API_URL[config.network]
    this.signatureChainId = config.signatureChainId ?? DEFAULT_SIGNATURE_CHAIN_ID
    this.fetchImpl = config.fetch
  }

  async buildTransfer(params: HyperCoreTransferParams): Promise<HyperCoreUnsignedAction> {
    const spotInfo = await this.resolveSpotInfo(params)

    const data = this.encodeData(params)
    const isPoolRelease = data.actionTag === ACTION_TRANSFER
    const gasLimit =
      params.gasLimit ??
      (isPoolRelease ? DEFAULT_GAS_LIMIT_TRANSFER : DEFAULT_GAS_LIMIT_INIT_TRANSFER)

    const action: SendToEvmWithDataAction = {
      type: "sendToEvmWithData",
      hyperliquidChain: HYPERLIQUID_CHAIN[this.network],
      signatureChainId: this.signatureChainId,
      token: spotInfo.spotId,
      amount: formatAmount(params.amount, spotInfo.decimals),
      sourceDex: "spot",
      destinationRecipient: spotInfo.hlBridgeToken.toLowerCase(),
      addressEncoding: "hex",
      destinationChainId: HYPEREVM_CHAIN_ID[this.network],
      gasLimit,
      data: data.hex,
      nonce: currentMsNonce(),
    }

    return {
      action,
      typedData: buildSendToEvmWithDataTypedData(action),
      hlBridgeToken: spotInfo.hlBridgeToken,
    }
  }

  private async resolveSpotInfo(params: HyperCoreTransferParams): Promise<SpotTokenInfo> {
    if (
      params.hlBridgeToken !== undefined &&
      params.decimals !== undefined &&
      params.spotId !== undefined
    ) {
      return {
        spotId: params.spotId,
        hlBridgeToken: params.hlBridgeToken,
        decimals: params.decimals,
      }
    }
    const fetchOpts: SpotMetaFetchOptions = this.fetchImpl ? { fetch: this.fetchImpl } : {}
    const resolved = await resolveSpotTokenCached(this.apiUrl, params.spotToken, fetchOpts)
    return {
      spotId: params.spotId ?? resolved.spotId,
      hlBridgeToken: params.hlBridgeToken ?? resolved.hlBridgeToken,
      decimals: params.decimals ?? resolved.decimals,
    }
  }

  private encodeData(params: HyperCoreTransferParams): { hex: Hex; actionTag: number } {
    const recipientChain = getChain(params.recipient)
    if (recipientChain === ChainKind.HyperEvm) {
      const evmAddr = getAddress(params.recipient) as Address
      return { hex: encodeTransferAction(evmAddr), actionTag: ACTION_TRANSFER }
    }
    return {
      hex: encodeInitTransferAction(params.fee ?? 0n, params.recipient, params.message ?? ""),
      actionTag: ACTION_INIT_TRANSFER,
    }
  }
}

export function createHyperCoreBuilder(config: HyperCoreBuilderConfig): HyperCoreBuilder {
  return new HyperCoreBuilderImpl(config)
}

function currentMsNonce(): number {
  return Date.now()
}
