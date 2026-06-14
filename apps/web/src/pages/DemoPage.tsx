import { useEffect, useLayoutEffect, useState } from "react";
import { zeroAddress } from "viem";
import { EvidencePanel } from "../components/EvidencePanel";
import { SimulatedAgentStage } from "../components/SimulatedAgentStage";
import {
  COMMIT_DURATION_PRESETS,
  DEFAULT_COMMIT_DURATION_SECONDS,
  LOGO_SRC,
  ROUND_ADDRESS,
  TOKEN_ADDRESS,
  arbiscanAddress,
  formatTokenAmount,
} from "../config/chain";
import { useRoundSession } from "../hooks/useRoundSession";
import type { RoundHistoryEntry } from "../hooks/useRoundSession";
import { shortAddr } from "../lib/format";

type DemoMode = "live" | "history" | "evidence";
type UseCaseId = "auction" | "procurement" | "coordination" | "rfq";

const USE_CASES = [
  {
    id: "auction",
    index: "01",
    label: "Agent auction",
    title: "sealed coordination",
    description: "Agents bid privately, wait for Drand, then reveal and settle together.",
    payoff: "Stops copy-bidding",
    roundNoun: "auction",
    participantNoun: "bidder",
    commitStep: "Seal bid",
    revealStep: "Open bids",
    commitTitle: "Seal your bid",
    commitDetail: "Set your private valuation. No rival agent can read or react to it before Drand R.",
    inputLabel: "Private bid amount",
    actionLabel: "Seal auction bid",
    escrowLabel: "Bid escrow",
    decisionLabel: "Bidding posture",
    decisions: ["Value disciplined", "Balanced", "Win priority"],
  },
  {
    id: "procurement",
    index: "02",
    label: "Private procurement",
    title: "private procurement",
    description: "Supplier agents submit sealed quotes without anchoring to competitors.",
    payoff: "Fair supplier pricing",
    roundNoun: "procurement request",
    participantNoun: "supplier",
    commitStep: "Seal quote",
    revealStep: "Open quotes",
    commitTitle: "Submit a sealed supplier quote",
    commitDetail: "Price the contract and choose an SLA. Competing supplier quotes remain unreadable.",
    inputLabel: "Supplier quote",
    actionLabel: "Seal supplier quote",
    escrowLabel: "Performance bond",
    decisionLabel: "Delivery SLA",
    decisions: ["24 hours", "3 days", "7 days"],
  },
  {
    id: "coordination",
    index: "03",
    label: "Agent coordination",
    title: "coordinated intent",
    description: "Agents commit to strategies before a shared public execution cue.",
    payoff: "No reactive decisions",
    roundNoun: "coordination window",
    participantNoun: "agent",
    commitStep: "Lock intent",
    revealStep: "Open intents",
    commitTitle: "Lock your execution intent",
    commitDetail: "Commit a strategy and confidence stake before any collaborating agent can adapt.",
    inputLabel: "Confidence stake",
    actionLabel: "Seal execution intent",
    escrowLabel: "Coordination stake",
    decisionLabel: "Execution strategy",
    decisions: ["Accumulate", "Hold position", "Provide liquidity"],
  },
  {
    id: "rfq",
    index: "04",
    label: "Private RFQ",
    title: "sealed request for quote",
    description: "Market makers answer an RFQ without leaking prices before close.",
    payoff: "Protects price intent",
    roundNoun: "RFQ",
    participantNoun: "market maker",
    commitStep: "Seal price",
    revealStep: "Open prices",
    commitTitle: "Answer the RFQ privately",
    commitDetail: "Choose a firm quote and validity window without leaking price intent to other makers.",
    inputLabel: "Firm quote price",
    actionLabel: "Seal RFQ response",
    escrowLabel: "Quote collateral",
    decisionLabel: "Quote validity",
    decisions: ["30 seconds", "2 minutes", "5 minutes"],
  },
] as const;

