import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { DuneClient } from "@duneanalytics/client-sdk";
import { arbitrumSepolia } from "viem/chains";

import { TacetClient, tacetRoundAbi } from "@tacet/sdk";
import { envKey, loadEnv } from "./load-env.js";

loadEnv();

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function main() {
  const apiKey = envKey("DUNE_API_KEY");
  const rpcUrl = envKey("ARBITRUM_SEPOLIA_RPC_URL");
  const roundAddress = envKey("TACET_ROUND_ADDRESS") as `0x${string}`;
  const reader = new TacetClient({
    rpcUrl,
    chain: arbitrumSepolia,
    roundAddress,
  });
  const nextRoundId = (await reader.public.readContract({
    address: roundAddress,
    abi: tacetRoundAbi,
    functionName: "nextRoundId",
  })) as bigint;

  const rows: string[] = [];
  for (let id = 1n; id < nextRoundId; id++) {
    const round = await reader.getRound(id);
    const bidders = await reader.getBidders(id);
    let revealed = 0;
    for (const bidder of bidders) {
      const state = await reader.getBidState(id, bidder);
      if (state.revealed) revealed++;
    }
    rows.push(
      [
        `BIGINT '${id}'`,
        sqlString(round.status),
        sqlString(round.operator),
        sqlString(round.winner),
        `DOUBLE '${Number(round.winningBid) / 1e6}'`,
        `BIGINT '${bidders.length}'`,
        `BIGINT '${revealed}'`,
        `BIGINT '${round.revealRound}'`,
        `BIGINT '${round.commitDeadline}'`,
        `BIGINT '${round.revealDeadline}'`,
      ].join(", "),
    );
  }
  if (rows.length === 0) throw new Error("No Tacet rounds found");

  const querySql = `
WITH rounds (
  round_id, status, operator, winner, winning_bid_tacet,
  bidder_count, revealed_count, drand_round, commit_deadline, reveal_deadline
) AS (
  VALUES
    (${rows.join("),\n    (")})
)
SELECT
  *,
  count(*) OVER () AS total_rounds,
  count_if(status = 'Settled') OVER () AS settled_rounds,
  sum(bidder_count) OVER () AS total_commits,
  sum(revealed_count) OVER () AS total_reveals,
  sum(winning_bid_tacet) OVER () AS settled_volume_tacet
FROM rounds
ORDER BY round_id DESC
`.trim();

  const response = await fetch("https://api.dune.com/api/v1/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-DUNE-API-KEY": apiKey,
    },
    body: JSON.stringify({
      name: `Tacet System Analytics ${new Date().toISOString().slice(0, 10)}`,
      description:
        "Arbitrum Sepolia Tacet round snapshot synced from the live contract through Alchemy.",
      query_sql: querySql,
      is_private: false,
      tags: ["tacet", "arbitrum", "agentic", "drand", "zerodev"],
    }),
  });
  if (!response.ok) throw new Error(`Dune create query ${response.status}: ${await response.text()}`);
  const { query_id: queryId } = (await response.json()) as { query_id: number };

  const dune = new DuneClient(apiKey);
  const result = await dune.runQuery({ queryId });
  const evidence = {
    sponsor: "Dune Analytics",
    source: "TacetRound on Arbitrum Sepolia via Alchemy",
    queryId,
    queryUrl: `https://dune.com/queries/${queryId}`,
    roundAddress,
    syncedRounds: rows.length,
    resultRows: result.result?.rows ?? [],
  };
  mkdirSync(resolve("outputs"), { recursive: true });
  writeFileSync(resolve("outputs/dune-evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(`Dune query created and executed: ${evidence.queryUrl}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
