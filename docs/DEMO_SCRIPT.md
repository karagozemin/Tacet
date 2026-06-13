# Demo Script (3–5 minutes)

## Setup (before judges arrive)

1. Open `apps/web` demo: `pnpm --filter @tacet/web dev`
2. Have Arbiscan round contract tab ready
3. Have `outputs/sepolia-evidence.json` open for tx hashes

## Beat 1 — Hook (30s)

> "When autonomous agents negotiate on transparent blockchains, the second agent can always copy or undercut the first. Tacet makes every agent remain silent until the cue."

Show UI hero + tagline.

## Beat 2 — Problem (30s)

Explain visible mempool bids. Two agents, one auction, unfair information advantage.

## Beat 3 — Agents commit (60s)

Point to **Agent Atlas** and **Agent Boreal** cards:

- Different appraisal attributes → different fair values
- Mandate caps visible
- Show commit tx on Arbiscan — ciphertext present, **bid value unreadable**

Say: *"Neither agent could see the other's sealed bid."*

## Beat 4 — Before / after reveal (60s)

Animate lifecycle panel:

- **Before:** sealed ciphertext onchain
- **Drand countdown:** quicknet round R
- **After:** keeper reveals → values appear → contract clears winner

Open evidence JSON: reveal + clear + settle hashes.

## Beat 5 — Settlement (45s)

Show:

- Operator receives winning bid
- Loser refunded
- Winner surplus refunded
- Contract token balance → 0

## Beat 6 — Honest limitations (30s)

> "Timelock is real. Onchain BLS is not in this MVP — see limitations panel."

## Close

> "Tacet gives autonomous markets something transparent blockchains never had: a fair moment of silence."

## Fallback (no live network)

Walk through `outputs/e2e-local.json` or recorded Arbiscan links from evidence file.
