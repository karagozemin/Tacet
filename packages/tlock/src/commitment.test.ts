import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { commitment, commitmentHex, encodeBidPreimage, fromHex, generateNonce, toHex, u128ToBeBytes } from "./commitment.js";

describe("commitment", () => {
  it("encodes uint128 big-endian preimage", () => {
    const nonce = new Uint8Array(32).fill(1);
    const preimage = encodeBidPreimage(1_000_000n, nonce);
    assert.equal(preimage.length, 48);
    assert.equal(toHex(preimage.slice(0, 16)), "000000000000000000000000000f4240");
  });

  it("commitment is deterministic", () => {
    const nonce = generateNonce();
    const a = commitment(42n, nonce);
    const b = commitment(42n, nonce);
    assert.equal(toHex(a), toHex(b));
    assert.match(commitmentHex(42n, nonce), /^0x[0-9a-f]{64}$/);
  });

  it("round-trips hex helpers", () => {
    const bytes = u128ToBeBytes(255n);
    assert.deepEqual(fromHex(toHex(bytes)), bytes);
  });
});
