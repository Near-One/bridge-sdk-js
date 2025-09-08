import { calculateStorageAccountId, type TransferMessage } from "../src/index.js"

// Example usage of calculateStorageAccountId function
function demonstrateStorageAccountIdCalculation() {
  console.log("=== Storage Account ID Calculation Demo ===\n")

  // Example 1: Basic NEAR transfer
  const nearTransfer: TransferMessage = {
    token: "near:wrap.near",
    amount: 1000000000000000000000000n, // 1 NEAR in yoctoNEAR
    recipient: "near:recipient.near",
    fee: 10000000000000000000000n, // 0.01 NEAR in yoctoNEAR
    sender: "near:sender.near",
    msg: "Storage deposit for bridge transfer",
  }

  const storageAccountId1 = calculateStorageAccountId(nearTransfer)
  console.log("Example 1 - NEAR Transfer:")
  console.log("Input:", JSON.stringify(nearTransfer, null, 2))
  console.log("Storage Account ID:", storageAccountId1)
  console.log()

  // Example 2: Cross-chain transfer
  const crossChainTransfer: TransferMessage = {
    token: "eth:0xA0b86a33E6441b5a93c5e90D3a7dDbF527E05e5E", // USDC on Ethereum
    amount: 1000000n, // 1 USDC (6 decimals)
    recipient: "sol:9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    fee: 10000n, // 0.01 USDC
    sender: "eth:0x742d35Cc6634C0532925a3b8D039C79E49906CDB",
    msg: "Cross-chain bridge to Solana",
  }

  const storageAccountId2 = calculateStorageAccountId(crossChainTransfer)
  console.log("Example 2 - Cross-chain Transfer:")
  console.log("Input:", JSON.stringify(crossChainTransfer, null, 2))
  console.log("Storage Account ID:", storageAccountId2)
  console.log()

  // Example 3: Demonstrate deterministic behavior
  const storageAccountId1Duplicate = calculateStorageAccountId(nearTransfer)
  console.log("Example 3 - Deterministic Behavior:")
  console.log("First calculation: ", storageAccountId1)
  console.log("Second calculation:", storageAccountId1Duplicate)
  console.log("Are they equal?    ", storageAccountId1 === storageAccountId1Duplicate)
  console.log()

  // Example 4: Show how small changes affect the result
  const modifiedTransfer: TransferMessage = {
    ...nearTransfer,
    amount: nearTransfer.amount + 1n, // Add 1 yoctoNEAR
  }

  const storageAccountId3 = calculateStorageAccountId(modifiedTransfer)
  console.log("Example 4 - Sensitivity to Changes:")
  console.log("Original amount: ", nearTransfer.amount)
  console.log("Modified amount: ", modifiedTransfer.amount)
  console.log("Original ID:     ", storageAccountId1)
  console.log("Modified ID:     ", storageAccountId3)
  console.log("Are they equal?  ", storageAccountId1 === storageAccountId3)
}

// Run the demonstration
demonstrateStorageAccountIdCalculation()