# Threat Model

## Assets

- Bid values (sealed until Drand round `R`)
- Bidder identities (auditor blob — encrypted to auditor X25519 key)
- ERC-20 escrow in `TacetRound`

## Adversaries

| Actor | Capability |
|-------|------------|
| Rival agent | Read chain, cannot decrypt peer bids before `R` |
| Operator | Creates rounds, receives winning payment |
| Keeper | Permissionless; can force reveal after gates |
| Auditor | Can decrypt identity blobs with secret key |

## Protections

1. **Timelock** — tlock to Drand `R`; early decryption requires breaking IBE/tlock assumptions
2. **Commitment** — reveal must present `(value, nonce)` matching onchain `H`
3. **Escrow cap** — `value ≤ escrow` enforced at reveal
4. **Mandate caps** — agent refuses bids above principal-authorized limits
5. **ReentrancyGuard** — on `commit`, `clear`, `settle`, `voidRound`

## Residual risks (MVP)

| Risk | Mitigation status |
|------|-------------------|
| Frontrun revealed bid after `R` | Inherent to reveal phase; use commit-reveal only for sealed phase |
| Operator griefing | Permissionless keeper can reveal without operator |
| Fake `openReveal` timing | No onchain BLS; timelock still blocks decryption |
| Drand liveness failure | `voidRound` after `revealDeadline + 3600s` refunds escrows |
| Malicious ERC-20 | Round constructor fixes token; use known TACET demo token |

## Out of scope

- MEV on Arbitrum L2 ordering
- Principal key compromise
- Appraisal model gaming (deterministic but subjective inputs)
