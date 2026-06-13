import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

interface DemoAgent {
  name: string;
  initials: string;
  address: string;
  value: number;
  escrow: number;
  color: string;
  rationale: string;
  ciphertext: string;
}

type ScenarioId = "auction" | "procurement" | "coordination" | "rfq";

const SCENARIO_AGENTS = {
  auction: [{
    name: "Atlas",
    initials: "AT",
    address: "0xA71a…91C4",
    value: 84,
    escrow: 110,
    color: "#8b72e8",
    rationale: "Strong demand signal · mandate cap 110",
  }, {
    name: "Boreal",
    initials: "BO",
    address: "0xB04e…72F1",
    value: 67,
    escrow: 90,
    color: "#54a7c7",
    rationale: "Risk-adjusted appraisal · confidence 0.74",
  }, {
    name: "Cadenza",
    initials: "CA",
    address: "0xCad3…18E0",
    value: 92,
    escrow: 120,
    color: "#d78964",
    rationale: "Scarcity premium · mandate cap 120",
  }],
  procurement: [{
    name: "Northstar Supply", initials: "NS", address: "0xN0r7…21A4", value: 72, escrow: 100,
    color: "#8b72e8", rationale: "3-day delivery · 99.5% fulfillment SLA",
  }, {
    name: "Meridian Ops", initials: "MO", address: "0xM3r1…88C2", value: 64, escrow: 95,
    color: "#54a7c7", rationale: "7-day delivery · lowest compliant quote",
  }, {
    name: "Cobalt Works", initials: "CW", address: "0xC0ba…19E7", value: 78, escrow: 115,
    color: "#d78964", rationale: "24-hour delivery · premium assurance",
  }],
  coordination: [{
    name: "Vector", initials: "VE", address: "0xV3c7…A104", value: 81, escrow: 100,
    color: "#8b72e8", rationale: "Accumulate · confidence 0.81",
  }, {
    name: "Tempo", initials: "TE", address: "0x73mp…B822", value: 73, escrow: 100,
    color: "#54a7c7", rationale: "Provide liquidity · confidence 0.73",
  }, {
    name: "Signal", initials: "SI", address: "0x519n…C901", value: 88, escrow: 110,
    color: "#d78964", rationale: "Hold position · confidence 0.88",
  }],
  rfq: [{
    name: "Apex MM", initials: "AX", address: "0xAp3x…1104", value: 86, escrow: 100,
    color: "#8b72e8", rationale: "Firm for 30 seconds · tight spread",
  }, {
    name: "Bluefin", initials: "BF", address: "0xB1u3…72F1", value: 82, escrow: 100,
    color: "#54a7c7", rationale: "Firm for 2 minutes · balanced inventory",
  }, {
    name: "Citrine", initials: "CI", address: "0xC17r…18E0", value: 89, escrow: 110,
    color: "#d78964", rationale: "Firm for 5 minutes · protected quote",
  }],
} as const;

const SCENARIO_COPY = {
  auction: { eyebrow: "Auction room", title: "Bidders enter in silence.", noun: "bidders" },
  procurement: { eyebrow: "Supplier room", title: "Quotes arrive without anchoring.", noun: "suppliers" },
  coordination: { eyebrow: "Coordination room", title: "Strategies lock before execution.", noun: "agents" },
  rfq: { eyebrow: "Private RFQ room", title: "Market makers commit firm prices.", noun: "market makers" },
} as const;

function ciphertextFor(roundId: bigint, index: number): string {
  const seed = (roundId * 7919n + BigInt(index + 1) * 104729n).toString(16).padStart(12, "0");
  return `tlock:0x${seed.slice(0, 4)}…${seed.slice(-6)}`;
}

