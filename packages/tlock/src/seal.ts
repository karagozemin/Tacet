import { timelockEncrypt, timelockDecrypt, Buffer as TlockBuffer } from "tlock-js";

import {
  commitment,
  commitmentHex,
  decodeBidPreimage,
  encodeBidPreimage,
  generateNonce,
  nonceToBytes32,
} from "./commitment.js";
import { sealIdentity } from "./auditor.js";
import type { DrandClient } from "./quicknet.js";

export { generateNonce };

const utf8Encode = new TextEncoder();
const utf8Decode = new TextDecoder();

export interface SealBidParams {
  value: bigint;
  nonce: Uint8Array;
  round: number;
  client: DrandClient;
  identity?: Uint8Array;
  auditorPublicKey?: Uint8Array;
}

export interface SealedBid {
  commitment: Uint8Array;
  commitmentHex: `0x${string}`;
  ciphertext: Uint8Array;
  auditorBlob: Uint8Array;
  nonceHex: `0x${string}`;
}


export async function sealBid(params: SealBidParams): Promise<SealedBid> {
  const { value, nonce, round, client, identity, auditorPublicKey } = params;
  const preimage = encodeBidPreimage(value, nonce);
  const h = commitment(value, nonce);
  const armored = await timelockEncrypt(round, TlockBuffer.from(preimage), client);
  const ciphertext = new Uint8Array(utf8Encode.encode(armored));

  let auditorBlob = new Uint8Array(0);
  if (identity && auditorPublicKey) {
    auditorBlob = new Uint8Array(sealIdentity(identity, auditorPublicKey));
  } else if (identity || auditorPublicKey) {
    throw new Error("identity and auditorPublicKey must be provided together");
  }

  return {
    commitment: h,
    commitmentHex: commitmentHex(value, nonce),
    ciphertext,
    auditorBlob,
    nonceHex: nonceToBytes32(nonce),
  };
}

export interface OpenedBid {
  value: bigint;
  nonce: Uint8Array;
}

export async function openBid(ciphertext: Uint8Array, client: DrandClient): Promise<OpenedBid> {
  const armored = utf8Decode.decode(ciphertext);
  const plaintext = await timelockDecrypt(armored, client);
  return decodeBidPreimage(Uint8Array.from(plaintext));
}
