# Tacet

**Every agent enters on cue.**

Tacet (pronounced *TASS-it* / *Tas-it*) is a sealed coordination protocol where autonomous agents make private commitments, remain silent until a shared public signal from [Drand](https://drand.love/), and settle deterministically on Arbitrum.

> *Tacet* is the musical direction for an instrument to remain silent until its entrance cue.

## Problem

Autonomous agents increasingly negotiate and transact with each other. On transparent blockchains, every bid is visible before a market closes — the second agent can always copy or undercut the first.

## Solution

Tacet combines:

1. **Drand timelock encryption** — bids are sealed to a future Drand round and cannot be read early
2. **Onchain commitments** — ERC-20 escrow + `sha256(value ‖ nonce)` binding
3. **Permissionless keeper** — anyone can open reveal (after commit deadline), decrypt, reveal, clear, and settle
4. **Autonomous agents** — mandate-bound session keys appraise, seal, and commit without seeing rival bids

## Why Arbitrum

- Low-latency, EVM-native settlement for agent-to-agent markets
- Mature tooling (Foundry, viem) for rapid hackathon delivery
- Arbitrum Sepolia provides verifiable explorer evidence for judges

## Quick start

```bash
# Install
pnpm install

# Contract tests
pnpm test:contracts

# Typecheck
pnpm -r run typecheck

# Local E2E (requires Anvil on :8545)
anvil &
pnpm e2e:local

# Sepolia deploy + demo (requires DEPLOYER_PRIVATE_KEY in .env)
cp .env.example .env
pnpm deploy:sepolia
```

## Live deployment

See `outputs/deployment.json` after Sepolia deploy. Explorer links are recorded in `outputs/sepolia-evidence.json`.

| Field | Value |
|-------|-------|
| Network | Arbitrum Sepolia (421614) |
| Round contract | *set after deploy* |
| Demo token | TACET (6 decimals, mintable test asset) |

## Demo UI

```bash
pnpm --filter @tacet/web dev
```

Open http://localhost:5173 — jury dashboard with lifecycle, agents, and trust assumptions.

## Architecture

```
packages/tlock   → Drand seal/open, commitments, auditor blobs
packages/sdk     → viem client for TacetRound
services/agent   → mandate + autonomous bidder
services/keeper  → permissionless reveal lifecycle
contracts/       → TacetRound.sol + TacetToken.sol
apps/web/        → jury demo
```

## Attribution

Cryptographic commitment encoding, Drand timelock sealing, auditor identity encryption, keeper orchestration, and agent mandate concepts are adapted from [Sub Rosa](https://github.com/karagozemin/Sub-Rosa) (MIT).

**Tacet is an independent Arbitrum-native repository** developed for the Arbitrum Open House London Online Buildathon. No Soroban code was ported; contracts, SDK, agents, and deployment are new EVM work.

## Known limitations

See [docs/LIMITATIONS.md](docs/LIMITATIONS.md). Summary:

- **No onchain BLS verification** in this MVP — `openReveal` is time-gated; timelock provides the real decryption gate
- **TACET** is a demo ERC-20, not production money
- Bidder loops are O(n); large rounds need pagination in a future version

## License

MIT — see [LICENSE](LICENSE)
