import { getStorageAccountId, type StorageTransferMessage } from "../src/index.js"

// Example usage of getStorageAccountId function
function demonstrateStorageAccountIdCalculation() {
  console.log("=== Storage Account ID Calculation Demo ===\n")

  // Example 1: Basic NEAR transfer
  const nearTransfer: StorageTransferMessage = {
    tokenAddress: "near:wrap.near",
    amount: 1000000000000000000000000n, // 1 NEAR in yoctoNEAR
    fee: 10000000000000000000000n, // 0.01 NEAR in yoctoNEAR
    nativeFee: 0n,
    recipient: "near:recipient.near",
    sender: "near:sender.near",
    message: "Storage deposit for bridge transfer",
  }

  const storageAccountId1 = getStorageAccountId(nearTransfer)
  console.log("Example 1 - NEAR Transfer:")
  console.log("Input:", JSON.stringify(nearTransfer, null, 2))
  console.log("Storage Account ID:", storageAccountId1)
  console.log()

  // Example 2: Cross-chain transfer
  const crossChainTransfer: StorageTransferMessage = {
    tokenAddress: "eth:0xA0b86a33E6441b5a93c5e90D3a7dDbF527E05e5E", // USDC on Ethereum
    amount: 1000000n, // 1 USDC (6 decimals)
    fee: 10000n, // 0.01 USDC
    nativeFee: 0n,
    recipient: "sol:9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    sender: "eth:0x742d35Cc6634C0532925a3b8D039C79E49906CDB",
    message: "Cross-chain bridge to Solana",
  }

  const storageAccountId2 = getStorageAccountId(crossChainTransfer)
  console.log("Example 2 - Cross-chain Transfer:")
  console.log("Input:", JSON.stringify(crossChainTransfer, null, 2))
  console.log("Storage Account ID:", storageAccountId2)
  console.log()

  // Example 3: Demonstrate deterministic behavior
  const storageAccountId1Duplicate = getStorageAccountId(nearTransfer)
  console.log("Example 3 - Deterministic Behavior:")
  console.log("First calculation: ", storageAccountId1)
  console.log("Second calculation:", storageAccountId1Duplicate)
  console.log("Are they equal?    ", storageAccountId1 === storageAccountId1Duplicate)
  console.log()

  // Example 4: Show how small changes affect the result
  const modifiedTransfer: StorageTransferMessage = {
    ...nearTransfer,
    amount: nearTransfer.amount + 1n, // Add 1 yoctoNEAR
  }

  const storageAccountId3 = getStorageAccountId(modifiedTransfer)
  console.log("Example 4 - Sensitivity to Changes:")
  console.log("Original amount: ", nearTransfer.amount)
  console.log("Modified amount: ", modifiedTransfer.amount)
  console.log("Original ID:     ", storageAccountId1)
  console.log("Modified ID:     ", storageAccountId3)
  console.log("Are they equal?  ", storageAccountId1 === storageAccountId3)
}

// Run the demonstration
demonstrateStorageAccountIdCalculation()