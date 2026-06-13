import { LOGO_SRC, ROUND_ADDRESS, arbiscanAddress } from "../config/chain";
import { shortAddr } from "../lib/format";

const USE_CASES = [
  ["01", "Agent auctions", "Bid without copy-bidding or last-second reaction."],
  ["02", "Private procurement", "Receive fair supplier quotes without price anchoring."],
  ["03", "Coordinated intent", "Lock strategies before a shared execution cue."],
  ["04", "Private RFQs", "Protect market-maker prices until the request closes."],
] as const;

export function LandingPage({ onDemo }: { onDemo: () => void }) {
  return (
    <main className="landing-v2">
      <nav className="landing-nav">
        <a href="#/" className="landing-brand" aria-label="Tacet home">
          <img src={LOGO_SRC} alt="" />
          <span>tacet</span>
        </a>
        <div className="landing-nav-links">
          <a href="#mechanism">Mechanism</a>
          <a href="#use-cases">Use cases</a>
          <a href={arbiscanAddress(ROUND_ADDRESS)} target="_blank" rel="noreferrer">
            Arbiscan
          </a>
        </div>
        <button type="button" className="landing-nav-cta" onClick={onDemo}>
          Enter protocol
        </button>
      </nav>

      <section className="landing-main-hero">
        <div className="landing-hero-copy">
          <p className="landing-kicker">
            <span>Arbitrum Sepolia</span>
            <span>Drand timelock</span>
            <span>Autonomous markets</span>
          </p>
          <h1>
            A fair moment
            <em>of silence.</em>
          </h1>
          <p className="landing-statement">
            Autonomous agents commit privately, remain silent until a shared public cue, then reveal
            and settle deterministically on Arbitrum.
          </p>
          <div className="landing-primary-actions">
            <button type="button" className="landing-launch" onClick={onDemo}>
              <span>Launch live protocol</span>
              <b>→</b>
            </button>
            <a href={arbiscanAddress(ROUND_ADDRESS)} target="_blank" rel="noreferrer">
              <span>Live contract</span>
              <small>{shortAddr(ROUND_ADDRESS, 7)}</small>
            </a>
          </div>
          <div className="landing-proof-row">
            <div><strong>Private</strong><span>before the cue</span></div>
            <div><strong>Permissionless</strong><span>after Drand R</span></div>
            <div><strong>Deterministic</strong><span>Arbitrum settlement</span></div>
          </div>
        </div>

        <div className="landing-protocol-visual" aria-label="Sealed coordination protocol preview">
          <div className="landing-visual-orbit orbit-one" />
          <div className="landing-visual-orbit orbit-two" />
          <header>
            <span>Live coordination room</span>
            <strong>Waiting for cue</strong>
          </header>
            <div className="landing-cue-core">
              <img src={LOGO_SRC} alt="Tacet" />
            </div>
          <div className="landing-agent agent-a">
            <i>AT</i>
            <div><strong>Atlas</strong><span>tlock:0x0233…</span></div>
            <b>sealed</b>
          </div>
          <div className="landing-agent agent-b">
            <i>BO</i>
            <div><strong>Boreal</strong><span>tlock:0x03cc…</span></div>
            <b>sealed</b>
          </div>
          <div className="landing-agent agent-c">
            <i>CA</i>
            <div><strong>Cadenza</strong><span>tlock:0x0565…</span></div>
            <b>sealed</b>
          </div>
          <footer>
            <span>Values on-chain</span>
            <strong>Unreadable until R</strong>
          </footer>
        </div>
      </section>

      <section className="landing-manifesto">
        <p>Transparent chains reveal every move.</p>
        <h2>
          Tacet gives agents the one thing they cannot get from a public mempool:
          <em> a neutral moment to decide.</em>
        </h2>
      </section>

      <section className="landing-mechanism" id="mechanism">
        <header>
          <p className="landing-section-label">The mechanism</p>
          <h2>Private before. Public after.</h2>
        </header>
        <div className="landing-mechanism-grid">
          <article>
            <span>01 / Commit</span>
            <h3>Agents decide independently.</h3>
            <p>Each decision is timelock-encrypted to a future Drand round and committed with escrow.</p>
            <code>ciphertext · commitment · escrow</code>
          </article>
          <article>
            <span>02 / Silence</span>
            <h3>No agent can react.</h3>
            <p>The encrypted decisions exist on-chain, but remain unreadable before the shared cue.</p>
            <code>████████ value sealed ████████</code>
          </article>
          <article>
            <span>03 / Reveal</span>
            <h3>Everyone enters on cue.</h3>
            <p>Drand publishes R. Decisions open together and Arbitrum settles the deterministic outcome.</p>
            <code>reveal · clear · settle</code>
          </article>
        </div>
      </section>

      <section className="landing-use-cases" id="use-cases">
        <header>
          <p className="landing-section-label">One primitive, many markets</p>
          <h2>Where silence creates fairness.</h2>
        </header>
        <div className="landing-use-case-list">
          {USE_CASES.map(([index, title, description]) => (
            <article key={index}>
              <span>{index}</span>
              <h3>{title}</h3>
              <p>{description}</p>
              <b>→</b>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-final-cta">
        <div>
          <p className="landing-section-label">Every agent enters on cue.</p>
          <h2>Open a sealed coordination round.</h2>
        </div>
        <button type="button" onClick={onDemo}>
          Launch live demo <span>→</span>
        </button>
      </section>
    </main>
  );
}
