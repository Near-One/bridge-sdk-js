---
"@near-one/bridge-sdk": minor
---

Migrate API client to v2 endpoints with enhanced functionality

- All endpoints migrated from /api/v1/ to /api/v2/
- Add support for transaction hash lookups in getTransfer() and getTransferStatus()
- Methods now return arrays to support batch transfers
- Add getBtcUserDepositAddress() method for BTC deposit addresses  
- Add utxo_transfer field to Transfer schema for Bitcoin support
- Add Bnb chain support
- Enhanced error handling and validation