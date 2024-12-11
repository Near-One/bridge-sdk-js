import { secp256k1 } from "@noble/curves/secp256k1"
import { sha256 } from "@noble/hashes/sha256"
import { assert, NearBindgen, call, near, view } from "near-sdk-js"

interface SignRequest {
  key_version: number
  path: string
  payload: Uint8Array
}

interface AffinePoint {
  affine_point: string
}

interface Scalar {
  scalar: string
}

interface SignatureResponse {
  big_r: AffinePoint
  s: Scalar
  recovery_id: number
}

const KEY_VERSION = 0

function constructSpoofKey(predecessor: Uint8Array, path: Uint8Array): Uint8Array {
  const data = new Uint8Array([...predecessor, 44, ...path]) // 44 is ASCII for comma
  return sha256(data)
}

@NearBindgen({})
class MockSignerContract {
  @call({ payableFunction: true })
  sign(request: SignRequest): SignatureResponse {
    assert(request.key_version === KEY_VERSION, "Key version not supported")

    const predecessor = near.predecessorAccountId()
    const signingKey = constructSpoofKey(
      new TextEncoder().encode(predecessor),
      new TextEncoder().encode(request.path),
    )

    const signature = secp256k1.sign(request.payload, signingKey)
    const recoveryId = signature.recovery || 0

    return {
      big_r: {
        affine_point: Buffer.from(signature.r.toString(16).padStart(64, "0"), "hex").toString(
          "base64",
        ),
      },
      s: {
        scalar: Buffer.from(signature.s.toString(16).padStart(64, "0"), "hex").toString("base64"),
      },
      recovery_id: recoveryId,
    }
  }

  @view({})
  publicKey(): string {
    return "secp256k1:37aFybhUHCxRdDkuCcB3yHzxqK7N8EQ745MujyAQohXSsYymVeHzhLxKvZ2qYeRHf3pGFiAsxqFJZjpF9gP2JV5u"
  }

  @view({})
  derivedPublicKey(path: string, predecessor?: string): string {
    const actualPredecessor = predecessor || near.predecessorAccountId()
    const signingKey = constructSpoofKey(
      new TextEncoder().encode(actualPredecessor),
      new TextEncoder().encode(path),
    )

    const publicKey = secp256k1.getPublicKey(signingKey, false)
    return `secp256k1:${Buffer.from(publicKey.slice(1)).toString("base64")}`
  }

  @view({})
  latestKeyVersion(): number {
    return KEY_VERSION
  }
}
