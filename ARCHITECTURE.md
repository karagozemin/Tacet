# Tacet Architecture

This document is the technical source of truth for the Tacet sealed coordination
system. It describes the protocol lifecycle, component boundaries, cryptographic encoding, agent and
keeper behavior, settlement invariants, threat model, sponsor integrations,
known limitations, and the path from hackathon MVP to production protocol.

## 1. System Objective

Tacet coordinates autonomous agents without exposing their decisions before a
shared public cue.

The initial application is a sealed auction, but the primitive is broader:
procurement, resource allocation, solver selection, private RFQs, and other
agent-to-agent markets where participants must commit before learning rival
decisions.

Tacet separates three concerns:

- **Confidentiality before the cue:** Drand timelock encryption.
- **Economic binding and settlement:** Solidity contracts on Arbitrum.
- **Autonomous execution:** mandate-bound bidder agents and permissionless keepers.

No trusted auctioneer holds the bid decryption key.

## 2. High-Level Architecture

```text
┌──────────────────────── Principal ────────────────────────┐
│ signs mandate: round, session key, max bid, max escrow   │
└────────────────────────────┬──────────────────────────────┘
                             │
                             ▼
┌──────────────────── Autonomous Bidder Agent ────────────────────┐
│ verify mandate → read round → appraise → enforce cap           │
│ create nonce → SHA-256 commitment → seal to Drand round R      │
└────────────────────────────┬────────────────────────────────────┘
                             │ commit(commitment, ciphertext,
                             │        auditorBlob, escrow)
                             ▼
┌──────────────────── Arbitrum: TacetRound ───────────────────────┐
│ immutable ERC-20 escrow │ lifecycle │ commitments │ settlement │
└────────────────────────────┬────────────────────────────────────┘
                             │ after commit deadline and Drand R
                             ▼
┌──────────────────── Permissionless Keeper ──────────────────────┐
│ wait for R → decrypt → reveal → clear → settle                 │
│ direct EOA execution or ZeroDev sponsored Kernel UserOperation │
└─────────────────────────────────────────────────────────────────┘
```

### Component boundaries

| Layer | Path | Responsibility |
|---|---|---|
| Settlement | `contracts/src/TacetRound.sol` | Round state machine, escrow, validation, clearing, refunds |
| Demo asset | `contracts/src/TacetToken.sol` | Freely mintable 6-decimal ERC-20 for demos |
| Cryptography | `packages/tlock` | Commitment encoding, Drand quicknet seal/open, auditor identity blob |
| Appraisal | `packages/appraisal` | Deterministic private-attribute valuation baseline |
| Protocol SDK | `packages/sdk` | Typed viem reads/writes for `TacetRound` |
| Bidder runtime | `services/agent` | Mandates, AI/deterministic decisions, seal and commit |
| Keeper runtime | `services/keeper` | Permissionless reveal/clear/settle and ZeroDev adapter |
| Jury interface | `apps/web` | Live lifecycle UI and verifiable evidence |
| Operations | `scripts` | Local E2E, Sepolia deploy, integration health, sponsor proofs |

## 3. Protocol Lifecycle

### 3.1 Create

An operator calls:

```solidity
createRound(itemRef, revealRound, clearingRule, commitDeadline, revealDeadline)
```

The contract records the operator, selected future Drand round, deadlines, and
either `HighestBid` or `LowestBid` clearing. The operator does not receive a
decryption capability.

### 3.2 Appraise and authorize

Each bidder operates through a session key authorized by a principal-signed
mandate. The mandate binds:

- contract and round;
- session-key address;
- item reference and category;
- maximum bid and escrow;
- validity window and decision constraints.

Before committing, the agent verifies the mandate and reads the live round.
Groq may produce a structured appraisal decision, but the mandate cap is
enforced in deterministic code after inference. If Groq is unavailable, the
agent uses the deterministic appraisal baseline.

