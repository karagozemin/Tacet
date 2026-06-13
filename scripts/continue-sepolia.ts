import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { arbitrumSepolia } from "viem/chains";
import { createPublicClient, http } from "viem";

import { quicknet } from "@tacet/tlock";
import { TacetClient } from "@tacet/sdk";
import { runKeeperLifecycle } from "../services/keeper/src/keeper.js";
import { loadEnv, normalizePrivateKey, envKey } from "./load-env.js";

loadEnv();

const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc";
function addressEnv(name: string, fallback: `0x${string}`): `0x${string}` {
  const v = process.env[name]?.trim();
  return v && v.startsWith("0x") ? (v as `0x${string}`) : fallback;
}

const roundAddress = addressEnv("TACET_ROUND_ADDRESS", "0x7359840f416951C27d7B0c1f84AE88091939dfdB");
const tokenAddress = addressEnv("TACET_TOKEN_ADDRESS", "0xbAF3F929E3D11866ddD672E96bB669427cFA6726");
const roundId = BigInt(process.env.DEMO_ROUND_ID ?? "1");
const keeperKey = normalizePrivateKey(envKey("KEEPER_PRIVATE_KEY", envKey("DEPLOYER_PRIVATE_KEY")));

async function main() {
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(rpcUrl) });
  const block = await publicClient.getBlock();
  console.log(`Chain time: ${block.timestamp}`);

  const keeperClient = new TacetClient({
    rpcUrl,
    chain: arbitrumSepolia,
    roundAddress,
    account: keeperKey,
  });

  const round = await keeperClient.getRound(roundId);
  console.log(`Round ${roundId}: status=${round.status} revealR=${round.revealRound}`);
  console.log(`commitDeadline=${round.commitDeadline} revealDeadline=${round.revealDeadline}`);

  const now = Math.floor(Date.now() / 1000);
  if (now <= Number(round.commitDeadline)) {
    const wait = Number(round.commitDeadline) - now + 2;
    console.log(`Waiting ${wait}s for commit deadline…`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }

  const drand = quicknet();
  let lifecycle = await runKeeperLifecycle(
    { client: keeperClient, drand, log: console.log, maxWaitSeconds: 300 },
    roundId,
  );

  while (Math.floor(Date.now() / 1000) <= Number(round.revealDeadline)) {
    const remain = Number(round.revealDeadline) - Math.floor(Date.now() / 1000) + 2;
    console.log(`Waiting ${remain}s for reveal deadline…`);
    await new Promise((r) => setTimeout(r, Math.min(remain, 30) * 1000));
    lifecycle = await runKeeperLifecycle(
      { client: keeperClient, drand, log: console.log, maxWaitSeconds: 60 },
      roundId,
    );
    const updated = await keeperClient.getRound(roundId);
    if (updated.status === "Settled" || updated.status === "Cleared") break;
  }

  lifecycle = await runKeeperLifecycle({ client: keeperClient, drand, log: console.log }, roundId);
  const finalRound = await keeperClient.getRound(roundId);

  const evidencePath = resolve("outputs/sepolia-evidence.json");
  let evidence: Record<string, unknown> = existsSync(evidencePath)
    ? JSON.parse(readFileSync(evidencePath, "utf8"))
    : {
        chainId: arbitrumSepolia.id,
        network: "arbitrum-sepolia",
        deploy: { tokenAddress, roundAddress },
        explorer: {
          token: `https://sepolia.arbiscan.io/address/${tokenAddress}`,
          round: `https://sepolia.arbiscan.io/address/${roundAddress}`,
        },
        roundId: roundId.toString(),
      };

  evidence.keeper = lifecycle;
  evidence.finalStatus = finalRound.status;
  evidence.winner = finalRound.winner;
  evidence.winningBid = finalRound.winningBid.toString();

  const outDir = resolve("outputs");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    resolve(outDir, "sepolia-evidence.json"),
    JSON.stringify(evidence, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2),
  );
  writeFileSync(
    resolve(outDir, "deployment.json"),
    JSON.stringify(
      {
        chainId: arbitrumSepolia.id,
        tokenAddress,
        roundAddress,
        roundId: roundId.toString(),
        explorer: evidence.explorer,
        finalStatus: finalRound.status,
      },
      null,
      2,
    ),
  );

  console.log(`Done — status: ${finalRound.status}`);
  console.log(`Evidence → outputs/sepolia-evidence.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
