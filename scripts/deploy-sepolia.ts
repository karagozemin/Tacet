import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { arbitrumSepolia } from "viem/chains";
import { createPublicClient, createWalletClient, formatEther, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { generateAuditorKeypair, quicknet, roundInSeconds } from "@tacet/tlock";
import { TacetClient, itemRefFromString } from "@tacet/sdk";
import { createSessionMandate, tokenUnitsFromUsdc } from "../services/agent/src/mandate.js";
import { runBidderAgent } from "../services/agent/src/bidder.js";
import { runKeeperLifecycle } from "../services/keeper/src/keeper.js";
import { loadEnv, normalizePrivateKey, envKey } from "./load-env.js";

loadEnv();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function loadArtifacts() {
  const tacetRoundArtifact = await import("../contracts/out/TacetRound.sol/TacetRound.json", {
    with: { type: "json" },
  }).then((m) => m.default);
  const tacetTokenArtifact = await import("../contracts/out/TacetToken.sol/TacetToken.json", {
    with: { type: "json" },
  }).then((m) => m.default);
  return { tacetRoundArtifact, tacetTokenArtifact };
}

async function main() {
  const { tacetRoundArtifact, tacetTokenArtifact } = await loadArtifacts();
  const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc";
  const deployerKey = normalizePrivateKey(envKey("DEPLOYER_PRIVATE_KEY"));
  const agentBPrincipal = normalizePrivateKey(envKey("AGENT_B_PRINCIPAL_KEY", envKey("DEPLOYER_PRIVATE_KEY")));
  const keeperKey = normalizePrivateKey(envKey("KEEPER_PRIVATE_KEY", envKey("DEPLOYER_PRIVATE_KEY")));

  const deployer = privateKeyToAccount(deployerKey);
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(rpcUrl) });
  const wallet = createWalletClient({ account: deployer, chain: arbitrumSepolia, transport: http(rpcUrl) });

  const balance = await publicClient.getBalance({ address: deployer.address });
  console.log(`Deployer ${deployer.address} balance: ${formatEther(balance)} ETH`);
  if (balance === 0n) throw new Error("Deployer has zero Sepolia ETH");

  console.log("Deploying Tacet to Arbitrum Sepolia…");
  const tokenHash = await wallet.deployContract({
    abi: tacetTokenArtifact.abi,
    bytecode: tacetTokenArtifact.bytecode.object as Hex,
    account: deployer,
    chain: arbitrumSepolia,
  });
  const tokenReceipt = await publicClient.waitForTransactionReceipt({ hash: tokenHash });
  const tokenAddress = tokenReceipt.contractAddress!;

  const roundHash = await wallet.deployContract({
    abi: tacetRoundArtifact.abi,
    bytecode: tacetRoundArtifact.bytecode.object as Hex,
    args: [tokenAddress],
    account: deployer,
    chain: arbitrumSepolia,
  });
  const roundReceipt = await publicClient.waitForTransactionReceipt({ hash: roundHash });
  const roundAddress = roundReceipt.contractAddress!;

  const drand = quicknet();
  const revealRound = await roundInSeconds(drand, 45);
  const now = Math.floor(Date.now() / 1000);
  const commitDeadline = BigInt(now + 90);
  const revealDeadline = BigInt(now + 240);

  const operator = new TacetClient({ rpcUrl, chain: arbitrumSepolia, roundAddress, account: deployerKey });
  const { roundId, hash: createTx } = await operator.createRound({
    itemRef: itemRefFromString("sepolia-hackathon-lot-1"),
    revealRound: BigInt(revealRound),
    commitDeadline,
    revealDeadline,
  });

  const auditor = generateAuditorKeypair();
  const maxEscrow = tokenUnitsFromUsdc(250);
  const m1 = await createSessionMandate({
    principalKey: deployerKey,
    contractAddress: roundAddress,
    roundId,
    itemRef: "sepolia-hackathon-lot-1",
    basePriceUsdc: 50,
    category: "agentic",
    maxBidUnits: maxEscrow,
    maxEscrowUnits: maxEscrow,
    commitDeadline: Number(commitDeadline),
  });
  const m2 = await createSessionMandate({
    principalKey: agentBPrincipal,
    contractAddress: roundAddress,
    roundId,
    itemRef: "sepolia-hackathon-lot-1",
    basePriceUsdc: 50,
    category: "agentic",
    maxBidUnits: maxEscrow,
    maxEscrowUnits: maxEscrow,
    commitDeadline: Number(commitDeadline),
  });

  for (const key of [m1.sessionKey, m2.sessionKey]) {
    const session = privateKeyToAccount(key);
    const fundHash = await wallet.sendTransaction({
      account: deployer,
      chain: arbitrumSepolia,
      to: session.address,
      value: 10n ** 15n,
    });
    await publicClient.waitForTransactionReceipt({ hash: fundHash });
    const mintHash = await wallet.writeContract({
      address: tokenAddress,
      abi: tacetTokenArtifact.abi,
      functionName: "mint",
      args: [session.address, tokenUnitsFromUsdc(1000)],
      account: deployer,
      chain: arbitrumSepolia,
    });
    await publicClient.waitForTransactionReceipt({ hash: mintHash });
  }

  const agentA = await runBidderAgent({
    mandate: m1.mandate,
    sessionKey: m1.sessionKey,
    rpcUrl,
    chain: arbitrumSepolia,
    roundAddress,
    tokenAddress,
    auditorPubkey: auditor.publicKey,
    revealRound,
    agentName: "Agent Atlas",
    attributes: { quality: 78, demand: 85, scarcity: 50, risk: 25 },
    log: console.log,
  });
  const agentB = await runBidderAgent({
    mandate: m2.mandate,
    sessionKey: m2.sessionKey,
    rpcUrl,
    chain: arbitrumSepolia,
    roundAddress,
    tokenAddress,
    auditorPubkey: auditor.publicKey,
    revealRound,
    agentName: "Agent Boreal",
    attributes: { quality: 60, demand: 75, scarcity: 70, risk: 35 },
    log: console.log,
  });

  const evidence: Record<string, unknown> = {
    chainId: arbitrumSepolia.id,
    network: "arbitrum-sepolia",
    deploy: {
      tokenAddress,
      roundAddress,
      tokenTx: tokenHash,
      roundTx: roundHash,
      createRoundTx: createTx,
    },
    explorer: {
      token: `https://sepolia.arbiscan.io/address/${tokenAddress}`,
      round: `https://sepolia.arbiscan.io/address/${roundAddress}`,
    },
    roundId: roundId.toString(),
    revealRound,
    commitDeadline: commitDeadline.toString(),
    revealDeadline: revealDeadline.toString(),
    agents: [agentA, agentB],
    keeper: null as unknown,
  };

  console.log("Waiting for commit deadline before keeper…");
  while (Math.floor(Date.now() / 1000) <= Number(commitDeadline)) {
    await new Promise((r) => setTimeout(r, 2000));
  }

  const keeperClient = new TacetClient({ rpcUrl, chain: arbitrumSepolia, roundAddress, account: keeperKey });
  let lifecycle = await runKeeperLifecycle({ client: keeperClient, drand, log: console.log, maxWaitSeconds: 180 }, roundId);

  while (Math.floor(Date.now() / 1000) <= Number(revealDeadline)) {
    await new Promise((r) => setTimeout(r, 5000));
    lifecycle = await runKeeperLifecycle({ client: keeperClient, drand, log: console.log, maxWaitSeconds: 30 }, roundId);
  }
  lifecycle = await runKeeperLifecycle({ client: keeperClient, drand, log: console.log }, roundId);
  evidence.keeper = lifecycle;

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
      },
      null,
      2,
    ),
  );
  console.log("Sepolia deployment evidence → outputs/sepolia-evidence.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