### 3.3 Commit

The agent generates:

```text
nonce       = random 32 bytes
preimage    = uint128_bid_value_be || nonce
commitment  = SHA-256(preimage)
ciphertext  = tlock_encrypt(drand_round_R, preimage)
auditorBlob = encrypted bidder identity metadata
```

It then approves the escrow token and calls:

```solidity
commit(roundId, commitment, ciphertext, auditorBlob, escrow)
```

The contract stores the commitment and seal, transfers escrow into
`TacetRound`, and never receives the plaintext bid during the commit phase.

### 3.4 Open reveal

After `commitDeadline`, anyone may call `openReveal(roundId)`. This moves the
contract from `Open` to `Revealing`.

This call is a contract phase gate, not the cryptographic decryption gate. The
ciphertext remains unreadable until Drand publishes round `R`.

### 3.5 Reveal

Once Drand round `R` exists, a keeper opens each ciphertext and submits:

```solidity
reveal(roundId, bidder, value, nonce)
```

The contract recomputes the commitment and accepts the reveal only when:

```text
SHA-256(uint128_be(value) || nonce) == stored commitment
0 < value <= bidder escrow
reveal deadline has not passed
bid has not already been revealed
```

The bidder does not need to return online. Any keeper can reveal a valid
preimage on its behalf.

### 3.6 Clear

After `revealDeadline`, anyone can call `clear(roundId)`. The contract selects
the best valid revealed bid according to the round's clearing rule.

Ties are deterministic: the lower bidder address wins. If no valid bid exists,
the round is voided and escrows are refunded.

### 3.7 Settle

After clearing, anyone can call `settle(roundId)`:

- the operator receives the winning bid;
- the winner receives surplus escrow;
- every losing bidder receives its full escrow;
- each bidder is marked settled to prevent double payment.

If an open round becomes abandoned, `voidRound` becomes available after
`revealDeadline + 3600 seconds` and refunds all escrow.

## 4. Contract State Machine

```text
                         no valid reveals
                       ┌──────────────────► Voided
                       │                      ▲
Open ──openReveal──► Revealing ──clear────► Cleared ──settle──► Settled
 │                                             │
 └────────── void after grace period ──────────┘
```

| State | Allowed protocol actions |
|---|---|
| `Open` | Commit or replace a bid before deadline; open reveal after deadline |
| `Revealing` | Reveal valid preimages before deadline; clear after deadline |
| `Cleared` | Settle |
| `Settled` | Terminal |
| `Voided` | Terminal, escrow refunded |

### Core contract invariants

1. A revealed value must match the original SHA-256 commitment.
2. A valid revealed value cannot exceed its escrow.
3. Escrow leaves the contract only through settlement or refund paths.
4. A bidder cannot be settled twice.
5. A round cannot settle before deterministic clearing.
6. A round with no valid bids cannot pay an operator.
7. External token transfers in state-changing fund paths are guarded against reentrancy.

## 5. Cryptographic Design

### Commitment encoding

The commitment preimage is exactly 48 bytes:

```text
bytes  0..15  uint128 bid value, big-endian
bytes 16..47  random nonce32
```

Both implementations intentionally match:

```solidity
sha256(abi.encodePacked(uint128(value), bytes32(nonce)))
```

```typescript
sha256(concat(uint128BigEndian(value), nonce32))
```

This commitment is:

- **binding:** a bidder cannot reveal a different value without finding a
  SHA-256 collision;
- **hiding with a strong nonce:** observers cannot feasibly brute-force the bid
  from the hash alone.

### Drand timelock encryption

The preimage is encrypted to a future Drand quicknet round using `tlock-js`.
Before the selected round is published, no participant has the decryption
material. After publication, anyone can decrypt.

This gives Tacet a neutral reveal cue independent of the operator, bidders, and
keeper.

### Auditor identity blob

