// Manual test using absolute path
const path = require('path');
const utils = require(path.join(__dirname, 'dist/src/utils/index.js'));
const types = require(path.join(__dirname, 'dist/src/types/index.js'));

console.log('Available utils:', Object.keys(utils));
console.log('Available types:', Object.keys(types).slice(0, 10), '...');

const { validateOmniAddress, validateAddress } = utils;
const { ChainKind } = types;

console.log('ChainKind:', ChainKind);

console.log('Testing validateOmniAddress function...\n');

// Test valid addresses
console.log('✅ Valid addresses:');
try {
  const result1 = validateOmniAddress(ChainKind.Eth, '0x742d35cc6634c0532925a3b8d47cc67d971f111a');
  console.log(`  ETH: 0x742d35cc6634c0532925a3b8d47cc67d971f111a → ${result1} ✅`);
} catch (e) {
  console.log(`  ETH: ERROR: ${e.message} ❌`);
}

try {
  const result2 = validateOmniAddress(ChainKind.Near, 'alice.near');
  console.log(`  NEAR: alice.near → ${result2} ✅`);
} catch (e) {
  console.log(`  NEAR: ERROR: ${e.message} ❌`);
}

// Test invalid addresses  
console.log('\n❌ Invalid addresses (should throw errors):');
try {
  const result3 = validateOmniAddress(ChainKind.Eth, '0x123');
  console.log(`  ETH: 0x123 → ${result3} ❌ (should have thrown error)`);
} catch (e) {
  console.log(`  ETH: 0x123 → ERROR: ${e.message} ✅`);
}

try {
  const result4 = validateOmniAddress(ChainKind.Near, 'Alice.near');
  console.log(`  NEAR: Alice.near → ${result4} ❌ (should have thrown error)`);
} catch (e) {
  console.log(`  NEAR: Alice.near → ERROR: ${e.message} ✅`);
}

console.log('\n🎉 Manual validation test completed!');