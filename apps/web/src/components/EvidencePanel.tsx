import { useEffect, useState } from "react";

interface Deployment {
  chainId?: number;
  network?: string;
  tokenAddress?: string;
  roundAddress?: string;
  roundId?: string;
  finalStatus?: string;
  explorer?: { token?: string; round?: string };
}

interface Evidence {
  revealRound?: number;
  agents?: Array<{
    agentName: string;
    bidder: string;
    bidValue: string | number;
    escrow: string | number;
    rationale: string[];
    appraisal?: { fairValue: number; suggestedMaxBid: number; confidence: number };
  }>;
  keeper?: {
    keep?: { revealed: string[]; txHashes: string[] };
    close?: { winner?: string; winningBid?: string | number; txHashes: string[]; finalStatus: string };
  };
  finalStatus?: string;
}

const STATUS_FLOW = ["Open", "Commit", "Sealed", "Drand cue", "Reveal", "Clear", "Settle"] as const;
const STATUS_DETAILS = [
  ["Round opened", "A new coordination window is published on Arbitrum."],
  ["Commit window", "Agents independently prepare and encrypt their decisions."],
  ["Values sealed", "Ciphertexts and escrow are on-chain, while values remain unreadable."],
  ["Shared cue", "Drand publishes the neutral public signal that unlocks the round."],
  ["Reveal window", "Sealed decisions open together for public verification."],
  ["Outcome cleared", "The contract deterministically selects the valid outcome."],
  ["Funds settled", "Payment and refunds complete on Arbitrum."],
] as const;

export function EvidencePanel() {
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [phase, setPhase] = useState(2);

  useEffect(() => {
    fetch("/deployment.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setDeployment)
      .catch(() => setDeployment(null));
    fetch("/sepolia-evidence.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setEvidence)
      .catch(() => setEvidence(null));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setPhase((p) => (p + 1) % STATUS_FLOW.length), 2200);
    return () => clearInterval(t);
  }, []);

  const agents = evidence?.agents ?? [
    {
      agentName: "Agent Atlas",
      bidder: "0x…sessionA",
      bidValue: "sealed",
      escrow: 250,
      rationale: ["Appraisal-driven bid within mandate caps"],
      appraisal: { fairValue: 58.2, suggestedMaxBid: 52.4, confidence: 0.75 },
    },
    {
      agentName: "Agent Boreal",
      bidder: "0x…sessionB",
      bidValue: "sealed",
      escrow: 250,
      rationale: ["Independent valuation — cannot see Atlas bid"],
      appraisal: { fairValue: 51.1, suggestedMaxBid: 46.0, confidence: 0.63 },
    },
  ];

  const revealed = evidence?.keeper?.keep?.revealed?.length;
  const finalStatus =
    evidence?.finalStatus ?? evidence?.keeper?.close?.finalStatus ?? deployment?.finalStatus ?? "Settled";

  return (
    <div className="evidence-page">
      <section className="case-hero">
        <div>
          <p className="eyebrow">Sepolia evidence</p>
          <h1>Recorded deployment</h1>
          <p className="lede">Autonomous agents + keeper completed round #1 on Arbitrum Sepolia.</p>
        </div>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>Live deployment</h2>
          <dl>
            <dt>Network</dt>
            <dd><span className="network-live-dot" />Arbitrum Sepolia <small>421614</small></dd>
            <dt>Round contract</dt>
            <dd className="mono">
              {deployment?.explorer?.round ? (
                <a href={deployment.explorer.round} target="_blank" rel="noreferrer">
                  {deployment.roundAddress ?? "—"} <span>↗</span>
                </a>
              ) : deployment?.roundAddress ?? "—"}
            </dd>
            <dt>Demo token</dt>
            <dd className="mono">
              {deployment?.explorer?.token ? (
                <a href={deployment.explorer.token} target="_blank" rel="noreferrer">
                  {deployment.tokenAddress ?? "—"} <span>↗</span>
                </a>
              ) : deployment?.tokenAddress ?? "—"}
            </dd>
            <dt>Round ID</dt>
            <dd>{deployment?.roundId ?? "—"}</dd>
            <dt>Drand reveal round</dt>
            <dd>{evidence?.revealRound ?? "—"}</dd>
          </dl>
          {deployment?.explorer?.round && (
            <a className="link" href={deployment.explorer.round} target="_blank" rel="noreferrer">
              View on Arbiscan →
            </a>
          )}
        </article>

        <article className="panel lifecycle">
          <h2>Round lifecycle</h2>
          <div className="steps lifecycle-steps">
            {STATUS_FLOW.map((s, i) => (
              <button
                key={s}
                type="button"
                className={`step ${i === phase ? "active" : ""} ${i < phase ? "done" : ""}`}
                aria-pressed={i === phase}
                onClick={() => setPhase(i)}
              >
                <span className="dot" />
                {s}
              </button>
            ))}
          </div>
          <div className="lifecycle-detail" key={phase}>
            <span>{String(phase + 1).padStart(2, "0")} / 07</span>
            <div>
              <strong>{STATUS_DETAILS[phase][0]}</strong>
              <p>{STATUS_DETAILS[phase][1]}</p>
            </div>
          </div>
          <p className="status">
            Status: <strong>{finalStatus}</strong> {revealed ? `· ${revealed} bids revealed` : ""}
          </p>
        </article>
      </section>

      <section className="agents">
        <h2>Autonomous agents</h2>
        <div className="agent-grid">
          {agents.map((a) => (
            <article key={a.agentName} className="agent-card">
              <header>
                <h3>{a.agentName}</h3>
                <span className="badge">mandate-bound</span>
              </header>
              <p className="mono">{a.bidder}</p>
              {a.appraisal && (
                <ul>
                  <li>Fair value: {a.appraisal.fairValue} TACET</li>
                  <li>Suggested max: {a.appraisal.suggestedMaxBid}</li>
                  <li>Confidence: {a.appraisal.confidence}</li>
                </ul>
              )}
              <p className="sealed">
                Bid:{" "}
                <strong>
                  {String(a.bidValue) === "sealed" ? "██ sealed ██" : `${a.bidValue} TACET`}
                </strong>
              </p>
              <ul className="rationale">
                {a.rationale.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="panel trust">
        <h2>Trust & limitations (honest)</h2>
        <ul>
          <li>
            <strong>Timelock gate:</strong> Drand quicknet + tlock-js — bids cannot decrypt before round R.
          </li>
          <li>
            <strong>Onchain BLS:</strong> Not deployed. <code>openReveal</code> is time-gated after commit
            deadline.
          </li>
          <li>
            <strong>Demo token:</strong> TACET is a mintable test ERC-20, not a production asset.
          </li>
        </ul>
      </section>
    </div>
  );
}
