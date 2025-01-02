export interface AffinePoint {
  affine_point: string
}

export interface Scalar {
  scalar: string
}

export interface SignatureResponse {
  big_r: AffinePoint
  s: Scalar
  recovery_id: number
  toBytes(): Uint8Array
}

function fromHex(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) || [])
}

export class MPCSignature implements SignatureResponse {
  constructor(
    public big_r: AffinePoint,
    public s: Scalar,
    public recovery_id: number,
  ) {}

  toBytes(forEvm = false): Uint8Array {
    const bigRBytes = fromHex(this.big_r.affine_point)
    const sBytes = fromHex(this.s.scalar)
    const result = [...bigRBytes.slice(1), ...sBytes, this.recovery_id + (forEvm ? 27 : 0)]
    return new Uint8Array(result)
  }
}
