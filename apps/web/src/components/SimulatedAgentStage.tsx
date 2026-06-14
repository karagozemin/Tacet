import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { Address, Hex } from "viem";

import { formatTokenAmount } from "../config/chain";
import { shortAddr } from "../lib/format";

interface StageAgent {
  key: string;
  displayName: string;
  initials: string;
  address: string;
  valueLabel: string;
  escrowLabel: string;
  color: string;
  rationale: string;
  ciphertext: string;
  source: "live" | "preview";
  liveRevealed: boolean;
  liveWinner: boolean;
  previewIndex?: number;
}

type ScenarioId = "auction" | "procurement" | "coordination" | "rfq";

interface LiveBidState {
  commitment: Hex;
  escrow: bigint;
  revealedValue: bigint;
  revealed: boolean;
  valid: boolean;
  settled: boolean;
}

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
  bidders,
  bidStates,
  winner,
  currentAddress,
  onRefresh,
}: {
  roundId: bigint;
  revealTriggered: boolean;
  scenario: ScenarioId;
  bidders: Address[];
  bidStates: Record<string, LiveBidState>;
  winner?: Address;
  currentAddress?: Address;
  onRefresh: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [revealRequested, setRevealRequested] = useState(false);
  const [revealedCount, setRevealedCount] = useState(0);

  const previewAgents = useMemo<StageAgent[]>(
    () => SCENARIO_AGENTS[scenario].map((agent, index) => ({
      key: `preview-${agent.name}`,
      displayName: `Agent ${agent.name}`,
      initials: agent.initials,
      address: agent.address,
      valueLabel: agent.value.toString(),
      escrowLabel: `${agent.escrow} TACET`,
      color: agent.color,
      rationale: agent.rationale,
      ciphertext: ciphertextFor(roundId, index),
      source: "preview",
      liveRevealed: false,
      liveWinner: false,
      previewIndex: index,
    })),
    [roundId, scenario],
  );
  const liveAgents = useMemo<StageAgent[]>(
    () => bidders.map((bidder, index) => {
      const state = bidStates[bidder];
      const isCurrent = bidder.toLowerCase() === currentAddress?.toLowerCase();
      return {
        key: `live-${bidder}`,
        displayName: isCurrent ? "Your bidder account" : `On-chain bidder ${index + 1}`,
        initials: isCurrent ? "YOU" : `L${index + 1}`,
        address: shortAddr(bidder, 8),
        valueLabel: state ? formatTokenAmount(state.revealedValue).replace(" TACET", "") : "—",
        escrowLabel: state ? formatTokenAmount(state.escrow) : "loading…",
        color: ["#8b72e8", "#54a7c7", "#d78964", "#67d39b"][index % 4]!,
        rationale: state?.revealed
          ? `Verified on-chain · ${state.valid ? "valid bid" : "invalid bid"}`
          : `Live commitment ${state ? shortAddr(state.commitment, 10) : "loading…"}`,
        ciphertext: state ? shortAddr(state.commitment, 10) : "loading…",
        source: "live",
        liveRevealed: Boolean(state?.revealed),
        liveWinner:
          Boolean(winner) &&
          winner !== "0x0000000000000000000000000000000000000000" &&
          bidder.toLowerCase() === winner?.toLowerCase(),
      };
    }),
    [bidders, bidStates, currentAddress, winner],
  );
  const agents = useMemo(() => [...liveAgents, ...previewAgents], [liveAgents, previewAgents]);
  const arrivalKey = bidders.join(":");
  const copy = SCENARIO_COPY[scenario];
  const previewWinner = Math.max(...SCENARIO_AGENTS[scenario].map((agent) => agent.value));
  const revealing = revealRequested || revealTriggered;

  useEffect(() => {
    setVisibleCount(0);
    setRevealRequested(false);
    setRevealedCount(0);
    const timers = agents.map((_, index) =>
      window.setTimeout(() => setVisibleCount(index + 1), 550 + index * 800),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [roundId, scenario, arrivalKey, agents.length]);

  useEffect(() => {
    if (!revealing || visibleCount < agents.length) return;
    const timers = previewAgents.map((_, index) =>
      window.setTimeout(() => setRevealedCount(index + 1), 300 + index * 700),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [revealing, visibleCount, agents.length, previewAgents]);

  return (
    <section className={`agent-stage ${revealing ? "revealing" : ""}`}>
      <header className="agent-stage-header">
        <div>
          <p className="eyebrow">{copy.eyebrow} · round #{roundId.toString()}</p>
          <h2>{revealing ? "The cue has sounded." : copy.title}</h2>
          <p>
            Live on-chain bidders and scenario agents enter the same sealed market. LIVE cards
            open only when their real commitment is revealed.
          </p>
        </div>
        <div className="agent-stage-actions">
          <span className="live-chain-badge">live · {bidders.length}</span>
          <button type="button" className="ghost-action" onClick={onRefresh}>Refresh</button>
          <button
            type="button"
            className="secondary-action"
            onClick={() => {
              setRevealedCount(0);
              setRevealRequested(true);
            }}
            disabled={visibleCount < agents.length || revealedCount === previewAgents.length}
          >
            {revealedCount === previewAgents.length ? "Preview revealed" : "Preview Drand reveal"}
          </button>
        </div>
      </header>

      <div className="arrival-line" aria-hidden>
        <span style={{ width: `${(visibleCount / agents.length) * 100}%` }} />
      </div>

      <div className="sim-agent-grid">
        {agents.map((agent, index) => {
          const visible = index < visibleCount;
          const revealed =
            agent.source === "live"
              ? agent.liveRevealed
              : (agent.previewIndex ?? 0) < revealedCount;
          const decrypting = agent.source === "preview" && revealing && visible && !revealed;
          const isWinner =
            agent.source === "live"
              ? agent.liveWinner
              : revealedCount === previewAgents.length &&
                agent.valueLabel === previewWinner.toString();
          return (
            <article
              key={agent.key}
              className={`sim-agent-card ${visible ? "arrived" : "queued"} ${
                revealed ? "revealed" : "sealed"
              } ${decrypting ? "decrypting" : ""} ${isWinner ? "winner" : ""} ${agent.source}`}
              style={{ "--agent-color": agent.color } as CSSProperties}
            >
              <div className="sim-agent-card-inner">
                <div className="sim-agent-face sim-agent-sealed">
                  <div className="crypto-state-banner">
                    <span className="crypto-lock" aria-hidden>⌁</span>
                    <div>
                      <strong>{decrypting ? "DECRYPTING WITH DRAND R" : agent.source === "live" ? "LIVE · TIMELOCKED" : "ENCRYPTED · TIMELOCKED"}</strong>
                      <small>{decrypting ? "opening ciphertext…" : "plaintext unavailable before cue"}</small>
                    </div>
                  </div>
                  <header>
                    <span className="agent-avatar">{agent.initials}</span>
                    <div>
                      <strong>{agent.displayName}</strong>
                      <small>{visible ? agent.address : "approaching round…"}</small>
                    </div>
                    <span className="agent-state">{visible ? agent.source === "live" ? "live · sealed" : "preview · sealed" : "queued"}</span>
                  </header>
                  <div className="cipher-field">
                    <span>{decrypting ? "decrypting ciphertext" : agent.source === "live" ? "live commitment" : "encrypted ciphertext"}</span>
                    <strong>{visible ? agent.ciphertext : "waiting for entrance cue"}</strong>
                    <div className="cipher-bars" aria-hidden>
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    {decrypting ? <div className="decrypt-scan" aria-hidden /> : null}
                  </div>
                  <footer>
                    <span>Escrow {agent.escrowLabel}</span>
                    <span>{agent.source === "live" ? "LIVE" : "PREVIEW"} · Value unreadable</span>
                  </footer>
                </div>

                <div className="sim-agent-face sim-agent-revealed">
                  <div className="crypto-state-banner opened">
                    <span className="crypto-lock" aria-hidden>✓</span>
                    <div>
                      <strong>{agent.source === "live" ? "LIVE · REVEALED ON-CHAIN" : "DECRYPTED · PUBLIC"}</strong>
                      <small>{agent.source === "live" ? "commitment verified by contract" : "Drand cue verified · plaintext opened"}</small>
                    </div>
                  </div>
                  <header>
                    <span className="agent-avatar">{agent.initials}</span>
                    <div>
                      <strong>{agent.displayName}</strong>
                      <small>{agent.address}</small>
                    </div>
                    <span className="agent-state">{isWinner ? "winner" : agent.source === "live" ? "live · revealed" : "preview · revealed"}</span>
                  </header>
                  <div className="revealed-value">
                    <span>{agent.source === "live" ? "real opened bid" : "opened bid"}</span>
                    <strong>{agent.valueLabel}</strong>
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
        <span>{visibleCount} / {agents.length} {copy.noun} arrived · {bidders.length} LIVE</span>
        <span>Live bidders auto-refresh every ~12 seconds.</span>
      </footer>
    </section>
  );
}
