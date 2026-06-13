import type { Appraisal, AppraisalAttributes } from "@tacet/appraisal";

export const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

export interface GroqDecisionRequest {
  apiKey: string;
  agentName: string;
  persona?: string;
  itemRef: string;
  category?: string;
  basePriceUsdc: number;
  attributes: AppraisalAttributes;
  baseline: Appraisal;
  maxBidUsdc: number;
  model?: string;
}

export interface GroqDecision {
  source: "groq";
  model: string;
  suggestedBidUsdc: number;
  confidence: number;
  rationale: string[];
}

interface GroqChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

function asFiniteNumber(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Groq response has invalid ${field}`);
  return parsed;
}

function parseDecision(content: string, model: string, maxBidUsdc: number): GroqDecision {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const suggested = asFiniteNumber(parsed.suggestedBidUsdc, "suggestedBidUsdc");
  const confidence = asFiniteNumber(parsed.confidence, "confidence");
  const rationale = Array.isArray(parsed.rationale)
    ? parsed.rationale.filter((line): line is string => typeof line === "string").slice(0, 4)
    : [];

  if (suggested <= 0) throw new Error("Groq response suggested a non-positive bid");
  if (rationale.length === 0) throw new Error("Groq response has no rationale");

  return {
    source: "groq",
    model,
    suggestedBidUsdc: Math.min(suggested, maxBidUsdc),
    confidence: Math.min(1, Math.max(0, confidence)),
    rationale,
  };
}

export async function requestGroqDecision(
  request: GroqDecisionRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<GroqDecision> {
  const model = request.model ?? DEFAULT_GROQ_MODEL;
  const response = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            `You are ${request.agentName}, an autonomous bidding agent.`,
            request.persona ?? "Be disciplined, evidence-driven, and willing to lose rather than overpay.",
            "Return only valid JSON with suggestedBidUsdc, confidence, and rationale.",
            "confidence must be between 0 and 1. rationale must contain 2-4 concise strings.",
            "Never exceed the supplied maximum bid.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Independently choose a sealed bid for this opportunity.",
            opportunity: {
              itemRef: request.itemRef,
              category: request.category ?? "unspecified",
              basePriceUsdc: request.basePriceUsdc,
              privateAttributes: request.attributes,
            },
            deterministicBaseline: {
              fairValue: request.baseline.fairValue,
              low: request.baseline.low,
              high: request.baseline.high,
              suggestedMaxBid: request.baseline.suggestedMaxBid,
            },
            mandate: { maxBidUsdc: request.maxBidUsdc },
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API ${response.status}: ${await response.text()}`);
  }

  const body = (await response.json()) as GroqChatResponse;
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq API returned no decision");
  return parseDecision(content, model, request.maxBidUsdc);
}
