// Commitment byte encoding — matches TacetRound.sol sha256(abi.encodePacked(uint128, bytes32)).

import { createHash, randomBytes } from "node:crypto";

export const VALUE_BYTES = 16;
export const NONCE_BYTES = 32;
export const PREIMAGE_BYTES = VALUE_BYTES + NONCE_BYTES;

const U128_MAX = (1n << 128n) - 1n;

export function u128ToBeBytes(value: bigint): Uint8Array {
  if (value < 0n || value > U128_MAX) {
    throw new RangeError(`value ${value} out of uint128 range`);
  }
  const out = new Uint8Array(VALUE_BYTES);
  let v = value;
  for (let i = VALUE_BYTES - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

export function beBytesToU128(bytes: Uint8Array): bigint {
  if (bytes.length !== VALUE_BYTES) {
    throw new Error(`expected ${VALUE_BYTES} bytes, got ${bytes.length}`);
  }
  let u = 0n;
  for (const b of bytes) u = (u << 8n) | BigInt(b);
  return u;
}

export function encodeBidPreimage(value: bigint, nonce: Uint8Array): Uint8Array {
  if (nonce.length !== NONCE_BYTES) {
    throw new Error(`nonce must be ${NONCE_BYTES} bytes, got ${nonce.length}`);
  }
  const out = new Uint8Array(PREIMAGE_BYTES);
  out.set(u128ToBeBytes(value), 0);
  out.set(nonce, VALUE_BYTES);
  return out;
}

export function decodeBidPreimage(preimage: Uint8Array): { value: bigint; nonce: Uint8Array } {
  if (preimage.length !== PREIMAGE_BYTES) {
    throw new Error(`preimage must be ${PREIMAGE_BYTES} bytes, got ${preimage.length}`);
  }
  return {
    value: beBytesToU128(preimage.slice(0, VALUE_BYTES)),
    nonce: preimage.slice(VALUE_BYTES),
  };
}

export function generateNonce(): Uint8Array {
  return new Uint8Array(randomBytes(NONCE_BYTES));
}

export function commitment(value: bigint, nonce: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(encodeBidPreimage(value, nonce)).digest());
}

export function commitmentHex(value: bigint, nonce: Uint8Array): `0x${string}` {
  return `0x${toHex(commitment(value, nonce))}` as `0x${string}`;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("odd hex length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function nonceToBytes32(nonce: Uint8Array): `0x${string}` {
  if (nonce.length !== NONCE_BYTES) throw new Error("nonce must be 32 bytes");
  return `0x${toHex(nonce)}` as `0x${string}`;
}
