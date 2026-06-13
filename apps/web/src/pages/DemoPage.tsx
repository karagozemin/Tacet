import { useState } from "react";
import { EvidencePanel } from "../components/EvidencePanel";
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
import { shortAddr } from "../lib/format";

type DemoMode = "live" | "evidence";

function FlowSteps({
  address,
  roundId,
  committed,
  revealed,
  working,
}: {
  address: string | null;
  roundId: bigint | null;
  committed: boolean;
  revealed: boolean;
  working: boolean;
}) {
  const steps = [
    { label: "Wallet", detail: address ? shortAddr(address) : "connect", done: Boolean(address) },
    { label: "Round", detail: roundId == null ? "create" : `#${roundId}`, done: roundId != null },
    { label: "Seal", detail: committed ? "on-chain" : "commit", done: committed },
    { label: "Reveal", detail: revealed ? "opened" : "after R", done: revealed },
  ];
  const activeIndex = steps.findIndex((s) => !s.done);

  return (
    <section className={`flow-steps ${working ? "working" : ""}`}>
      {steps.map((step, index) => {
        const state = step.done ? "done" : index === activeIndex ? "active" : "idle";
        return (
          <div key={step.label} className={`flow-step ${state}`}>
            <span>{step.done ? "✓" : index + 1}</span>
            <div>
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function LivePanel({ session }: { session: ReturnType<typeof useRoundSession> }) {
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
  const working = status === "working";

  let tone = "idle";
  let title = "Connect wallet";
  let detail = "Use MetaMask on Arbitrum Sepolia to run a sealed round end-to-end.";
  let timerLabel = "Status";
  let timerValue = "ready";
  let ctaLabel = "Connect MetaMask";
  let cta: () => void = () => void connect();
  let ctaDisabled = working;
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
    ctaLabel = "Create new round";
    cta = () => void createRound(duration);
  } else if (roundId != null && !hasCommitted && !commitClosed) {
    tone = "urgent";
    if ((tokenBalance ?? 0n) < BigInt(bidAmount * 1_000_000)) {
      title = "Fund your bid";
      detail = "Mint free demo TACET, then lock it as escrow for your sealed bid.";
      ctaLabel = "Mint 1000 TACET";
      cta = () => void mintDemoTokens();
    } else {
      title = "Seal your bid";
      detail = "Choose an amount and seal. Encrypted to Drand R — unreadable until reveal.";
      ctaLabel = "Seal bid";
      cta = () => void commitBid();
    }
    timerLabel = "Time left";
    timerValue = formatCountdown(commitSecondsRemaining ?? 0);
    showBidInput = true;
  } else if (roundId != null && !hasCommitted && commitClosed) {
    tone = "danger";
    title = "Commit window closed";
    detail = "Create a new round with a longer window.";
    ctaLabel = "New round";
    cta = () => void createRound(duration);
  } else if (live?.status === "Settled" || live?.status === "Voided") {
    tone = "complete";
    title = "Round complete";
    detail = `${revealedCount} bid(s) revealed. Winner: ${live?.winner ? shortAddr(live.winner) : "—"}`;
    timerValue = live?.status ?? "done";
    ctaLabel = "Done";
    ctaDisabled = true;
  } else if (live?.status === "Cleared") {
    tone = "ready";
    title = "Winner selected";
    detail = `${formatTokenAmount(live.winningBid)} wins. Settle payment and refunds on Arbitrum.`;
    timerValue = "ready";
    ctaLabel = "Settle round";
    cta = () => void finalizeRound();
  } else if (live?.status === "Revealing" && revealedCount > 0 && !revealClosed) {
    tone = "wait";
    title = "Bids revealed";
    detail = "The values are public. Final clearing opens after the reveal window closes.";
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
    title = "Bid sealed";
    detail = "Waiting for commit window to close, then Drand R publishes.";
    timerLabel = "Commit closes in";
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
          <h1>Sealed coordination</h1>
          <p className="lede">Connect → create round → seal → wait for Drand → reveal → settle.</p>
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
          <button
            type="button"
            className="primary-action"
            onClick={() => void (wrongChain ? switchNetwork() : connect())}
          >
            {wrongChain ? "Switch network" : isConnected ? "Reconnect" : "Connect MetaMask"}
          </button>
        </div>
      </section>

      <FlowSteps
        address={address ?? null}
        roundId={roundId}
        committed={hasCommitted}
        revealed={revealedCount > 0}
        working={working}
      />

      <section className={`phase-guide ${tone} ${working ? "working" : ""}`}>
        <div className="phase-copy">
          <span>Next step</span>
          <strong>{title}</strong>
          <p>{detail}</p>

          {showBidInput ? (
            <div className="phase-input">
              <label htmlFor="bid-amount">Bid amount (TACET)</label>
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
              <small>Escrow locked: {bidAmount} TACET (6 decimals on-chain)</small>
            </div>
          ) : null}

        </div>

        <div className="phase-aside">
          <div className="phase-meter">
            <small>{timerLabel}</small>
            <b>{timerValue}</b>
          </div>
          <button
            type="button"
            className="phase-cta primary-action large"
            onClick={cta}
            disabled={ctaDisabled}
          >
            {ctaLabel}
          </button>
        </div>
      </section>

      {isConnected && !wrongChain ? (
        roundId == null ? (
          <section className="round-lobby">
            <article className="lobby-card create-card">
              <span className="lobby-number">01</span>
              <p className="eyebrow">Lead the round</p>
              <h2>Create a new cue</h2>
              <p>Choose how long bidders stay silent, then share the new round number.</p>
              <div className="duration-picker">
                <label>Commit window</label>
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
                Create sealed round
              </button>
            </article>

            <article className="lobby-card join-card">
              <span className="lobby-number">02</span>
              <p className="eyebrow">Enter on cue</p>
              <h2>Join by round number</h2>
              <p>Paste the number from another bidder. Tacet verifies that the commit window is open.</p>
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
                Enter round
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
          <span>Bidders</span>
          <strong>{bidders.length}</strong>
        </div>
        <div>
          <span>Revealed</span>
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

      {bidders.length > 0 ? (
        <section className="bidders-panel panel">
          <h2>On-chain bidders</h2>
          <ul>
            {bidders.map((b) => {
              const st = bidStates[b];
              return (
                <li key={b}>
                  <span className="mono">{shortAddr(b)}</span>
                  <span>
                    {st?.revealed
                      ? `${formatTokenAmount(st.revealedValue)} revealed`
                      : st?.escrow
                        ? `${formatTokenAmount(st.escrow)} sealed`
                        : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

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

export function DemoPage({ goHome }: { goHome: () => void }) {
  const [mode, setMode] = useState<DemoMode>("live");
  const session = useRoundSession();

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
              Live round
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "evidence"}
              className={mode === "evidence" ? "active" : ""}
              onClick={() => setMode("evidence")}
            >
              Evidence
            </button>
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

        <section className="case-workspace">
          {mode === "live" ? <LivePanel session={session} /> : <EvidencePanel />}
        </section>
      </section>
    </main>
  );
}
