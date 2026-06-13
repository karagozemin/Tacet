import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { anvil } from "viem/chains";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { generateAuditorKeypair, quicknet, roundInSeconds } from "@tacet/tlock";
import { TacetClient, itemRefFromString } from "@tacet/sdk";
import { runKeeperLifecycle } from "../services/keeper/src/keeper.js";
import { createSessionMandate, tokenUnitsFromUsdc } from "../services/agent/src/mandate.js";
import { runBidderAgent } from "../services/agent/src/bidder.js";

const ANVIL_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const ANVIL_PK_2 = "0x59c6995e998f97a5a0044966f0945389dc9b86e40b5a14f12a7946b4a3551e88" as Hex;
const RPC = process.env.ANVIL_RPC_URL ?? "http://127.0.0.1:8545";

async function warpAnvil(publicClient: ReturnType<typeof createPublicClient>, seconds: number) {
  await publicClient.request({ method: "evm_increaseTime", params: [seconds] });
  await publicClient.request({ method: "evm_mine", params: [] });
}

async function loadArtifacts() {
  const tacetRoundBytecode = await import("../contracts/out/TacetRound.sol/TacetRound.json", {
    with: { type: "json" },
  }).then((m) => m.default);
  const tacetTokenBytecode = await import("../contracts/out/TacetToken.sol/TacetToken.json", {
    with: { type: "json" },
  }).then((m) => m.default);
  return { tacetRoundBytecode, tacetTokenBytecode };
}
async function deployLocal(artifacts: Awaited<ReturnType<typeof loadArtifacts>>) {
  const { tacetRoundBytecode, tacetTokenBytecode } = artifacts;
  const account = privateKeyToAccount(ANVIL_PK);
  const wallet = createWalletClient({ account, chain: anvil, transport: http(RPC) });
  const publicClient = createPublicClient({ chain: anvil, transport: http(RPC) });

  const tokenHash = await wallet.deployContract({
    abi: tacetTokenBytecode.abi,
    bytecode: tacetTokenBytecode.bytecode.object as Hex,
    account,
    chain: anvil,
  });
  await publicClient.waitForTransactionReceipt({ hash: tokenHash });
  const tokenReceipt = await publicClient.getTransactionReceipt({ hash: tokenHash });
  const tokenAddress = tokenReceipt.contractAddress!;

  const roundHash = await wallet.deployContract({
    abi: tacetRoundBytecode.abi,
    bytecode: tacetRoundBytecode.bytecode.object as Hex,
    args: [tokenAddress],
    account,
    chain: anvil,
  });
  await publicClient.waitForTransactionReceipt({ hash: roundHash });
  const roundReceipt = await publicClient.getTransactionReceipt({ hash: roundHash });
  const roundAddress = roundReceipt.contractAddress!;

  return { publicClient, wallet, account, tokenAddress, roundAddress, tacetTokenBytecode };
}

async function main() {
  console.log("Tacet local E2E — deploying to Anvil…");
  const artifacts = await loadArtifacts();
  const { account, tokenAddress, roundAddress, tacetTokenBytecode, publicClient } = await deployLocal(artifacts);
  const drand = quicknet();
  const revealRound = await roundInSeconds(drand, 35);
  const block = await publicClient.getBlock();
  const chainNow = Number(block.timestamp);
  const commitDeadline = BigInt(chainNow + 60);
  const revealDeadline = BigInt(chainNow + 120);

  const operator = new TacetClient({
    rpcUrl: RPC,
    chain: anvil,
    roundAddress,
    account: ANVIL_PK,
  });

  const { roundId } = await operator.createRound({
    itemRef: itemRefFromString("local-demo-lot"),
    revealRound: BigInt(revealRound),
    commitDeadline,
    revealDeadline,
    clearingRule: "HighestBid",
  });
  console.log(`round ${roundId} created, Drand R=${revealRound}`);

  const auditor = generateAuditorKeypair();
  const maxEscrow = tokenUnitsFromUsdc(500);
  const m1 = await createSessionMandate({
    principalKey: ANVIL_PK,
    contractAddress: roundAddress,
    roundId,
    itemRef: "local-demo-lot",
    basePriceUsdc: 100,
    category: "agentic",
    maxBidUnits: maxEscrow,
    maxEscrowUnits: maxEscrow,
    commitDeadline: Number(commitDeadline),
  });
  const m2 = await createSessionMandate({
    principalKey: ANVIL_PK_2,
    contractAddress: roundAddress,
    roundId,
    itemRef: "local-demo-lot",
    basePriceUsdc: 100,
    category: "agentic",
    maxBidUnits: maxEscrow,
    maxEscrowUnits: maxEscrow,
    commitDeadline: Number(commitDeadline),
  });

  // Mint tokens + fund gas for session keys
  const tokenAbi = tacetTokenBytecode.abi;
  const minter = createWalletClient({ account, chain: anvil, transport: http(RPC) });
  for (const key of [m1.sessionKey, m2.sessionKey]) {
    const session = privateKeyToAccount(key);
    const fundHash = await minter.sendTransaction({
      account,
      chain: anvil,
      to: session.address,
      value: 10n ** 18n,
    });
    await publicClient.waitForTransactionReceipt({ hash: fundHash });
    const mintHash = await minter.writeContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "mint",
      args: [session.address, tokenUnitsFromUsdc(1000)],
      account,
      chain: anvil,
    });
    await publicClient.waitForTransactionReceipt({ hash: mintHash });
  }

  const agentA = await runBidderAgent({
    mandate: m1.mandate,
    sessionKey: m1.sessionKey,
    rpcUrl: RPC,
    chain: anvil,
    roundAddress,
    tokenAddress,
    auditorPubkey: auditor.publicKey,
    revealRound,
    agentName: "Agent Atlas",
    attributes: { quality: 72, demand: 80, scarcity: 55, risk: 30 },
    drand,
    log: console.log,
  });
  const agentB = await runBidderAgent({
    mandate: m2.mandate,
    sessionKey: m2.sessionKey,
    rpcUrl: RPC,
    chain: anvil,
    roundAddress,
    tokenAddress,
    auditorPubkey: auditor.publicKey,
    revealRound,
    agentName: "Agent Boreal",
    attributes: { quality: 65, demand: 70, scarcity: 60, risk: 40 },
    drand,
    log: console.log,
  });

  console.log("Warping past commit deadline on Anvil…");
  await warpAnvil(publicClient, 61);

  const keeperAccount = privateKeyToAccount(ANVIL_PK);
  const keeperClient = new TacetClient({
    rpcUrl: RPC,
    chain: anvil,
    roundAddress,
    account: ANVIL_PK,
  });

  console.log("Keeper: open + reveal…");
  const keepResult = await runKeeperLifecycle(
    {
      client: keeperClient,
      drand,
      log: console.log,
      maxWaitSeconds: 120,
      pollMs: 3000,
    },
    roundId,
  );

  console.log("Warping past reveal deadline on Anvil…");
  await warpAnvil(publicClient, 61);

  const final = await runKeeperLifecycle(
    { client: keeperClient, drand, log: console.log, maxWaitSeconds: 0 },
    roundId,
  );

  const evidence = {
    network: "anvil-local",
    roundAddress,
    tokenAddress,
    roundId: roundId.toString(),
    revealRound,
    agents: [agentA, agentB],
    lifecycle: { keep: keepResult.keep, close: final.close },
    operator: keeperAccount.address,
  };

  const outDir = resolve("outputs");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "e2e-local.json"), JSON.stringify(evidence, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  console.log("Local E2E complete → outputs/e2e-local.json");
  console.log(`Final status: ${final.close.finalStatus}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