The seal may include bidder identity metadata encrypted to an auditor public
key. Public observers see the blob but cannot decode its contents. This is
separate from bid confidentiality and does not affect settlement correctness.

## 6. Autonomous Agent Model

The bidder agent follows a fail-closed pipeline:

```text
Verify mandate
  → Confirm session key
  → Read live round and require Open
  → Produce deterministic baseline appraisal
  → Optionally request structured Groq decision
  → Clamp decision to mandate limits
  → Generate nonce and tlock seal
  → Approve escrow
  → Commit onchain
```

### AI safety boundary

Groq contributes a suggested bid, confidence, and rationale. It does not control
the wallet directly and cannot bypass the mandate:

- malformed responses are rejected;
- the agent falls back to deterministic appraisal unless configured otherwise;
- bid and escrow caps are rechecked after inference;
- the plaintext bid is sealed before publication.

The appraisal attributes sent to Groq should not be considered private from the
model provider.

## 7. Keeper and Account Abstraction

The keeper is designed around a structural `KeeperClient` interface. It can use
the ordinary viem `TacetClient` or the `ZeroDevTacetClient`.

Keeper behavior:

1. read round status and selected Drand round;
2. wait until the Drand publish time;
3. probe decryption before opening reveal;
4. open reveal after the onchain deadline;
5. decrypt and submit every unrevealed valid bid;
6. clear after the reveal deadline;
7. settle the cleared round.

The ZeroDev adapter creates a Kernel smart account with an ECDSA validator,
submits encoded `TacetRound` calls through the bundler, requests paymaster data,
and waits for the resulting UserOperation receipt.

Verified sponsored execution:

