import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { arbitrumSepolia } from "viem/chains";
import { createPublicClient, http } from "viem";

async function main() {
  const deploymentPath = resolve("outputs/deployment.json");
  const evidence = JSON.parse(readFileSync(deploymentPath, "utf8"));
  const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc";

  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(rpcUrl) });
  const roundAbi = await import("../contracts/out/TacetRound.sol/TacetRound.json", {
    with: { type: "json" },
  }).then((m) => m.default.abi);

const roundId = BigInt(evidence.roundId);
const { request } = await publicClient.simulateContract({
  address: evidence.roundAddress,
  abi: roundAbi,
  functionName: "getRound",
  args: [roundId],
});
const r = request as unknown as {
  status: number;
  winner: string;
  winningBid: bigint;
};

console.log("Sepolia smoke OK");
console.log(`Round ${roundId} status index: ${r.status}`);
console.log(`Winner: ${r.winner}`);
console.log(`Explorer: ${evidence.explorer.round}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
