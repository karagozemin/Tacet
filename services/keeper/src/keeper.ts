import type { TacetClient } from "@tacet/sdk";
import { openBid, drandRoundPublishTimeMs, type DrandClient } from "@tacet/tlock";
import { nonceToBytes32 } from "@tacet/tlock";

export type KeeperLogger = (msg: string) => void;

export interface KeeperDeps {
  client: TacetClient;
  drand: DrandClient;
  log?: KeeperLogger;
  maxWaitSeconds?: number;
  pollMs?: number;
}

export interface KeeperResult {
  roundId: bigint;
  finalStatus: string;
  openedReveal: boolean;
  revealed: string[];
  skipped: { bidder: string; reason: string }[];
  txHashes: string[];
}

export const VOID_GRACE_SECONDS = 3600;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function chainNow(client: TacetClient): Promise<bigint> {
  const block = await client.public.getBlock();
  return BigInt(block.timestamp);
}

export async function waitForRound(deps: KeeperDeps, round: number): Promise<boolean> {
  const { drand, log = () => {}, maxWaitSeconds = 0, pollMs = 3000 } = deps;
  const publishAtMs = await drandRoundPublishTimeMs(drand, round);
  const giveUpAtMs = Date.now() + maxWaitSeconds * 1000;

  while (Date.now() < publishAtMs) {
    if (Date.now() >= giveUpAtMs) return false;
    const remainS = Math.ceil((publishAtMs - Date.now()) / 1000);
    log(`waiting ~${remainS}s for Drand round ${round}…`);
    await sleep(Math.min(pollMs, Math.max(250, publishAtMs - Date.now())));
  }
  return true;
}

export async function keepRound(deps: KeeperDeps, roundId: bigint): Promise<KeeperResult> {
  const { client, drand, log = () => {} } = deps;
  const result: KeeperResult = {
    roundId,
    finalStatus: "",
    openedReveal: false,
    revealed: [],
    skipped: [],
    txHashes: [],
  };

  let round = await client.getRound(roundId);
  log(`round ${roundId}: status=${round.status} R=${round.revealRound}`);

  if (round.status === "Open") {
    const R = Number(round.revealRound);
    const available = await waitForRound(deps, R);
    if (!available) {
      log(`Drand round ${R} not published yet`);
      result.finalStatus = round.status;
      return result;
    }

    // Try decrypt probe — confirms timelock gate is open
    const bidders = await client.getBidders(roundId);
    if (bidders.length > 0) {
      const seal = await client.getSeal(roundId, bidders[0]!);
      try {
        await openBid(seal.ciphertext, drand);
      } catch (e) {
        log(`timelock not yet open: ${e instanceof Error ? e.message : String(e)}`);
        result.finalStatus = round.status;
        return result;
      }
    }

    const now = await chainNow(client);
    if (now <= round.commitDeadline) {
      log("commit deadline not passed; cannot open reveal");
      result.finalStatus = round.status;
      return result;
    }

    try {
      const hash = await client.openReveal(roundId);
      result.openedReveal = true;
      result.txHashes.push(hash);
      log(`openReveal OK tx=${hash}`);
    } catch (e) {
      log(`openReveal skip: ${e instanceof Error ? e.message : String(e)}`);
    }
    round = await client.getRound(roundId);
  }

  if (round.status === "Revealing") {
    const bidders = await client.getBidders(roundId);
    for (const bidder of bidders) {
      const state = await client.getBidState(roundId, bidder);
      if (state.revealed) {
        result.skipped.push({ bidder, reason: "already revealed" });
        continue;
      }
      const seal = await client.getSeal(roundId, bidder);
      let opened;
      try {
        opened = await openBid(seal.ciphertext, drand);
      } catch (e) {
        result.skipped.push({ bidder, reason: `decrypt failed: ${e instanceof Error ? e.message : String(e)}` });
        continue;
      }
      try {
        const hash = await client.reveal({
          roundId,
          bidder,
          value: opened.value,
          nonce: nonceToBytes32(opened.nonce),
        });
        result.revealed.push(bidder);
        result.txHashes.push(hash);
        log(`revealed ${bidder} = ${opened.value} tx=${hash}`);
      } catch (e) {
        result.skipped.push({ bidder, reason: e instanceof Error ? e.message : String(e) });
      }
    }
    round = await client.getRound(roundId);
  }

  result.finalStatus = round.status;
  return result;
}

export async function closeRound(deps: KeeperDeps, roundId: bigint) {
  const { client, log = () => {} } = deps;
  const txHashes: string[] = [];
  let round = await client.getRound(roundId);

  if (round.status === "Revealing") {
    const now = await chainNow(client);
    if (now <= round.revealDeadline) {
      return { cleared: false, settled: false, finalStatus: round.status, txHashes };
    }
    const { hash } = await client.clear(roundId);
    txHashes.push(hash);
    log(`clear tx=${hash}`);
    round = await client.getRound(roundId);
  }

  if (round.status === "Cleared") {
    const hash = await client.settle(roundId);
    txHashes.push(hash);
    log(`settle tx=${hash}`);
    round = await client.getRound(roundId);
  }

  return {
    cleared: round.status === "Settled" || round.status === "Cleared",
    settled: round.status === "Settled",
    winner: round.winner,
    winningBid: round.winningBid,
    finalStatus: round.status,
    txHashes,
  };
}

export async function runKeeperLifecycle(deps: KeeperDeps, roundId: bigint) {
  const keep = await keepRound(deps, roundId);
  const close = await closeRound(deps, roundId);
  return { keep, close, allTxHashes: [...keep.txHashes, ...close.txHashes] };
}
