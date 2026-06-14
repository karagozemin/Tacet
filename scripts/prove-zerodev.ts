import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { arbitrumSepolia } from "viem/chains";

import { itemRefFromString } from "@tacet/sdk";
import { quicknet, roundInSeconds } from "@tacet/tlock";
import { ZeroDevTacetClient } from "../services/keeper/src/zerodev.js";
import { envKey, loadEnv, normalizePrivateKey } from "./load-env.js";

loadEnv();

async function main() {
  const rpcUrl = envKey("ARBITRUM_SEPOLIA_RPC_URL");
  const zeroDevRpc = envKey("ZERODEV_RPC");
  const roundAddress = envKey("TACET_ROUND_ADDRESS") as `0x${string}`;
  const ownerKey = normalizePrivateKey(envKey("KEEPER_PRIVATE_KEY", envKey("DEPLOYER_PRIVATE_KEY")));

  const client = await ZeroDevTacetClient.create({
    rpcUrl,
    zeroDevRpc,
    chain: arbitrumSepolia,
    roundAddress,
    ownerKey,
  });
  console.log(`ZeroDev Kernel keeper: ${client.accountAddress}`);

  const drand = quicknet();
  const revealRound = await roundInSeconds(drand, 180);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const result = await client.createRound({
    itemRef: itemRefFromString(`tacet:zerodev-proof:${Date.now()}`),
    revealRound: BigInt(revealRound),
    clearingRule: "HighestBid",
    commitDeadline: now + 120n,
    revealDeadline: now + 300n,
  });

  const evidence = {
    sponsor: "ZeroDev",
    network: "Arbitrum Sepolia",
    chainId: arbitrumSepolia.id,
    kernelAccount: client.accountAddress,
    roundAddress,
    roundId: result.roundId.toString(),
    userOpHash: result.userOpHash,
    transactionHash: result.transactionHash,
    explorer: `https://sepolia.arbiscan.io/tx/${result.transactionHash}`,
    action: "TacetRound.createRound",
  };

  mkdirSync(resolve("outputs"), { recursive: true });
  writeFileSync(resolve("outputs/zerodev-evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(`Sponsored createRound confirmed: ${evidence.explorer}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
