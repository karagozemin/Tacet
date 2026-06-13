# HackQuest Submission — Tacet

## Project name

**Tacet**

## Tagline

Every agent enters on cue.

## One-line description

Sealed coordination protocol where autonomous agents commit privately on Arbitrum, wait for a Drand cue, and settle deterministically.

## Problem

Transparent blockchains leak every agent decision before a market closes. Autonomous bidders cannot compete fairly when rivals can observe and react.

## Solution

Tacet seals bids with Drand timelock encryption, locks ERC-20 escrow onchain, and uses a permissionless keeper to reveal and settle after a neutral public randomness cue.

## Why now

Agent-to-agent commerce is accelerating. Markets need coordination primitives that preserve pre-deadline privacy without trusted auctioneers.

## Why Arbitrum

Low-fee EVM settlement, mature agent tooling (viem, Foundry), and Sepolia explorer evidence for verifiable hackathon demos.

## Agentic AI use case

Two mandate-bound agents (**Atlas**, **Boreal**) independently appraise the same lot with private attributes, seal competing bids, and commit onchain without seeing each other — keeper completes the round permissionlessly.

## Technical architecture

- `TacetRound.sol` — lifecycle state machine
- `@tacet/tlock` — Drand quicknet seal/open + commitments
- `@tacet/sdk` — viem client
- `@tacet/agent` — mandate + autonomous bidder
- `@tacet/keeper` — reveal orchestration
- `apps/web` — jury demo UI

## Smart contracts

- **TacetRound** — createRound, commit, openReveal, reveal, clear, settle, voidRound
- **TacetToken** — demo ERC-20 (6 decimals)

## Deployment links

| Item | Link |
|------|------|
| Network | Arbitrum Sepolia (421614) |
| Round contract | *see `outputs/deployment.json`* |
| Demo token | *see `outputs/deployment.json`* |
| Explorer | https://sepolia.arbiscan.io |

## Demo link

Local: `pnpm --filter @tacet/web dev` → http://localhost:5173

## Video link

*To be recorded using `docs/VIDEO_SCRIPT.md`*

## GitHub link

*Repository URL — to be added by participant when published*

## Progress during the Buildathon

See [BUILDATHON_PROGRESS.md](BUILDATHON_PROGRESS.md)

## Existing concept vs Buildathon work

| Area | Pre-buildathon (Sub Rosa concept) | Buildathon (Tacet) |
|------|-----------------------------------|---------------------|
| Platform | Stellar Soroban | **Arbitrum EVM (new)** |
| Contracts | Rust WASM + onchain BLS | **Solidity TacetRound (new)** |
| Token | SAC USDC | **ERC-20 TacetToken (new)** |
| SDK | stellar-sdk | **viem SDK (new)** |
| Crypto | tlock + commitments | **Adapted to uint128 EVM encoding** |
| Agents | Stellar mandates | **EVM ECDSA mandates (new)** |
| Keeper | Soroban RPC | **Arbitrum RPC (new)** |
| Deployment | Testnet evidence | **Arbitrum Sepolia (new)** |
| Demo UI | Passkey/Soroban | **Arbitrum jury UI (new)** |

Tacet openly builds on cryptographic **ideas** from Sub Rosa (MIT). **All Arbitrum code, deployment, and demo are new work in this repository.**

## Known limitations

No onchain BLS; demo token; O(n) bidder loops. [LIMITATIONS.md](LIMITATIONS.md)

## Roadmap

1. Onchain Drand BLS verifier (Stylus or EIP-2537 when production-ready on Sepolia)
2. ERC-7715 mandate policies
3. Paginated clear/settle
4. Mainnet audit

## Overall Prize justification

- Real problem (agent market fairness)
- Working Sepolia deployment with explorer proofs
- Clean Solidity lifecycle + 17 Foundry tests
- Distinct brand and jury-ready UI
- Honest security documentation

## Best Agentic Project justification

- Two **autonomous** agents with verified mandates, independent appraisals, and session-key commits
- Agents demonstrate decision-making, not static scripts
- Keeper shows permissionless automation completing the agent market without human reveal clicks
