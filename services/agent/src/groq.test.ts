import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { appraise } from "@tacet/appraisal";

import { requestGroqDecision } from "./groq.js";

const baseline = appraise({
  itemRef: "test-lot",
  basePrice: 100,
  category: "agentic",
  attributes: { quality: 70, demand: 80, scarcity: 50, risk: 30 },
});

function mockFetch(content: string): typeof fetch {
  return async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
}

describe("Groq agent decision", () => {
  it("parses and caps a structured bid decision", async () => {
    const decision = await requestGroqDecision(
      {
        apiKey: "test-key",
        agentName: "Atlas",
        itemRef: "test-lot",
        basePriceUsdc: 100,
        attributes: {},
        baseline,
        maxBidUsdc: 150,
      },
      mockFetch(JSON.stringify({
        suggestedBidUsdc: 175,
        confidence: 0.8,
        rationale: ["Strong demand", "Mandate remains binding"],
      })),
    );

    assert.equal(decision.suggestedBidUsdc, 150);
    assert.equal(decision.confidence, 0.8);
    assert.equal(decision.rationale.length, 2);
  });

  it("rejects malformed decisions", async () => {
    await assert.rejects(
      requestGroqDecision(
        {
          apiKey: "test-key",
          agentName: "Atlas",
          itemRef: "test-lot",
          basePriceUsdc: 100,
          attributes: {},
          baseline,
          maxBidUsdc: 150,
        },
        mockFetch(JSON.stringify({ suggestedBidUsdc: -1, confidence: 2, rationale: [] })),
      ),
      /non-positive bid/,
    );
  });
});
