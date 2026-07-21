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
  parseSpotId,
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
  /**
   * Hyperliquid spot identifier in the canonical `NAME:0x<32hex>` form (e.g.
   * `"USDC:0x6d1e7cde53ba9467b783cb7c530ce054"`).
   */
  spotId: string
  /** Amount in bridge ERC-20 wei units. Must be `> 0n`. */
  amount: bigint
  /** Recipient as an OmniAddress. HyperEVM destination → pool release; any other chain → routed via `OmniBridge.initTransfer`. */
  recipient: OmniAddress
  /**
   * Bridge fee in bridge ERC-20 wei (only used when `recipient` is not HyperEVM).
   * Must satisfy `0n <= fee < amount`.
   */
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
  /**
   * Pre-resolved HlBridgeToken ERC-20 `.decimals()` (= `weiDecimals + evm_extra_wei_decimals`
   * from `/info spotMeta`). Required together with `hlBridgeToken` to skip the lookup.
   */
  decimals?: number
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
    this.validateParams(params)

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

  private validateParams(params: HyperCoreTransferParams): void {
    if (params.amount <= 0n) {
      throw new Error(`amount must be > 0, got ${params.amount}`)
    }
    const fee = params.fee ?? 0n
    if (fee < 0n) {
      throw new Error(`fee must be >= 0, got ${fee}`)
    }
    const recipientChain = getChain(params.recipient)
    if (recipientChain !== ChainKind.HyperEvm && fee >= params.amount) {
      throw new Error(
        `fee (${fee}) must be strictly less than amount (${params.amount}) for ${ChainKind[recipientChain]} recipients`,
      )
    }
    if (params.hlBridgeToken !== undefined && params.decimals === undefined) {
      throw new Error("decimals must be supplied together with hlBridgeToken")
    }
    if (params.decimals !== undefined && params.hlBridgeToken === undefined) {
      throw new Error("hlBridgeToken must be supplied together with decimals")
    }
  }

  private async resolveSpotInfo(params: HyperCoreTransferParams): Promise<SpotTokenInfo> {
    if (params.hlBridgeToken !== undefined && params.decimals !== undefined) {
      // Validate the spotId format up front even on the offline path so callers
      // can't sign a malformed `token` field.
      parseSpotId(params.spotId)
      return {
        spotId: params.spotId,
        hlBridgeToken: params.hlBridgeToken,
        decimals: params.decimals,
      }
    }
    const fetchOpts: SpotMetaFetchOptions = this.fetchImpl ? { fetch: this.fetchImpl } : {}
    return resolveSpotTokenCached(this.apiUrl, params.spotId, fetchOpts)
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
