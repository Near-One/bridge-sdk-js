/**
 * Bridge factory and validation
 */

import { Near } from "near-kit"
import { BridgeAPI, type Chain, type PostAction, type UtxoChainParam } from "./api.js"
import { type ChainAddresses, getAddresses } from "./config.js"
import { ValidationError } from "./errors.js"
import {
  ChainKind,
  type Network,
  type OmniAddress,
  type TokenDecimals,
  type TransferParams,
  type UtxoChain,
  type ValidatedTransfer,
} from "./types.js"
import { getAddress, getChain, isEvmChain } from "./utils/address.js"
import { normalizeAmount, validateTransferAmount } from "./utils/decimals.js"

export interface BridgeConfig {
  network: Network
  rpcUrls?: Partial<Record<ChainKind, string>>
}

/**
 * Options for UTXO deposit address generation
 */
export interface UtxoDepositOptions {
  /**
   * Post-actions to execute after the deposit is finalized on NEAR.
   * Used for automatic bridging to other chains.
   */
  postActions?: PostAction[]
  /**
   * Extra message to include in the deposit
   */
  extraMsg?: string
}

/**
 * Result of UTXO deposit address generation
 */
export interface UtxoDepositResult {
  /**
   * The BTC/Zcash address to send funds to
   */
  address: string
  /**
   * The chain type
   */
  chain: UtxoChainParam
  /**
   * The recipient on NEAR
   */
  recipient: string
  /**
   * Post-actions if any were provided
   */
  postActions?: PostAction[]
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
   * Get deposit address for UTXO chain (BTC/Zcash).
   *
   * To deposit BTC or Zcash into the bridge:
   * 1. Call this method to get a deposit address
   * 2. Send funds to the returned address
   * 3. Wait for confirmation on the UTXO chain
   * 4. Finalize the deposit on NEAR using the BTC builder's proof methods
   *
   * @param chain - The UTXO chain (ChainKind.Btc or ChainKind.Zcash)
   * @param recipient - NEAR account ID to receive the bridged tokens
   * @param options - Optional post-actions for automatic bridging
   * @returns The deposit address and related info
   */
  getUtxoDepositAddress(
    chain: UtxoChain,
    recipient: string,
    options?: UtxoDepositOptions,
  ): Promise<UtxoDepositResult>

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
  private readonly near: Near

  constructor(config: BridgeConfig) {
    this.network = config.network
    this.addresses = getAddresses(config.network)
    this.api = new BridgeAPI(config.network)
    this.near = new Near({ network: config.network })
  }

  async validateTransfer(params: TransferParams): Promise<ValidatedTransfer> {
    // Extract chains from addresses
    const sourceChain = getChain(params.sender)
    const destChain = getChain(params.recipient)
    const tokenChain = getChain(params.token)

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

    // Look up bridged token first (needed for NEAR source tokens)
    let bridgedToken: OmniAddress | undefined
    if (tokenChain !== destChain) {
      const result = await this.getBridgedToken(params.token, destChain)
      if (result) {
        bridgedToken = result
      }
    }

    // Get token decimals for normalization
    // Decimals are stored in the NEAR bridge contract using foreign chain addresses as keys.
    // For NEAR tokens, we need to use the bridged token address on the destination chain.
    let tokenDecimals: TokenDecimals | null = null
    let originDecimals: number
    let destinationDecimals: number

    if (sourceChain === ChainKind.Near && tokenChain === ChainKind.Near) {
      // NEAR → Foreign: Query using bridged token on destination chain
      if (!bridgedToken) {
        throw new ValidationError(
          "Token not registered on destination chain",
          "TOKEN_NOT_REGISTERED",
          { token: params.token, destChain: ChainKind[destChain] },
        )
      }
      tokenDecimals = await this.getTokenDecimals(bridgedToken)
      if (!tokenDecimals) {
        throw new ValidationError("Token decimals not found", "TOKEN_NOT_REGISTERED", {
          token: bridgedToken,
        })
      }
      // For NEAR→Foreign: origin_decimals is NEAR decimals, decimals is destination chain decimals
      originDecimals = tokenDecimals.origin_decimals
      destinationDecimals = tokenDecimals.decimals
    } else if (destChain === ChainKind.Near) {
      // Foreign → NEAR: Query using source token address
      tokenDecimals = await this.getTokenDecimals(params.token)
      if (!tokenDecimals) {
        throw new ValidationError("Token not registered", "TOKEN_NOT_REGISTERED", {
          token: params.token,
        })
      }
      // For Foreign→NEAR: decimals is foreign chain decimals, origin_decimals is what it has on NEAR
      originDecimals = tokenDecimals.decimals
      destinationDecimals = tokenDecimals.origin_decimals
    } else {
      // Foreign → Foreign: Query source token
      tokenDecimals = await this.getTokenDecimals(params.token)
      if (!tokenDecimals) {
        throw new ValidationError("Token not registered", "TOKEN_NOT_REGISTERED", {
          token: params.token,
        })
      }
      originDecimals = tokenDecimals.decimals
      destinationDecimals = tokenDecimals.decimals
    }

    // Validate amount survives decimal normalization
    validateTransferAmount(params.amount, params.fee, originDecimals, destinationDecimals)

    // Normalize amounts
    const minDecimals = Math.min(originDecimals, destinationDecimals)
    const normalizedAmount = normalizeAmount(params.amount, originDecimals, minDecimals)
    const normalizedFee = normalizeAmount(params.fee, originDecimals, minDecimals)

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
    // Query the NEAR bridge contract directly
    const result = await this.near.view<TokenDecimals>(
      this.addresses.near.contract,
      "get_token_decimals",
      { address: token },
    )
    return result ?? null
  }

  async getBridgedToken(token: OmniAddress, destChain: ChainKind): Promise<OmniAddress | null> {
    // Query the NEAR bridge contract directly
    const chainName = chainKindToApiChain(destChain)
    const result = await this.near.view<string>(this.addresses.near.contract, "get_bridged_token", {
      chain: chainName,
      address: token,
    })
    return (result as OmniAddress) ?? null
  }

  async getUtxoDepositAddress(
    chain: UtxoChain,
    recipient: string,
    options?: UtxoDepositOptions,
  ): Promise<UtxoDepositResult> {
    // Convert ChainKind to API chain param
    const chainParam: UtxoChainParam = chain === ChainKind.Btc ? "btc" : "zcash"

    // Call the API to get the deposit address
    const response = await this.api.getUtxoDepositAddress(
      chainParam,
      recipient,
      options?.postActions,
      options?.extraMsg,
    )

    const result: UtxoDepositResult = {
      address: response.address,
      chain: chainParam,
      recipient,
    }

    if (options?.postActions) {
      result.postActions = options.postActions
    }

    return result
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
