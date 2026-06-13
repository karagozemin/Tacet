# Deployment

## Prerequisites

- Foundry (`forge`)
- Node 20+, pnpm
- Arbitrum Sepolia ETH on deployer wallet
- `.env` from `.env.example`

## Local (Anvil)

```bash
anvil
pnpm e2e:local
```

Artifacts: `outputs/e2e-local.json`

## Arbitrum Sepolia

### 1. Configure environment

```bash
cp .env.example .env
# Set DEPLOYER_PRIVATE_KEY (never commit)
```

### 2. Deploy + run demo round

```bash
cd contracts && forge build && cd ..
pnpm deploy:sepolia
```

This script:

1. Deploys `TacetToken` + `TacetRound`
2. Creates a demo round with Drand reveal round ~45s ahead
3. Runs **Agent Atlas** and **Agent Boreal** with distinct appraisals
4. Waits for commit deadline + Drand cue
5. Runs keeper through clear/settle
6. Writes `outputs/sepolia-evidence.json` and `outputs/deployment.json`

### 3. Smoke test

```bash
pnpm smoke:sepolia
```

### 4. Contract verification (optional)

```bash
cd contracts
forge verify-contract <ROUND_ADDRESS> src/TacetRound.sol:TacetRound \
  --chain-id 421614 \
  --constructor-args $(cast abi-encode "constructor(address)" <TOKEN_ADDRESS>) \
  --etherscan-api-key $ARBISCAN_API_KEY
```

## Chain details

| Property | Value |
|----------|-------|
| Network | Arbitrum Sepolia |
| Chain ID | 421614 |
| RPC | https://sepolia-rollup.arbitrum.io/rpc |
| Explorer | https://sepolia.arbiscan.io |

## Evidence file schema

`outputs/sepolia-evidence.json` includes:

- `deploy.tokenAddress`, `deploy.roundAddress`, transaction hashes
- `agents[]` with appraisal rationale and commit txs
- `keeper` lifecycle tx hashes
- Arbiscan links

## Blockers without secrets

If `DEPLOYER_PRIVATE_KEY` is unset, all offline work still runs (tests, local Anvil, UI). Sepolia deploy requires a funded key from the operator.
