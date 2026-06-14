import { access } from "node:fs/promises";
import { resolve } from "node:path";

import { createPublicClient, http } from "viem";
import { arbitrumSepolia } from "viem/chains";

import { tacetRoundAbi } from "@tacet/sdk";
import { envKey, loadEnv } from "./load-env.js";

loadEnv();

const checks: Array<{ name: string; detail: string }> = [];

function pass(name: string, detail: string) {
  checks.push({ name, detail });
  console.log(`PASS ${name}: ${detail}`);
}

async function rpcCall(url: string, method: string, params: unknown[] = []) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`${method} HTTP ${response.status}`);
  const payload = (await response.json()) as { error?: { message?: string }; result?: unknown };
  if (payload.error) throw new Error(payload.error.message ?? `${method} failed`);
  return payload.result;
}

async function main() {
  const alchemyRpc = envKey("ARBITRUM_SEPOLIA_RPC_URL");
  const zeroDevRpc = envKey("ZERODEV_RPC");
  const duneApiKey = envKey("DUNE_API_KEY");
  const groqApiKey = envKey("GROQ_API_KEY");
  const roundAddress = envKey("TACET_ROUND_ADDRESS") as `0x${string}`;

  const chainId = await rpcCall(alchemyRpc, "eth_chainId");
  if (chainId !== "0x66eee") throw new Error(`Alchemy returned unexpected chain ID ${chainId}`);
  pass("Alchemy", "connected to Arbitrum Sepolia (421614)");

  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(alchemyRpc) });
  const nextRoundId = await publicClient.readContract({
    address: roundAddress,
    abi: tacetRoundAbi,
    functionName: "nextRoundId",
  });
  pass("TacetRound", `${Number(nextRoundId) - 1} live rounds found at ${roundAddress}`);

  const entryPoints = await rpcCall(zeroDevRpc, "eth_supportedEntryPoints");
  if (!Array.isArray(entryPoints) || entryPoints.length === 0) {
    throw new Error("ZeroDev returned no supported EntryPoints");
  }
  pass("ZeroDev", `${entryPoints.length} bundler EntryPoints available`);

  const duneQueryId = process.env.DUNE_QUERY_ID ?? "7718212";
  const duneResponse = await fetch(`https://api.dune.com/api/v1/query/${duneQueryId}/results?limit=1`, {
    headers: { "X-DUNE-API-KEY": duneApiKey },
  });
  if (!duneResponse.ok) throw new Error(`Dune API HTTP ${duneResponse.status}`);
  const dune = (await duneResponse.json()) as { state?: string };
  if (dune.state !== "QUERY_STATE_COMPLETED") {
    throw new Error(`Dune query is not completed: ${dune.state ?? "unknown state"}`);
  }
  pass("Dune Analytics", `query ${duneQueryId} result is available`);

  const groqResponse = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${groqApiKey}` },
  });
  if (!groqResponse.ok) throw new Error(`Groq API HTTP ${groqResponse.status}`);
  const groq = (await groqResponse.json()) as { data?: unknown[] };
  pass("Groq", `${groq.data?.length ?? 0} models available`);

  await access(resolve("contracts/lib/openzeppelin-contracts/contracts"));
  pass("OpenZeppelin", "contract library installed locally");

  console.log(`\nAll ${checks.length} integration checks passed.`);
}

main().catch((error) => {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
