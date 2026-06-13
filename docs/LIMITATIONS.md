# Limitations

Tacet is a hackathon MVP. The following are **known and intentional** gaps.

## Onchain BLS / Drand verification

**Not implemented.** Sub Rosa verifies Drand quicknet BLS signatures onchain before opening reveal. Tacet's MVP uses:

- `openReveal` callable after `commitDeadline` (time gate)
- **tlock** preventing decryption before Drand round `R`

We do **not** claim "trustless Drand verification onchain" or "onchain BLS verified" for this build.

## Reveal gate trust model

- Anyone can call `openReveal` after the commit deadline, even if Drand `R` is not yet published (reveals will fail to decrypt until `R` exists).
- The **economic binding** is the commitment hash + escrow; invalid reveals are rejected.

## Demo token

`TacetToken` (TACET) is mintable by anyone for testing. It is **not** a production asset. UI and docs label it clearly.

## Gas / DoS

- `clear` and `settle` loop over bidders O(n). Suitable for demo scale (2–20 bidders), not thousands without pagination.
- Ciphertext capped at 4096 bytes; auditor blob at 2048 bytes.

## Appraisal

Deterministic local model — not an external oracle. Agents supply private `attributes`; identical inputs yield identical outputs. No x402 payment rail on EVM in this build (simplified vs Sub Rosa).

When optional Groq appraisal is enabled, agent attributes and the deterministic
baseline are sent to Groq for inference. Bid ciphertext remains sealed onchain,
but these appraisal inputs should not be treated as private from the model provider.

## Mandate signatures

ECDSA over `sha256(canonical JSON)` — not ERC-7715 / wallet policy standard yet.

## Production readiness

No audit, no mainnet deployment, no upgradeability pattern. Use Sepolia for demos only.

## What is real and verifiable

- ERC-20 escrow lock/refund on Arbitrum
- Commitment–reveal binding via `sha256`
- Drand timelock ciphertext (offchain decrypt with live quicknet)
- Permissionless keeper path
- Two autonomous agents with distinct mandates and appraisals