function FlowSteps({
  address,
  roundId,
  roundConfirmed,
  committed,
  revealed,
  commitClosed,
  working,
  useCase,
}: {
  address: string | null;
  roundId: bigint | null;
  roundConfirmed: boolean;
  committed: boolean;
  revealed: boolean;
  commitClosed: boolean;
  working: boolean;
  useCase: (typeof USE_CASES)[number];
}) {
  const steps = [
    { label: "Wallet", detail: address ? shortAddr(address) : "connect", done: Boolean(address) },
    {
      label: "Round",
      detail: roundId == null ? "create" : roundConfirmed ? `#${roundId}` : "confirming",
      done: roundConfirmed,
    },
    { label: useCase.commitStep, detail: committed ? "on-chain" : "commit", done: committed },
    { label: useCase.revealStep, detail: revealed ? "opened" : "after R", done: revealed },
  ];
  const activeIndex = steps.findIndex((s) => !s.done);

  return (
    <section className={`flow-steps ${working ? "working" : ""}`}>
      {steps.map((step, index) => {
        const expired = index === 2 && roundConfirmed && !committed && commitClosed;
        const state = step.done ? "done" : expired ? "expired" : index === activeIndex ? "active" : "idle";
        return (
          <div key={step.label} className={`flow-step ${state}`}>
            <span>{step.done ? "✓" : expired ? "×" : working && state === "active" ? "…" : index + 1}</span>
            <div>
              <strong>{step.label}</strong>
              <small>{expired ? "window closed" : working && state === "active" ? "confirming on-chain" : step.detail}</small>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function LivePanel({
  session,
  useCase,
}: {
  session: ReturnType<typeof useRoundSession>;
  useCase: (typeof USE_CASES)[number];
}) {
  const {
    address,
    isConnected,
    wrongChain,
    walletStatus,
    bidAmount,
    setBidAmount,
    roundId,
    status,
    log,
    tokenBalance,
    live,
    bidders,
    bidStates,
    targetRound,
    drandGate,
    commitSecondsRemaining,
    revealSecondsRemaining,
    commitClosed,
    revealClosed,
    hasCommitted,
    revealedCount,
    revealProgress,
    canUseContract,
    connect,
    switchNetwork,
    disconnect,
    mintDemoTokens,
    createRound,
    joinRound,
    commitBid,
    openAndReveal,
    finalizeRound,
    leaveRound,
    refresh,
    formatCountdown,
  } = session;

  const [joinId, setJoinId] = useState("");
  const [duration, setDuration] = useState(DEFAULT_COMMIT_DURATION_SECONDS);
  const [decisions, setDecisions] = useState<Record<UseCaseId, string>>({
    auction: USE_CASES[0].decisions[1],
    procurement: USE_CASES[1].decisions[1],
    coordination: USE_CASES[2].decisions[1],
    rfq: USE_CASES[3].decisions[1],
  });
  const working = status === "working";

  let tone = "idle";
  let title = "Connect wallet";
  let detail = "Use MetaMask on Arbitrum Sepolia to run a sealed round end-to-end.";
  let timerLabel = "Status";
  let timerValue = "ready";
  let ctaLabel = "Connect MetaMask";
  let cta: () => void = () => void connect();
  let ctaDisabled = working;
  let showCta = true;
  let showBidInput = false;

  if (wrongChain) {
    tone = "danger";
    title = "Wrong network";
    detail = "Switch MetaMask to Arbitrum Sepolia (chain 421614).";
    timerValue = "wrong chain";
    ctaLabel = "Switch network";
    cta = () => void switchNetwork();
  } else if (isConnected && !canUseContract) {
    tone = "danger";
    title = "Contract not configured";
    detail = "Set VITE_ROUND_ADDRESS in apps/web/.env.local";
    ctaDisabled = true;
  } else if (isConnected && roundId == null) {
    tone = "ready";
    title = "Choose your entrance";
    detail = "Create a fresh sealed round or enter a round number shared by another bidder.";
    timerValue = "lobby";
    showCta = false;
  } else if (roundId != null && !hasCommitted && !commitClosed) {
    tone = "urgent";
    if ((tokenBalance ?? 0n) < BigInt(bidAmount * 1_000_000)) {
      title = `Fund your ${useCase.roundNoun}`;
      detail = `Mint free demo TACET, then lock it as ${useCase.escrowLabel.toLowerCase()}.`;
      ctaLabel = "Mint 1000 TACET";
      cta = () => void mintDemoTokens();
    } else {
      title = useCase.commitTitle;
      detail = `${useCase.commitDetail} Seal before the selected Drand cue arrives.`;
      ctaLabel = useCase.actionLabel;
      cta = () => void commitBid();
    }
    timerLabel = "Seal phase";
    timerValue = "open";
    showBidInput = true;
  } else if (roundId != null && !hasCommitted && commitClosed) {
    tone = "danger";
    title = "Commit window closed";
    detail = "Create a new round with a longer window.";
    ctaLabel = "New round";
    cta = () => void createRound(duration);
  } else if (live?.status === "Settled" || live?.status === "Voided") {
    tone = "complete";
    if (live.status === "Voided" || live.winner === zeroAddress) {
      title = "Round closed · no winner";
      detail =
        revealedCount === 0
          ? "No on-chain bids were revealed. The round was voided without selecting a winner."
          : `${revealedCount} on-chain bid(s) revealed, but none were valid. Escrow was refunded.`;
    } else {
      title = "Round settled";
      detail = `${revealedCount} on-chain bid(s) revealed. Winner: ${shortAddr(live.winner)}`;
    }
    timerValue = live?.status ?? "done";
    ctaLabel = `Start new ${useCase.roundNoun}`;
    cta = () => void createRound(duration);
  } else if (live?.status === "Cleared") {
    tone = "ready";
    title = "Winner selected";
    detail = `${formatTokenAmount(live.winningBid)} wins. Settle payment and refunds on Arbitrum.`;
    timerValue = "ready";
    ctaLabel = "Settle round";
    cta = () => void finalizeRound();
  } else if (live?.status === "Revealing" && revealedCount > 0 && !revealClosed) {
    tone = "wait";
    title = `${useCase.revealStep} complete`;
    detail = "The private decisions are now public. Final clearing opens after the reveal window closes.";
    timerLabel = "Settle in";
    timerValue = formatCountdown(revealSecondsRemaining ?? 0);
    ctaLabel = "Reveal window open";
    ctaDisabled = true;
  } else if (live?.status === "Revealing" && revealClosed) {
    tone = "ready";
    title = "Clear + settle";
    detail = "The reveal window is closed. Select the deterministic winner and release funds.";
    timerValue = "ready";
    ctaLabel = "Clear + settle";
    cta = () => void finalizeRound();
  } else if (hasCommitted && !commitClosed) {
    tone = "wait";
    title = `${useCase.commitStep} complete`;
    detail = "Your private decision is committed. Waiting for the shared Drand cue.";
    timerLabel = "Drand cue in";
    timerValue = formatCountdown(commitSecondsRemaining ?? 0);
    ctaLabel = "Waiting…";
    ctaDisabled = true;
  } else if (hasCommitted && commitClosed && !drandGate.published) {
    tone = "wait";
    title = "Wait for Drand R";
    detail = "Commit window closed. Reveal unlocks when round R publishes.";
    timerLabel = "Reveal in";
    timerValue = drandGate.loading ? "…" : formatCountdown(drandGate.secondsRemaining);
    ctaLabel = "Waiting for R";
    ctaDisabled = true;
  } else if (hasCommitted && drandGate.published) {
    tone = "ready";
    title = "Open + reveal";
    detail = "Drand R is live. Open the gate and decrypt every sealed bid on-chain.";
    timerValue = "live";
    ctaLabel = "Open + reveal";
    cta = () => void openAndReveal();
  }

  if (working) {
    ctaDisabled = true;
    ctaLabel = "Signing…";
  }

  return (
    <>
      <section className="case-hero">
        <div>
          <p className="eyebrow">Live round · Arbitrum Sepolia</p>
          <h1>{useCase.title}</h1>
          <p className="lede">{useCase.description}</p>
        </div>
        <div className="round-box">
          <span>round</span>
          <strong>{roundId == null ? "—" : `#${roundId}`}</strong>
          <small>{shortAddr(ROUND_ADDRESS, 8)}</small>
        </div>
      </section>

      <section className={`wallet-bar ${isConnected ? "connected" : ""}`}>
        <div>
          <span>Wallet</span>
          <strong>{address ? shortAddr(address) : "Not connected"}</strong>
          <p>{walletStatus}</p>
          {tokenBalance != null && isConnected ? (
            <p className="balance">Balance: {formatTokenAmount(tokenBalance)}</p>
          ) : null}
        </div>
        <div className="wallet-actions">
          {isConnected ? (
            <button type="button" className="ghost-action" onClick={() => disconnect()}>
              Disconnect
            </button>
          ) : null}
          {!isConnected || wrongChain ? (
            <button
              type="button"
              className="primary-action"
              onClick={() => void (wrongChain ? switchNetwork() : connect())}
            >
              {wrongChain ? "Switch network" : "Connect MetaMask"}
            </button>
          ) : null}
        </div>
      </section>

      <FlowSteps
        address={address ?? null}
        roundId={roundId}
        roundConfirmed={live != null}
        committed={hasCommitted}
        revealed={revealedCount > 0}
        commitClosed={commitClosed}
        working={working}
        useCase={useCase}
      />

      <section className={`phase-guide ${tone} ${working ? "working" : ""}`}>
        <div className="phase-copy">
          <span>Next step</span>
          <strong>{title}</strong>
          <p>{detail}</p>

          {showBidInput ? (
            <div className="phase-input">
              <div className="decision-field">
                <label>{useCase.decisionLabel}</label>
                <div className="decision-chips">
                  {useCase.decisions.map((decision) => (
                    <button
                      key={decision}
                      type="button"
                      className={decisions[useCase.id] === decision ? "selected" : ""}
                      onClick={() => setDecisions((current) => ({ ...current, [useCase.id]: decision }))}
                    >
                      {decision}
                    </button>
                  ))}
                </div>
              </div>
              <label htmlFor="bid-amount">{useCase.inputLabel} (TACET)</label>
              <div className="amount-control">
                <input
                  id="bid-amount"
                  type="range"
                  min={1}
                  max={500}
                  step={1}
                  value={bidAmount}
                  onChange={(e) => setBidAmount(Number(e.target.value))}
                />
                <div className="amount-input">
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={bidAmount}
                    onChange={(e) => setBidAmount(Number(e.target.value || 1))}
                  />
                  <span>TACET</span>
                </div>
              </div>
              <small>{useCase.escrowLabel}: {bidAmount} TACET · encrypted on-chain as uint128</small>
            </div>
          ) : null}

        </div>

        <div className="phase-aside">
          <div className="phase-meter">
            <small>{timerLabel}</small>
            <b>{timerValue}</b>
          </div>
          {showCta ? (
            <button
              type="button"
              className="phase-cta primary-action large"
              onClick={cta}
              disabled={ctaDisabled}
            >
              {ctaLabel}
            </button>
          ) : (
            <div className="lobby-direction">
              <span>Choose below</span>
              <strong>Create or join</strong>
            </div>
          )}
        </div>
      </section>

      {isConnected && !wrongChain ? (
        roundId == null ? (
          <section className="round-lobby">
            <article className="lobby-card create-card">
              <span className="lobby-number">01</span>
              <p className="eyebrow">Lead the round</p>
              <h2>Create {useCase.roundNoun}</h2>
              <p>Create and seal normally. The selected target countdown is shown after sealing.</p>
              <div className="duration-picker">
                <label>Target reveal after seal</label>
                <div className="duration-chips">
                  {COMMIT_DURATION_PRESETS.map((preset) => (
                    <button
                      key={preset.seconds}
                      type="button"
                      className={`duration-chip ${duration === preset.seconds ? "selected" : ""}`}
                      onClick={() => setDuration(preset.seconds)}
                    >
                      <strong>{preset.label}</strong>
                      <small>{preset.helper}</small>
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="primary-action large"
                onClick={() => void createRound(duration)}
                disabled={working}
              >
                Create sealed {useCase.roundNoun}
              </button>
            </article>

            <article className="lobby-card join-card">
              <span className="lobby-number">02</span>
              <p className="eyebrow">Enter on cue</p>
              <h2>Join {useCase.roundNoun}</h2>
              <p>Paste the number from another {useCase.participantNoun}. Tacet verifies that entry is open.</p>
              <div className="join-form">
                <label htmlFor="join-round">Round number</label>
                <div className="join-form-row">
                  <span className="round-prefix">#</span>
                  <input
                    id="join-round"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="e.g. 12"
                    value={joinId}
                    onChange={(e) => setJoinId(e.target.value.replace(/[^0-9]/g, ""))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && joinId.trim()) void joinRound(joinId);
                    }}
                  />
                </div>
              </div>
              <button
                type="button"
                className="secondary-action large"
                onClick={() => void joinRound(joinId)}
                disabled={!joinId.trim() || working}
              >
                Enter as {useCase.participantNoun}
              </button>
            </article>
          </section>
        ) : (
          <section className="round-toolbar">
            <div>
              <span>Active round</span>
              <strong>#{roundId}</strong>
              <small>Share this number with the next bidder.</small>
            </div>
            <button type="button" className="ghost-action" onClick={leaveRound} disabled={working}>
              Change round
            </button>
          </section>
        )
      ) : null}

      {roundId != null ? (
        <SimulatedAgentStage
          roundId={roundId}
          revealTriggered={revealedCount > 0}
          scenario={useCase.id}
          bidders={bidders}
          bidStates={bidStates}
          winner={live?.winner}
          currentAddress={address}
          onRefresh={() => void refresh()}
        />
      ) : null}

      {revealProgress ? (
        <p className="reveal-hint">
          Revealing {revealProgress.current} / {revealProgress.total}…
        </p>
      ) : null}

      <section className="live-state">
        <div>
          <span>Status</span>
          <strong>{live?.status ?? "—"}</strong>
        </div>
        <div>
          <span>Drand R</span>
          <strong>{targetRound || "—"}</strong>
        </div>
        <div>
          <span>On-chain bidders</span>
          <strong>{bidders.length}</strong>
        </div>
        <div>
          <span>On-chain revealed</span>
          <strong>{revealedCount}</strong>
        </div>
        <div>
          <button
            type="button"
            className="ghost-action"
            onClick={() => void refresh()}
            disabled={!roundId}
          >
            Refresh
          </button>
        </div>
      </section>

      <section className={`tx-log ${status}`}>
        <span>Activity log</span>
        {log.length === 0 ? (
          <p>Connect → mint TACET → create round → seal → wait for Drand → reveal.</p>
        ) : (
          log.map((line, i) => <p key={`${line}-${i}`}>{line}</p>)
        )}
      </section>

      <section className="panel links-panel">
        <h2>Contracts</h2>
        <p>
          <a href={arbiscanAddress(ROUND_ADDRESS)} target="_blank" rel="noreferrer">
            Round on Arbiscan →
          </a>
        </p>
        <p>
          <a href={arbiscanAddress(TOKEN_ADDRESS)} target="_blank" rel="noreferrer">
            TACET token →
          </a>
        </p>
      </section>
    </>
  );
}

function RoundHistoryPanel({
  entries,
  onOpen,
}: {
  entries: RoundHistoryEntry[];
  onOpen: (entry: RoundHistoryEntry) => void;
}) {
  return (
    <div className="round-history-page">
      <section className="case-hero">
        <div>
          <p className="eyebrow">Wallet activity</p>
          <h1>round history</h1>
          <p className="lede">Every sealed round this wallet created or entered on this device.</p>
        </div>
        <div className="history-count">
          <span>rounds</span>
          <strong>{entries.length}</strong>
        </div>
      </section>

      {entries.length === 0 ? (
        <section className="history-empty">
          <span>00</span>
          <h2>No rounds recorded yet.</h2>
          <p>Create or join a sealed round and it will appear here.</p>
        </section>
      ) : (
        <section className="history-list">
          {entries.map((entry) => {
            const useCase = USE_CASES.find((item) => item.id === entry.useCase) ?? USE_CASES[0];
            return (
              <button
                key={`${entry.useCase}-${entry.roundId}`}
                type="button"
                className="history-card"
                data-case={entry.useCase}
                onClick={() => onOpen(entry)}
              >
                <span className="history-index">#{entry.roundId}</span>
                <div className="history-main">
                  <span>{useCase.label}</span>
                  <strong>{entry.role === "created" ? `Created ${useCase.roundNoun}` : `Joined as ${useCase.participantNoun}`}</strong>
                  <small>
                    {entry.revealRound ? `Drand R ${entry.revealRound} · ` : ""}
                    {new Date(entry.updatedAt).toLocaleString()}
                  </small>
                </div>
                <span className={`history-status status-${entry.status.toLowerCase()}`}>
                  {entry.status}
                </span>
                <b aria-hidden="true">→</b>
              </button>
            );
          })}
        </section>
      )}
    </div>
  );
}

export function DemoPage({ goHome }: { goHome: () => void }) {
  const [mode, setMode] = useState<DemoMode>("live");
  const [useCaseId, setUseCaseId] = useState<UseCaseId>("auction");
  const [sceneEntering, setSceneEntering] = useState(true);
  const session = useRoundSession(useCaseId);
  const useCase = USE_CASES.find((item) => item.id === useCaseId) ?? USE_CASES[0];

  function openHistoryRound(entry: RoundHistoryEntry) {
    const historyUseCase = USE_CASES.find((item) => item.id === entry.useCase);
    if (!historyUseCase) return;
    window.localStorage.setItem(`tacet:round-id:${historyUseCase.id}`, entry.roundId);
    if (historyUseCase.id === useCaseId) {
      session.openHistoryRound(entry.roundId);
    } else {
      window.sessionStorage.setItem(`tacet:history-open:${historyUseCase.id}`, entry.roundId);
    }
    setUseCaseId(historyUseCase.id);
    setMode("live");
  }

  useLayoutEffect(() => {
    setSceneEntering(false);
    let enterFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      enterFrame = window.requestAnimationFrame(() => setSceneEntering(true));
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(enterFrame);
    };
  }, [mode, useCaseId]);

  return (
    <main className="app-page">
      <section className="app-shell">
        <aside className="case-nav">
          <button type="button" className="brand-link" onClick={goHome}>
            <img src={LOGO_SRC} alt="" />
            <span>tacet</span>
          </button>

          <div className="mode-switch" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "live"}
              className={mode === "live" ? "active" : ""}
              onClick={() => setMode("live")}
            >
              <span>Live round</span>
              <small>run</small>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "history"}
              className={mode === "history" ? "active" : ""}
              onClick={() => setMode("history")}
            >
              <span>History</span>
              <small>{session.roundHistory.length}</small>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "evidence"}
              className={mode === "evidence" ? "active" : ""}
              onClick={() => setMode("evidence")}
            >
              <span>Evidence</span>
              <small>verify</small>
            </button>
          </div>

          <nav className="use-case-nav" aria-label="Tacet use cases">
            <div className="use-case-heading">
              <span>Use cases</span>
              <small>Choose the market story</small>
            </div>
            {USE_CASES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={useCaseId === item.id ? "active" : ""}
                aria-current={useCaseId === item.id ? "page" : undefined}
                data-case={item.id}
                onClick={() => {
                  setUseCaseId(item.id);
                  setMode("live");
                }}
              >
                <span>{item.index}</span>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.payoff}</small>
                </div>
                <b aria-hidden="true">→</b>
              </button>
            ))}
          </nav>

          <div className="protocol-note">
            <span>Protocol promise</span>
            <strong>No agent sees another decision before the cue.</strong>
          </div>

          {mode === "live" && session.targetRound > 0 ? (
            <div className="drand-chip">
              <span>Drand R</span>
              <strong>{session.targetRound}</strong>
              <small>
                {session.drandGate.published
                  ? "published"
                  : session.formatCountdown(session.drandGate.secondsRemaining)}
              </small>
            </div>
          ) : null}
        </aside>

        <section
          className={`case-workspace ${sceneEntering ? "scene-entering" : ""}`}
          data-case={useCaseId}
        >
          <div className="case-scene">
            {mode === "live" ? (
              session.restoringRound ? (
                <section className="session-restoring" aria-live="polite">
                  <div className="session-restoring-cue">
                    <img src={LOGO_SRC} alt="" />
                    <span />
                  </div>
                  <p className="eyebrow">Checking saved round</p>
                  <h2>Preparing your session.</h2>
                  <p>Verifying that the previous round is still open for this wallet.</p>
                </section>
              ) : (
                <LivePanel session={session} useCase={useCase} />
              )
            ) : mode === "history" ? (
              <RoundHistoryPanel entries={session.roundHistory} onOpen={openHistoryRound} />
            ) : (
              <EvidencePanel />
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
