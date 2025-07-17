import { sha256 } from "@noble/hashes/sha2"
import { hex } from "@scure/base"
import { MerkleTree } from "merkletreejs"

interface ContractDepositProof {
    merkle_proof: string[]
    tx_block_blockhash: string,
    tx_bytes: number[],
}

export class ZcashService {
    constructor(
        private apiUrl: string,
        private apiKey: string,
    ) { }

    // biome-ignore lint/suspicious/noExplicitAny: Generic RPC method
    private async rpc(method: string, params: any[] = []): Promise<any> {
        const response = await fetch(this.apiUrl, {
            method: "POST",
            headers: { "x-api-key": this.apiKey },
            body: JSON.stringify({ jsonrpc: "2.0", id: "1", method, params }),
        })

        const result = await response.json()
        if (result.error) throw new Error(result.error.message)
        return result.result
    }

    async getDepositProof(txHash: string): Promise<ContractDepositProof> {
        const txInfo = await this.rpc("getrawtransaction", [txHash, 1]) as { blockhash: string, hex: string }
        if (!txInfo.blockhash) throw new Error("Transaction not confirmed")

        const block = await this.rpc("getblock", [txInfo.blockhash, 1]) as { tx: string[] }

        const leaves = block.tx.map((id: string) => Buffer.from(hex.decode(id)))

        const tree = new MerkleTree(leaves, sha256, { isBitcoinTree: true })

        const targetIndex = block.tx.indexOf(txHash)
        const proof = tree.getProof(leaves[targetIndex], targetIndex)

        return {
            merkle_proof: proof.map((p) => hex.encode(p.data)),
            tx_block_blockhash: txInfo.blockhash,
            tx_bytes: Array.from(hex.decode(txInfo.hex)),
        }
    }
}

// Usage
const service = new ZcashService(
    "https://zcash-testnet.gateway.tatum.io/",
    "",
)

// Example
async function example() {
    try {
        const txHash = "e54da658a61074eb36ac8c9353da3348f899e9c012fd3ba11f22dca30ce9cf11"

        const proof = await service.getDepositProof(txHash)
        console.log("Proof:", proof)
    } catch (error) {
        console.error("Error:", error.message)
    }
}

example()
