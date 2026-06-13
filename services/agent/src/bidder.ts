import { type Address, type Chain, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { appraise, usdcFromTokenUnits, type AppraisalAttributes } from "@tacet/appraisal";
import { TacetClient } from "@tacet/sdk";
import { generateNonce, quicknet, sealBid, type DrandClient } from "@tacet/tlock";

import {
  assertBidWithinMandate,
  bidFromAppraisal,
  verifySessionMandate,
  type SessionMandate,
} from "./mandate.js";
import { requestGroqDecision, type GroqDecision } from "./groq.js";

export interface DeterministicDecision {
  source: "deterministic";
  model: string;
  suggestedBidUsdc: number;
  confidence: number;
  rationale: string[];
}

export type AgentDecision = DeterministicDecision | GroqDecision;

export interface BidderAgentConfig {
  mandate: SessionMandate;
  sessionKey: Hex;
  rpcUrl: string;
  chain: Chain;
  roundAddress: Address;
  tokenAddress: Address;
  auditorPubkey: Uint8Array;
  revealRound: number;
  attributes: AppraisalAttributes;
  agentName: string;
  groq?: {
    apiKey?: string;
    model?: string;
    persona?: string;
    fallback?: boolean;
  };
  drand?: DrandClient;
  log?: (msg: string) => void;
}

export interface BidderAgentResult {
  agentName: string;
  bidder: Address;
  bidValue: bigint;
  escrow: bigint;
  appraisal: ReturnType<typeof appraise>;
  decision: AgentDecision;
  commitTx: Hex;
  rationale: string[];
}

export async function runBidderAgent(config: BidderAgentConfig): Promise<BidderAgentResult> {
  const log = config.log ?? (() => {});
  const roundId = BigInt(config.mandate.roundId);
  const session = privateKeyToAccount(config.sessionKey);

  if (session.address !== config.mandate.sessionKey) {
    throw new Error("sessionKey does not match mandate.sessionKey");
  }

  await verifySessionMandate(config.mandate, {
    contractAddress: config.roundAddress,
    roundId,
  });

  const reader = new TacetClient({
    rpcUrl: config.rpcUrl,
    chain: config.chain,
    roundAddress: config.roundAddress,
  });
  const round = await reader.getRound(roundId);
  if (round.status !== "Open") {
    throw new Error(`round ${roundId} is not open (status=${round.status})`);
  }

  const appraisal = appraise({
    itemRef: config.mandate.itemRef,
    basePrice: config.mandate.basePriceUsdc,
    category: config.mandate.category,
    attributes: config.attributes,
  });
  log(`${config.agentName}: appraisal fair=${appraisal.fairValue} suggested=${appraisal.suggestedMaxBid}`);

  let decision: AgentDecision = {
    source: "deterministic",
    model: appraisal.model,
    suggestedBidUsdc: appraisal.suggestedMaxBid,
    confidence: appraisal.confidence,
    rationale: appraisal.rationale,
  };
  const groqApiKey = config.groq?.apiKey ?? process.env.GROQ_API_KEY;
  if (groqApiKey) {
    try {
      decision = await requestGroqDecision({
        apiKey: groqApiKey,
        model: config.groq?.model ?? process.env.GROQ_MODEL,
        persona: config.groq?.persona,
        agentName: config.agentName,
        itemRef: config.mandate.itemRef,
        category: config.mandate.category,
        basePriceUsdc: config.mandate.basePriceUsdc,
        attributes: config.attributes,
        baseline: appraisal,
        maxBidUsdc: usdcFromTokenUnits(BigInt(config.mandate.maxBidUnits)),
      });
      log(
        `${config.agentName}: Groq decision model=${decision.model} suggested=${decision.suggestedBidUsdc} confidence=${decision.confidence}`,
      );
    } catch (error) {
      if (config.groq?.fallback === false) throw error;
      log(`${config.agentName}: Groq unavailable, using deterministic fallback (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  const { bidValue, escrow } = bidFromAppraisal(decision.suggestedBidUsdc, config.mandate);
  assertBidWithinMandate(config.mandate, bidValue, escrow);
  log(`${config.agentName}: bid ${usdcFromTokenUnits(bidValue)} TACET escrow ${usdcFromTokenUnits(escrow)}`);

  const drand = config.drand ?? quicknet();
  const nonce = generateNonce();
  const sealed = await sealBid({
    value: bidValue,
    nonce,
    round: config.revealRound,
    client: drand,
    identity: new TextEncoder().encode(`agent:${config.agentName}:${session.address}`),
    auditorPublicKey: config.auditorPubkey,
  });

  const bidder = new TacetClient({
    rpcUrl: config.rpcUrl,
    chain: config.chain,
    roundAddress: config.roundAddress,
    account: config.sessionKey,
  });

  const erc20Abi = [
    {
      type: "function",
      name: "approve",
      inputs: [
        { name: "spender", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ type: "bool" }],
      stateMutability: "nonpayable",
    },
  ] as const;

  const approveHash = await bidder.wallet!.writeContract({
    address: config.tokenAddress,
    abi: erc20Abi,
    functionName: "approve",
    args: [config.roundAddress, escrow],
    account: session,
    chain: config.chain,
  });
  await bidder.public.waitForTransactionReceipt({ hash: approveHash });

  const commitTx = await bidder.commit({ roundId, sealed, escrow });
  log(`${config.agentName}: committed sealed bid tx=${commitTx}`);

  return {
    agentName: config.agentName,
    bidder: session.address,
    bidValue,
    escrow,
    appraisal,
    decision,
    commitTx,
    rationale: decision.rationale,
  };
}

export { generatePrivateKey };