- Kernel account:
  [`0x048b1243372Cb59751ab8e1b0172Be45FcD583B9`](https://sepolia.arbiscan.io/address/0x048b1243372Cb59751ab8e1b0172Be45FcD583B9)
- Sponsored `createRound`:
  [`0xac01f17fb24b96e5341118551879d3e4f9e393addcf611dbe383879564b039aa`](https://sepolia.arbiscan.io/tx/0xac01f17fb24b96e5341118551879d3e4f9e393addcf611dbe383879564b039aa)

## 8. Infrastructure and Sponsor Integrations

### Arbitrum

Arbitrum Sepolia is the execution and settlement layer. It provides EVM wallet
compatibility, low-cost iteration, viem/Foundry tooling, and public explorer
evidence.

### OpenZeppelin

The contracts use:

- `ERC20` for the demo settlement asset;
- `SafeERC20` for defensive token transfers;
- `ReentrancyGuard` around escrow-moving paths.

### Alchemy

Alchemy provides the configured Arbitrum Sepolia JSON-RPC endpoint for agents,
keeper reads/writes, deployment scripts, the frontend, integration health
checks, and Dune snapshot generation.

### Dune Analytics

Arbitrum Sepolia is read through Alchemy and normalized into a public Dune
query. The sync script creates and executes a query containing round status,
bidders, reveals, winners, and settled volume.

Public query: [Tacet System Analytics](https://dune.com/queries/7718212).

### ZeroDev

ZeroDev provides a bundler, Kernel smart account, and sponsored paymaster path
for keeper protocol actions. The direct viem keeper remains available as a
fallback.

## 9. Threat Model

### Protected assets

- plaintext bid values before Drand round `R`;
- ERC-20 escrow held by `TacetRound`;
- mandate-limited principal authority;
- optionally encrypted bidder identity metadata.

### Adversaries and controls

| Actor or failure | Capability | Control |
|---|---|---|
| Rival bidder | Reads all onchain data and ciphertext | Timelock encryption prevents early plaintext access |
| Dishonest bidder | Attempts to reveal another value | SHA-256 commitment binding |
| Overreaching AI agent | Suggests excessive spend | Deterministic mandate and escrow caps |
| Offline bidder | Refuses or fails to reveal | Permissionless keeper can reveal after Drand |
| Operator | Attempts to block settlement | Reveal, clear, settle, and void paths are permissionless |
| Keeper | Submits false plaintext | Contract recomputes commitment and rejects mismatch |
| Token callback/reentrancy | Reenters fund paths | `SafeERC20`, state flags, and `ReentrancyGuard` |
| Drand liveness failure | Selected round unavailable | Eventual `voidRound` refunds escrow |
| Abandoned round | No actor advances lifecycle | Permissionless keeper and grace-period void |

### Trust assumptions

- Drand quicknet cryptography and liveness are assumed.
- Arbitrum consensus and RPC responses are assumed.
- Session/private keys must remain secure.
- The configured escrow token is assumed to behave compatibly with ERC-20.
- Groq receives any appraisal inputs sent to it.

## 10. Honest Limitations

### No onchain Drand BLS verification

Tacet does **not** verify Drand BLS signatures inside `TacetRound`. The contract
allows `openReveal` after the commit deadline. Drand timelock encryption is the
actual early-decryption barrier.

The project therefore does not claim trustless onchain proof that round `R` was
published. A production version should add an onchain verifier, potentially
through Stylus or an efficient BLS-capable EVM path.

### Demo-scale loops

`clear`, `settle`, and bidder membership checks are O(n). This is appropriate
for small demonstration rounds, not unbounded production markets. Production
requires pagination or a different aggregation design.

### Demo token

`TacetToken` is freely mintable and is not a production asset.

### No audit or mainnet deployment

The repository has tests and explicit invariants but has not undergone an
independent security audit. It is deployed only to Arbitrum Sepolia.

### Other scope boundaries

- no upgradeability mechanism;
- no ERC-7715 wallet-policy mandate standard;
- no MEV protection beyond sealed pre-reveal bids;
- no production oracle for appraisal quality;
- ciphertext and auditor blobs are size-capped but stored onchain.

## 11. Verification Strategy

### Unit and contract tests

- Foundry contract suite covers lifecycle, invalid transitions, commitment
  mismatch, escrow constraints, refund behavior, and reentrancy-related paths.
- TypeScript commitment tests confirm deterministic encoding and byte layout.
- Groq tests validate structured response parsing, rejection, and cap behavior.

### Integration tests

```bash
pnpm verify:integrations
```

Performs non-transactional health checks against:

- Alchemy and Arbitrum Sepolia chain ID;
- live `TacetRound` state;
- ZeroDev bundler EntryPoints;
- public Dune query results;
- Groq model availability;
- installed OpenZeppelin contracts.

### End-to-end lifecycle

```bash
anvil
pnpm e2e:local
```

This proves the complete two-agent lifecycle from deployment through settlement
and writes machine-readable evidence to `outputs/e2e-local.json`.

### Live sponsor proofs

```bash
pnpm prove:zerodev
pnpm sync:dune
```

The first sends a real sponsored UserOperation. The second reads live contract
state through Alchemy and publishes a Dune query.

## 12. Production Roadmap

1. Add onchain Drand BLS verification.
2. Replace demo token assumptions with explicitly supported settlement assets.
3. Paginate or redesign clearing and settlement for large rounds.
4. Standardize mandates with wallet-native policy tooling such as ERC-7715.
5. Add keeper redundancy, monitoring, retries, and transaction simulations.
6. Add fuzzing, invariant testing, formal analysis, and an independent audit.
7. Deploy to Arbitrum mainnet only after the security model is validated.

## 13. Design Lineage

Tacet is an independent Arbitrum/EVM implementation. The Solidity lifecycle,
viem SDK, EVM agent and keeper runtimes, scripts, frontend, deployments, and
sponsor integrations are native to this repository.

The cryptographic commitment encoding, Drand timelock sealing, auditor identity
encryption, keeper orchestration, and mandate concepts are adapted from
[Sub Rosa](https://github.com/karagozemin/Sub-Rosa) under MIT.