export function SimulatedAgentStage({
  roundId,
  revealTriggered,
  scenario,
}: {
  roundId: bigint;
  revealTriggered: boolean;
  scenario: ScenarioId;
}) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [revealRequested, setRevealRequested] = useState(false);
  const [revealedCount, setRevealedCount] = useState(0);

  const agents = useMemo<DemoAgent[]>(
    () =>
      SCENARIO_AGENTS[scenario].map((agent, index) => ({
        ...agent,
        ciphertext: ciphertextFor(roundId, index),
      })),
    [roundId, scenario],
  );
  const copy = SCENARIO_COPY[scenario];
  const winner = Math.max(...agents.map((agent) => agent.value));
  const revealing = revealRequested || revealTriggered;

  useEffect(() => {
    setVisibleCount(0);
    setRevealRequested(false);
    setRevealedCount(0);
    const timers = agents.map((_, index) =>
      window.setTimeout(() => setVisibleCount(index + 1), 550 + index * 800),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [roundId, agents]);

  useEffect(() => {
    if (!revealing || visibleCount < agents.length) return;
    const timers = agents.map((_, index) =>
      window.setTimeout(() => setRevealedCount(index + 1), 300 + index * 700),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [revealing, visibleCount, agents]);

  return (
    <section className={`agent-stage ${revealing ? "revealing" : ""}`}>
      <header className="agent-stage-header">
        <div>
          <p className="eyebrow">{copy.eyebrow} · scenario preview</p>
          <h2>{revealing ? "The cue has sounded." : copy.title}</h2>
          <p>
            A jury-facing preview of the multi-agent market experience. Values stay hidden behind
            Drand-style ciphertext until the cue.
          </p>
        </div>
        <div className="agent-stage-actions">
          <span className="simulation-badge">scenario preview</span>
          <button
            type="button"
            className="secondary-action"
            onClick={() => {
              setRevealedCount(0);
              setRevealRequested(true);
            }}
            disabled={visibleCount < agents.length || revealedCount === agents.length}
          >
            {revealedCount === agents.length ? "All bids revealed" : "Preview Drand reveal"}
          </button>
        </div>
      </header>

      <div className="arrival-line" aria-hidden>
        <span style={{ width: `${(visibleCount / agents.length) * 100}%` }} />
      </div>

      <div className="sim-agent-grid">
        {agents.map((agent, index) => {
          const visible = index < visibleCount;
          const revealed = index < revealedCount;
          const isWinner = revealedCount === agents.length && agent.value === winner;
          return (
            <article
              key={agent.name}
              className={`sim-agent-card ${visible ? "arrived" : "queued"} ${
                revealed ? "revealed" : "sealed"
              } ${isWinner ? "winner" : ""}`}
              style={{ "--agent-color": agent.color } as CSSProperties}
            >
              <div className="sim-agent-card-inner">
                <div className="sim-agent-face sim-agent-sealed">
                  <header>
                    <span className="agent-avatar">{agent.initials}</span>
                    <div>
                      <strong>Agent {agent.name}</strong>
                      <small>{visible ? agent.address : "approaching round…"}</small>
                    </div>
                    <span className="agent-state">{visible ? "sealed" : "queued"}</span>
                  </header>
                  <div className="cipher-field">
                    <span>encrypted bid</span>
                    <strong>{visible ? agent.ciphertext : "waiting for entrance cue"}</strong>
                    <div className="cipher-bars" aria-hidden>
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                  <footer>
                    <span>Escrow {agent.escrow} TACET</span>
                    <span>Value unreadable</span>
                  </footer>
                </div>

                <div className="sim-agent-face sim-agent-revealed">
                  <header>
                    <span className="agent-avatar">{agent.initials}</span>
                    <div>
                      <strong>Agent {agent.name}</strong>
                      <small>{agent.address}</small>
                    </div>
                    <span className="agent-state">{isWinner ? "winner" : "revealed"}</span>
                  </header>
                  <div className="revealed-value">
                    <span>opened bid</span>
                    <strong>{agent.value}</strong>
                    <small>TACET</small>
                  </div>
                  <p>{agent.rationale}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <footer className="stage-footnote">
        <span>{visibleCount} / {agents.length} preview {copy.noun} arrived</span>
        <span>Live protocol state and on-chain bidder count are shown separately.</span>
      </footer>
    </section>
  );
}
