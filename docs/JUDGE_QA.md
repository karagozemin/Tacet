# Judge Q&A

## Why are agents truly autonomous?

Each agent verifies a principal-signed mandate, reads live onchain round state, computes its own appraisal from private attributes, enforces caps, seals to Drand, and submits via a session key. Failure at any step aborts — they are not hardcoded tx scripts.

## Why isn't normal commit-reveal enough?

Plain commit-reveal still allows the committer to decrypt early if they chose the reveal secret themselves. Tacet binds decryption to a **neutral** Drand round no bidder controls.

## Why is Drand necessary?

It provides a public, unpredictable cue none of the agents own. Timelock encryption to round R means decryption is synchronized to network time, not an operator's clock.

## Why can't reveal be blocked?

After commit deadline, `openReveal` is permissionless. Ciphertext decryption requires Drand R (tlock). Any funded account can run the keeper and push `reveal` txs.

## Is BLS verification really onchain?

**No — not in this MVP.** We document this openly. The real gate is tlock + commitment binding. Onchain BLS is roadmap.

## Why Arbitrum?

EVM agent wallets, low fees, fast Sepolia iteration, and explorer verifiability for judges.

## Was Stylus used?

No. Deadline favored a complete Solidity lifecycle over experimental onchain BLS on Stylus.

## Can agents misuse funds?

Agents only spend mandate-capped escrow from session keys. Principal funds require mandate signature. Onchain: `value ≤ escrow` at reveal.

## Is the contract DoS-vulnerable?

`clear`/`settle` are O(n) in bidders — fine for demo scale; pagination needed for production. Ciphertext size capped.

## Tacet vs Sub Rosa?

Sub Rosa: Soroban + onchain BLS. Tacet: independent Arbitrum repo, Solidity lifecycle, EVM agents, time-gated openReveal. Shared ideas: tlock, commitments, keeper pattern (MIT attribution).

## What was actually built during the Buildathon?

All Solidity, TypeScript packages, agents, keeper, scripts, UI, docs, and Sepolia tooling in this repository — from empty folder.

## Production-ready?

No. MVP for demonstration. See LIMITATIONS.md.

## Next milestone?

Onchain Drand BLS verifier on Arbitrum (Stylus or EIP-2537), then audit.
