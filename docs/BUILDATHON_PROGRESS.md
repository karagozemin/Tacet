# Buildathon Progress Log

## Hackathon

**Arbitrum Open House London Online Buildathon**

- **Period:** 25 May 2026 – **14 June 2026** (submission deadline)
- **Prize pool:** $115,000 (Overall $70K + Agentic $15K + grants $30K)
- **Networks:** Arbitrum (Sepolia for development)

---

## Pre-buildathon (concept reference)

- Sub Rosa prototype on Stellar Soroban explored sealed auctions with onchain BLS
- Drand timelock + commitment encoding validated offchain
- Agent mandate and keeper patterns prototyped

*No Sub Rosa code or git history exists in the Tacet repository.*

---

## Buildathon — Tacet repository (new)

### Phase 1 — Foundation

- [x] Independent `git init` in empty workspace (no Sub Rosa remote/history)
- [x] MIT license with Sub Rosa attribution
- [x] Monorepo scaffold (pnpm workspaces)

### Phase 2 — Contracts (Arbitrum-native)

- [x] `TacetRound.sol` full lifecycle
- [x] `TacetToken.sol` demo ERC-20
- [x] 17 Foundry tests (lifecycle, edge cases, reentrancy)
- [x] Foundry deploy script

### Phase 3 — Offchain stack

- [x] `@tacet/tlock` — uint128 commitments + Drand seal/open
- [x] `@tacet/sdk` — viem client
- [x] `@tacet/appraisal` — deterministic valuation
- [x] `@tacet/agent` — ECDSA mandates + autonomous bidder
- [x] `@tacet/keeper` — permissionless lifecycle

### Phase 4 — Integration

- [x] `scripts/e2e-local.ts` (Anvil)
- [x] Local E2E verified — two agents, Drand reveal, clear, settle (`outputs/e2e-local.json`, status **Settled**)
- [x] `scripts/deploy-sepolia.ts`
- [x] `scripts/smoke-sepolia.ts`
- [x] Arbitrum Sepolia live deploy — round #1 **Settled** (see `outputs/deployment.json`)

### Phase 5 — Demo & submission

- [x] `apps/web` jury UI
- [x] Documentation suite (architecture, threat model, pitch, QA)
- [ ] Demo video recording
- [ ] Contract source verification on Arbiscan

### Not completed (honest)

- Onchain BLS12-381 Drand verification
- Stylus hybrid verifier
- x402 appraisal payment on EVM

---

## Evidence checklist

| Item | Status |
|------|--------|
| Contract tests pass | ✅ |
| Local E2E script | ✅ ready |
| Sepolia deploy | ⏳ needs funded key |
| Explorer tx evidence | ⏳ post-deploy |
| Source verification | ⏳ post-deploy |
