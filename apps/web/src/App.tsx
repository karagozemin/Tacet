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

export default function App() {
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
  const finalStatus = evidence?.finalStatus ?? evidence?.keeper?.close?.finalStatus ?? deployment?.finalStatus ?? "Revealing";

  return (
    <div className="page">
      <header className="hero">
        <div className="brand">
          <img src="/tacet.png" alt="Tacet" className="logo" />
          <div>
            <h1>tacet</h1>
            <p className="tagline">Every agent enters on cue.</p>
          </div>
        </div>
        <p className="lede">
          Sealed coordination on <strong>Arbitrum</strong> — autonomous agents commit privately, stay silent until a
          neutral <strong>Drand</strong> signal, then reveal and settle deterministically.
        </p>
      </header>

      <section className="grid">
        <article className="panel">
          <h2>Live deployment</h2>
          <dl>
            <dt>Network</dt>
            <dd>Arbitrum Sepolia (421614)</dd>
            <dt>Round contract</dt>
            <dd className="mono">{deployment?.roundAddress ?? "Deploy with scripts/deploy-sepolia.ts"}</dd>
            <dt>Demo token</dt>
            <dd className="mono">{deployment?.tokenAddress ?? "TACET (6 decimals, demo only)"}</dd>
            <dt>Round ID</dt>
            <dd>{deployment?.roundId ?? "—"}</dd>
            <dt>Drand reveal round</dt>
            <dd>{evidence?.revealRound ?? "quicknet R"}</dd>
          </dl>
          {deployment?.explorer?.round && (
            <a className="link" href={deployment.explorer.round} target="_blank" rel="noreferrer">
              View on Arbiscan →
            </a>
          )}
        </article>

        <article className="panel lifecycle">
          <h2>Round lifecycle</h2>
          <div className="steps">
            {STATUS_FLOW.map((s, i) => (
              <div key={s} className={`step ${i === phase ? "active" : ""} ${i < phase ? "done" : ""}`}>
                <span className="dot" />
                {s}
              </div>
            ))}
          </div>
          <div className="cue-card">
            <div className="before">
              <h3>Before reveal</h3>
              <p>Ciphertext onchain. Values unreadable. No agent can react to another bid.</p>
            </div>
            <div className="after">
              <h3>After Drand cue</h3>
              <p>
                Keeper decrypts timelock seals, reveals bids, contract picks winner, refunds losers automatically.
              </p>
            </div>
          </div>
          <p className="status">Status: <strong>{finalStatus}</strong> {revealed ? `· ${revealed} bids revealed` : ""}</p>
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
              <p className="sealed">Bid: <strong>{String(a.bidValue) === "sealed" ? "██ sealed ██" : `${a.bidValue} TACET`}</strong></p>
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
          <li><strong>Timelock gate:</strong> Drand quicknet + tlock-js — bids cannot decrypt before round R.</li>
          <li><strong>Onchain BLS:</strong> Not deployed in this MVP. <code>openReveal</code> is time-gated after commit deadline.</li>
          <li><strong>Demo token:</strong> TACET is a mintable test ERC-20, not a production asset.</li>
          <li><strong>Attribution:</strong> Cryptographic patterns adapted from Sub Rosa; Tacet is an independent Arbitrum build.</li>
        </ul>
      </section>

      <footer className="footer">
        <img src="/tacet.png" alt="" className="footer-logo" aria-hidden />
        <p>Tacet · Arbitrum Open House London Buildathon · <span className="mono">/tass-it/</span></p>
      </footer>
    </div>
  );
}
