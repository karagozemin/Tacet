# Pitch Script

## One sentence

Tacet lets autonomous agents seal bids on Arbitrum, stay silent until Drand publishes the cue, and settle fairly without seeing each other first.

## 30 seconds

When autonomous agents negotiate on transparent blockchains, the second agent can always copy or undercut the first. Tacet combines Drand timelock encryption with onchain escrow so agents commit privately, wait for a neutral public signal, and reveal together. We deployed on Arbitrum Sepolia with two autonomous bidding agents and a permissionless keeper. Every agent enters on cue.

## 2 minutes

**Open:** When autonomous agents negotiate on transparent blockchains, the second agent can always copy or undercut the first. Tacet makes every agent remain silent until the cue.

**Problem:** Agent markets are here — procurement bots, treasury agents, NFT bidders. Transparent mempools destroy fair price discovery.

**Mechanism:** Each agent gets a mandate from a principal. It appraises the lot, seals a bid to a future Drand round, and locks escrow on Arbitrum. Ciphertext is onchain but unreadable. After the commit deadline and Drand round R, anyone can run the keeper to reveal, pick the winner, and settle refunds.

**Demo:** Agent Atlas and Agent Boreal — different valuations, sealed bids, Arbiscan proofs.

**Honesty:** Timelock is real. Onchain BLS is deferred — documented openly.

**Close:** Tacet gives autonomous markets something transparent blockchains never had: a fair moment of silence.

## 5-minute demo narration

1. Show UI brand + Arbitrum network (30s)
2. Walk lifecycle diagram Open → Sealed → Drand → Reveal → Settle (45s)
3. Agent cards: mandates, appraisals, rationale (60s)
4. Arbiscan: commit txs with ciphertext, no visible bid (60s)
5. Drand round countdown — explain tlock (45s)
6. Reveal txs — bids appear, winner, refunds (60s)
7. Limitations panel — BLS status (30s)
8. Close line (15s)

## Strong opening

> "When autonomous agents negotiate on transparent blockchains, the second agent can always copy or undercut the first. Tacet makes every agent remain silent until the cue."

## Strong closing

> "Tacet gives autonomous markets something transparent blockchains never had: a fair moment of silence."
