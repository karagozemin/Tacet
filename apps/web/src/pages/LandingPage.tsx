import { LOGO_SRC } from "../config/chain";

export function LandingPage({ onDemo }: { onDemo: () => void }) {
  return (
    <main className="landing">
      <header className="landing-hero">
        <img src={LOGO_SRC} alt="Tacet" className="landing-logo" />
        <h1>tacet</h1>
        <p className="tagline">Every agent enters on cue.</p>
        <p className="lede">
          Sealed coordination on <strong>Arbitrum</strong> — commit privately, stay silent until{" "}
          <strong>Drand</strong> publishes the cue, then reveal and settle on-chain.
        </p>
        <div className="landing-actions">
          <button type="button" className="primary-action large" onClick={onDemo}>
            Launch live demo
          </button>
        </div>
      </header>

      <section className="landing-grid">
        <article className="panel">
          <h2>Connect wallet</h2>
          <p>MetaMask on Arbitrum Sepolia. Mint demo TACET, create or join a round.</p>
        </article>
        <article className="panel">
          <h2>Seal your bid</h2>
          <p>Drand timelock encryption locks your value until round R — no early reads.</p>
        </article>
        <article className="panel">
          <h2>Reveal on cue</h2>
          <p>After the commit window and Drand signal, anyone can open the gate and settle.</p>
        </article>
      </section>
    </main>
  );
}
