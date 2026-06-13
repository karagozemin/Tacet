import { createHash } from "node:crypto";

export const APPRAISAL_MODEL = "tacet-appraisal/v1";

export interface AppraisalAttributes {
  quality?: number;
  demand?: number;
  scarcity?: number;
  risk?: number;
}

export interface AppraisalRequest {
  itemRef: string;
  basePrice: number;
  category?: string;
  attributes?: AppraisalAttributes;
}

export interface Appraisal {
  model: typeof APPRAISAL_MODEL;
  itemRef: string;
  inputsHash: string;
  fairValue: number;
  low: number;
  high: number;
  confidence: number;
  suggestedMaxBid: number;
  rationale: string[];
}

const CATEGORY_MULTIPLIERS: Record<string, number> = {
  grant: 1.0,
  rfp: 1.05,
  bounty: 0.95,
  spectrum: 1.25,
  procurement: 1.1,
  collectible: 1.4,
  agentic: 1.15,
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function inputsHash(req: AppraisalRequest): string {
  return createHash("sha256").update(canonical(req)).digest("hex");
}

export function appraise(req: AppraisalRequest): Appraisal {
  const a = req.attributes ?? {};
  const quality = (a.quality ?? 50) / 100;
  const demand = (a.demand ?? 50) / 100;
  const scarcity = (a.scarcity ?? 50) / 100;
  const risk = (a.risk ?? 50) / 100;

  const qualityF = 0.5 + quality;
  const demandF = 0.6 + 0.8 * demand;
  const scarcityF = 0.7 + 0.6 * scarcity;
  const riskF = 1 - 0.4 * risk;
  const categoryF = req.category ? (CATEGORY_MULTIPLIERS[req.category] ?? 1.0) : 1.0;

  const fairValue = round2(req.basePrice * qualityF * demandF * scarcityF * riskF * categoryF);
  const provided = (["quality", "demand", "scarcity", "risk"] as const).filter((k) => a[k] !== undefined).length;
  const confidence = round2(clamp01(0.5 + 0.125 * provided));
  const band = (1 - confidence) * 0.5;
  const low = round2(fairValue * (1 - band));
  const high = round2(fairValue * (1 + band));
  const suggestedMaxBid = round2(fairValue * (0.8 + 0.15 * confidence));

  return {
    model: APPRAISAL_MODEL,
    itemRef: req.itemRef,
    inputsHash: inputsHash(req),
    fairValue,
    low,
    high,
    confidence,
    suggestedMaxBid,
    rationale: [
      `base ${req.basePrice} scaled by quality×${round2(qualityF)}, demand×${round2(demandF)}, scarcity×${round2(scarcityF)}, risk×${round2(riskF)}`,
      `category '${req.category ?? "none"}' multiplier ×${categoryF}`,
      `${provided}/4 attributes supplied → confidence ${confidence}`,
      `suggested max bid is fair value × ${round2(0.8 + 0.15 * confidence)}`,
    ],
  };
}

export function tokenUnitsFromUsdc(amount: number, decimals = 6): bigint {
  return BigInt(Math.round(amount * 10 ** decimals));
}

export function usdcFromTokenUnits(units: bigint, decimals = 6): number {
  return Number(units) / 10 ** decimals;
}
