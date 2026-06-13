import {
  fetchBeacon,
  quicknetClient,
  roundAt as drandRoundAt,
} from "drand-client";

export const QUICKNET_HASH =
  "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";

export type DrandClient = ReturnType<typeof quicknetClient>;

export function quicknet(): DrandClient {
  return quicknetClient();
}

export async function currentRound(client: DrandClient, unixMillis = Date.now()): Promise<number> {
  const info = await client.chain().info();
  return drandRoundAt(unixMillis, info);
}

export async function roundInSeconds(client: DrandClient, seconds: number): Promise<number> {
  const info = await client.chain().info();
  return drandRoundAt(Date.now() + seconds * 1000, info);
}

export async function fetchRoundBeacon(client: DrandClient, round: number) {
  return fetchBeacon(client, round);
}

export async function drandRoundPublishTimeMs(client: DrandClient, round: number): Promise<number> {
  const info = await client.chain().info();
  return (info.genesis_time + info.period * round) * 1000;
}
