import { createHash } from "node:crypto";
import { type Address, type Hex, verifyMessage } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { tokenUnitsFromUsdc } from "@tacet/appraisal";

export const MANDATE_VERSION = 1;

export interface SessionMandatePayload {
  version: typeof MANDATE_VERSION;
  principal: Address;
  sessionKey: Address;
  contractAddress: Address;
  roundId: string;
  itemRef: string;
  basePriceUsdc: number;
  category?: string;
  maxBidUnits: string;
  maxEscrowUnits: string;
  commitDeadline: number;
  issuedAt: number;
  expiresAt: number;
}

export interface SessionMandate extends SessionMandatePayload {
  signature: Hex;
}

export class MandateError extends Error {}
export class MandateCapError extends MandateError {}

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
};

export function mandateDigest(payload: SessionMandatePayload): Hex {
  const hash = createHash("sha256").update(canonical(payload)).digest("hex");
  return `0x${hash}` as Hex;
}

export interface CreateMandateParams {
  principalKey: Hex;
  contractAddress: Address;
  roundId: bigint | number;
  itemRef: string;
  basePriceUsdc: number;
  category?: string;
  maxBidUnits: bigint;
  maxEscrowUnits: bigint;
  commitDeadline: number;
  ttlSeconds?: number;
  sessionKey?: Hex;
}

export async function createSessionMandate(params: CreateMandateParams): Promise<{
  mandate: SessionMandate;
  sessionKey: Hex;
}> {
  const principal = privateKeyToAccount(params.principalKey);
  const sessionKey = params.sessionKey ?? generatePrivateKey();
  const session = privateKeyToAccount(sessionKey);
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionMandatePayload = {
    version: MANDATE_VERSION,
    principal: principal.address,
    sessionKey: session.address,
    contractAddress: params.contractAddress,
    roundId: String(params.roundId),
    itemRef: params.itemRef,
    basePriceUsdc: params.basePriceUsdc,
    category: params.category,
    maxBidUnits: String(params.maxBidUnits),
    maxEscrowUnits: String(params.maxEscrowUnits),
    commitDeadline: params.commitDeadline,
    issuedAt: now,
    expiresAt: now + (params.ttlSeconds ?? 3600),
  };
  const digest = mandateDigest(payload);
  const signature = await principal.signMessage({ message: { raw: digest } });
  return { mandate: { ...payload, signature }, sessionKey };
}

export async function verifySessionMandate(
  mandate: SessionMandate,
  opts?: { contractAddress?: Address; roundId?: bigint | number; now?: number },
): Promise<void> {
  if (mandate.version !== MANDATE_VERSION) throw new MandateError("unsupported mandate version");
  const { signature, ...payload } = mandate;
  const digest = mandateDigest(payload);
  const ok = await verifyMessage({
    address: mandate.principal,
    message: { raw: digest },
    signature,
  });
  if (!ok) throw new MandateError("invalid mandate signature");

  const now = opts?.now ?? Math.floor(Date.now() / 1000);
  if (now > mandate.expiresAt) throw new MandateError("mandate expired");
  if (now > mandate.commitDeadline) throw new MandateError("commit deadline passed");

  if (opts?.contractAddress && mandate.contractAddress !== opts.contractAddress) {
    throw new MandateError("contract address mismatch");
  }
  if (opts?.roundId !== undefined && mandate.roundId !== String(opts.roundId)) {
    throw new MandateError("roundId mismatch");
  }
  if (BigInt(mandate.maxBidUnits) > BigInt(mandate.maxEscrowUnits)) {
    throw new MandateError("maxBidUnits cannot exceed maxEscrowUnits");
  }
}

export function assertBidWithinMandate(mandate: SessionMandate, bidValue: bigint, escrow: bigint): void {
  if (bidValue <= 0n) throw new MandateCapError("bid must be positive");
  if (bidValue > BigInt(mandate.maxBidUnits)) throw new MandateCapError("bid exceeds mandate maxBid");
  if (escrow <= 0n) throw new MandateCapError("escrow must be positive");
  if (escrow > BigInt(mandate.maxEscrowUnits)) throw new MandateCapError("escrow exceeds mandate maxEscrow");
  if (bidValue > escrow) throw new MandateCapError("bid exceeds escrow");
}

export function bidFromAppraisal(
  suggestedMaxBidUsdc: number,
  mandate: SessionMandate,
  decimals = 6,
): { bidValue: bigint; escrow: bigint } {
  let bidValue = tokenUnitsFromUsdc(suggestedMaxBidUsdc, decimals);
  const maxBid = BigInt(mandate.maxBidUnits);
  const maxEscrow = BigInt(mandate.maxEscrowUnits);
  if (bidValue > maxBid) bidValue = maxBid;
  const escrow = bidValue <= maxEscrow ? bidValue : maxEscrow;
  assertBidWithinMandate(mandate, bidValue, escrow);
  return { bidValue, escrow };
}

export { tokenUnitsFromUsdc };
