# Architecture

## Overview

Tacet implements a sealed commit–reveal auction lifecycle on Arbitrum EVM.

```
Operator creates round
    ↓
Agents commit (escrow + H + tlock ciphertext)
    ↓  [commit deadline]
openReveal (time gate)
    ↓  [Drand round R published]
Keeper decrypts → reveal each bid
    ↓  [reveal deadline]
clear → deterministic winner
    ↓
settle → operator payment + refunds
```

## Components

| Layer | Path | Role |
|-------|------|------|
| Contracts | `contracts/src/TacetRound.sol` | Lifecycle state machine, ERC-20 escrow |
| Crypto | `packages/tlock` | `sha256(be128(value)‖nonce)`, tlock seal/open |
| SDK | `packages/sdk` | viem read/write wrapper |
| Agent | `services/agent` | Mandate verify → appraise → seal → commit |
| Keeper | `services/keeper` | Drand wait → openReveal → reveal → clear → settle |
| Demo | `apps/web` | Jury-facing status dashboard |

## Commitment encoding

Preimage (48 bytes): `uint128 big-endian ‖ nonce32`

```
H = sha256(preimage)
C = tlock.Encrypt(R, preimage)
```

Solidity: `sha256(abi.encodePacked(uint128 value, bytes32 nonce))`

TypeScript: identical byte layout in `packages/tlock/src/commitment.ts`.

## Round state machine

| Status | Meaning |
|--------|---------|
| Open | Accepting commits |
| Revealing | Commit closed; reveals allowed |
| Cleared | Winner selected |
| Settled | Funds distributed |
| Voided | No valid bids or liveness timeout |

## Reveal gate (honest model)

**Implemented:** After `commitDeadline`, anyone may call `openReveal`. Ciphertexts remain undecryptable until Drand round `R` is published (tlock).

**Not implemented (MVP):** Onchain BLS12-381 verification of Drand round `R` (as in Sub Rosa's Soroban contract). See `docs/LIMITATIONS.md`.

## Agent autonomy

Each agent:

1. Verifies an ECDSA-signed session mandate (caps + round binding)
2. Reads onchain round status
3. Runs deterministic appraisal with **private attributes**
4. Sizes bid within mandate caps
5. Seals to Drand round `R`
6. Commits via session key (principal never bids onchain)

## Arbitrum-specific choices

- Solidity + Foundry for fastest Sepolia path
- ERC-20 (TacetToken) for escrow — 6 decimals to mirror USDC-style units
- viem for typed RPC + wallet flows
- Stylus not used — deadline prioritized working Solidity lifecycle

## Reference lineage

Concepts adapted from Sub Rosa (Stellar/Soroban). Tacet reimplements lifecycle on EVM with uint128 bids and time-gated `openReveal` instead of onchain BLS.
