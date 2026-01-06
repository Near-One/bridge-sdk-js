/**
 * Bridge factory and validation
 */

import { BridgeAPI, type Chain } from "./api.js"
import { type ChainAddresses, getAddresses } from "./config.js"
import { ValidationError } from "./errors.js"
import {
  ChainKind,
  type Network,
  type OmniAddress,
  type TokenDecimals,
  type TransferParams,
  type ValidatedTransfer,
} from "./types.js"
import { getAddress, getChain, isEvmChain } from "./utils/address.js"
import { normalizeAmount, validateTransferAmount } from "./utils/decimals.js"

export interface BridgeConfig {
  network: Network
  rpcUrls?: Partial<Record<ChainKind, string>>
}

/**
 * Bridge instance for validating transfers and accessing API
 */
export interface Bridge {
  readonly network: Network
  readonly addresses: ChainAddresses

  /**
   * Validate transfer parameters and prepare for execution
   */
  validateTransfer(params: TransferParams): Promise<ValidatedTransfer>

  /**
   * Get token decimal information
   */
  getTokenDecimals(token: OmniAddress): Promise<TokenDecimals | null>

  /**
   * Get bridged token on destination chain
   */
  getBridgedToken(token: OmniAddress, destChain: ChainKind): Promise<OmniAddress | null>

  /**
   * API client for direct access
   */
  api: BridgeAPI
}

/**
 * Map ChainKind to API Chain name
 */
function chainKindToApiChain(chain: ChainKind): Chain {
  const mapping: Record<ChainKind, Chain> = {
    [ChainKind.Eth]: "Eth",
    [ChainKind.Near]: "Near",
    [ChainKind.Sol]: "Sol",
    [ChainKind.Arb]: "Arb",
    [ChainKind.Base]: "Base",
    [ChainKind.Bnb]: "Bnb",
    [ChainKind.Btc]: "Btc",
    [ChainKind.Zcash]: "Zcash",
    [ChainKind.Pol]: "Pol",
  }
  return mapping[chain]
}

/**
 * Get the contract address for a source chain
 */
function getContractAddress(addresses: ChainAddresses, chain: ChainKind): string {
  switch (chain) {
    case ChainKind.Eth:
      return addresses.eth.bridge
    case ChainKind.Arb:
      return addresses.arb.bridge
    case ChainKind.Base:
      return addresses.base.bridge
    case ChainKind.Bnb:
      return addresses.bnb.bridge
    case ChainKind.Pol:
      return addresses.pol.bridge
    case ChainKind.Near:
      return addresses.near.contract
    case ChainKind.Sol:
      return addresses.sol.locker
    case ChainKind.Btc:
      return addresses.btc.btcConnector
    case ChainKind.Zcash:
      return addresses.zcash.zcashConnector
  }
}

class BridgeImpl implements Bridge {
  readonly network: Network
  readonly addresses: ChainAddresses
  readonly api: BridgeAPI

  constructor(config: BridgeConfig) {
    this.network = config.network
    this.addresses = getAddresses(config.network)
    this.api = new BridgeAPI(config.network)
  }

  async validateTransfer(params: TransferParams): Promise<ValidatedTransfer> {
    // Extract chains from addresses
    const sourceChain = getChain(params.sender)
    const destChain = getChain(params.recipient)

    // Basic validation
    if (params.amount <= 0n) {
      throw new ValidationError("Amount must be positive", "INVALID_AMOUNT", {
        amount: params.amount.toString(),
      })
    }

    if (params.fee < 0n) {
      throw new ValidationError("Fee cannot be negative", "INVALID_AMOUNT", {
        fee: params.fee.toString(),
      })
    }

    if (params.nativeFee < 0n) {
      throw new ValidationError("Native fee cannot be negative", "INVALID_AMOUNT", {
        nativeFee: params.nativeFee.toString(),
      })
    }

    // Validate EVM addresses have proper checksum
    if (isEvmChain(sourceChain)) {
      const senderAddr = getAddress(params.sender)
      if (!isValidEvmAddress(senderAddr)) {
        throw new ValidationError("Invalid EVM sender address", "INVALID_ADDRESS", {
          address: params.sender,
        })
      }
    }

    if (isEvmChain(destChain)) {
      const recipientAddr = getAddress(params.recipient)
      if (!isValidEvmAddress(recipientAddr)) {
        throw new ValidationError("Invalid EVM recipient address", "INVALID_ADDRESS", {
          address: params.recipient,
        })
      }
    }

    // Get token decimals for normalization
    const tokenDecimals = await this.getTokenDecimals(params.token)
    if (!tokenDecimals) {
      throw new ValidationError("Token not registered", "TOKEN_NOT_REGISTERED", {
        token: params.token,
      })
    }

    // Validate amount survives decimal normalization
    validateTransferAmount(
      params.amount,
      params.fee,
      tokenDecimals.origin_decimals,
      tokenDecimals.decimals,
    )

    // Normalize amounts
    const minDecimals = Math.min(tokenDecimals.origin_decimals, tokenDecimals.decimals)
    const normalizedAmount = normalizeAmount(
      params.amount,
      tokenDecimals.origin_decimals,
      minDecimals,
    )
    const normalizedFee = normalizeAmount(params.fee, tokenDecimals.origin_decimals, minDecimals)

    // Look up bridged token if needed
    let bridgedToken: OmniAddress | undefined
    const tokenChain = getChain(params.token)
    if (tokenChain !== destChain) {
      const result = await this.getBridgedToken(params.token, destChain)
      if (result) {
        bridgedToken = result
      }
    }

    // Get contract address for source chain
    const contractAddress = getContractAddress(this.addresses, sourceChain)

    return {
      params,
      sourceChain,
      destChain,
      normalizedAmount,
      normalizedFee,
      contractAddress,
      bridgedToken,
    }
  }

  async getTokenDecimals(token: OmniAddress): Promise<TokenDecimals | null> {
    return this.api.getTokenDecimals(token)
  }

  async getBridgedToken(token: OmniAddress, destChain: ChainKind): Promise<OmniAddress | null> {
    const apiChain = chainKindToApiChain(destChain)
    return this.api.getBridgedToken(token, apiChain)
  }
}

/**
 * Validate EVM address format (basic hex check)
 */
function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

/**
 * Create a Bridge instance
 */
export function createBridge(config: BridgeConfig): Bridge {
  return new BridgeImpl(config)
}
