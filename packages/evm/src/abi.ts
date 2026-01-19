/**
 * Contract ABIs for EVM bridge interactions
 */

export const BRIDGE_TOKEN_FACTORY_ABI = [
  {
    name: "initTransfer",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "tokenAddress", type: "address" },
      { name: "amount", type: "uint128" },
      { name: "fee", type: "uint128" },
      { name: "nativeFee", type: "uint128" },
      { name: "recipient", type: "string" },
      { name: "message", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "finTransfer",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "signature", type: "bytes" },
      {
        name: "transferPayload",
        type: "tuple",
        components: [
          { name: "destinationNonce", type: "uint64" },
          { name: "originChain", type: "uint8" },
          { name: "originNonce", type: "uint64" },
          { name: "tokenAddress", type: "address" },
          { name: "amount", type: "uint128" },
          { name: "recipient", type: "address" },
          { name: "feeRecipient", type: "string" },
        ],
      },
    ],
    outputs: [],
  },
  {
    name: "deployToken",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "signatureData", type: "bytes" },
      {
        name: "metadata",
        type: "tuple",
        components: [
          { name: "token", type: "string" },
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "decimals", type: "uint8" },
        ],
      },
    ],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "logMetadata",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenAddress", type: "address" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "nearToEthToken",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "nearTokenId", type: "string" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "InitTransfer",
    type: "event",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "tokenAddress", type: "address", indexed: true },
      { name: "originNonce", type: "uint64", indexed: true },
      { name: "amount", type: "uint128", indexed: false },
      { name: "fee", type: "uint128", indexed: false },
      { name: "nativeTokenFee", type: "uint128", indexed: false },
      { name: "recipient", type: "string", indexed: false },
      { name: "message", type: "string", indexed: false },
    ],
  },
] as const

export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const
