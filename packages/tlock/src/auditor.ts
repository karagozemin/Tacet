import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";

import { x25519 } from "@noble/curves/ed25519";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";

const EPH_PUB_BYTES = 32;
const NONCE_BYTES = 24;
const HKDF_INFO = new TextEncoder().encode("tacet/auditor-blob/v1");

export interface AuditorKeypair {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

export function generateAuditorKeypair(): AuditorKeypair {
  const secretKey = randomBytes(32);
  return { secretKey, publicKey: x25519.getPublicKey(secretKey) };
}

function deriveKey(shared: Uint8Array, ephPub: Uint8Array, auditorPub: Uint8Array): Uint8Array {
  const salt = new Uint8Array(EPH_PUB_BYTES * 2);
  salt.set(ephPub, 0);
  salt.set(auditorPub, EPH_PUB_BYTES);
  return hkdf(sha256, shared, salt, HKDF_INFO, 32);
}

export function sealIdentity(identity: Uint8Array, auditorPublicKey: Uint8Array): Uint8Array {
  const ephSecret = randomBytes(32);
  const ephPub = x25519.getPublicKey(ephSecret);
  const shared = x25519.getSharedSecret(ephSecret, auditorPublicKey);
  const key = deriveKey(shared, ephPub, auditorPublicKey);
  const nonce = randomBytes(NONCE_BYTES);
  const ct = xchacha20poly1305(key, nonce).encrypt(identity);

  const blob = new Uint8Array(EPH_PUB_BYTES + NONCE_BYTES + ct.length);
  blob.set(ephPub, 0);
  blob.set(nonce, EPH_PUB_BYTES);
  blob.set(ct, EPH_PUB_BYTES + NONCE_BYTES);
  return blob;
}

export function openIdentity(blob: Uint8Array, auditorSecretKey: Uint8Array): Uint8Array {
  if (blob.length < EPH_PUB_BYTES + NONCE_BYTES) throw new Error("auditor blob too short");
  const ephPub = blob.slice(0, EPH_PUB_BYTES);
  const nonce = blob.slice(EPH_PUB_BYTES, EPH_PUB_BYTES + NONCE_BYTES);
  const ct = blob.slice(EPH_PUB_BYTES + NONCE_BYTES);
  const auditorPub = x25519.getPublicKey(auditorSecretKey);
  const shared = x25519.getSharedSecret(auditorSecretKey, ephPub);
  const key = deriveKey(shared, ephPub, auditorPub);
  return xchacha20poly1305(key, nonce).decrypt(ct);
}
