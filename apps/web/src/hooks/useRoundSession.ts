import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { generateNonce, openBid, quicknet, roundInSeconds, sealBid } from "@tacet/tlock";
import { TacetClient, itemRefFromString } from "@tacet/sdk";
import type { Address, Hash, Hex } from "viem";
import { toHex } from "viem";

import {
  CHAIN,
  DEFAULT_COMMIT_DURATION_SECONDS,
  LIVE_COMMIT_CLOSE_BEFORE_REVEAL_SECONDS,
  LIVE_REVEAL_WINDOW_AFTER_REVEAL_SECONDS,
  ROUND_ADDRESS,
  RPC_URL,
  TOKEN_ADDRESS,
  displayError,
  formatTokenAmount,
  toTokenUnits,
} from "../config/chain";
import { erc20Abi } from "../lib/tokenAbi";
import { formatCountdown, useDrandCountdown } from "./useDrandCountdown";

export type ActionStatus = "idle" | "working" | "ok" | "error";

function storedRoundId(storageKey: string): bigint | null {
  const saved = window.localStorage.getItem(storageKey);
  try {
    return saved ? BigInt(saved) : null;
  } catch {
    return null;
  }
}

export function useRoundSession(sessionKey = "default") {
  const storageKey = `tacet:round-id:${sessionKey}`;
  const { address, isConnected, chainId } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [walletStatus, setWalletStatus] = useState("Connect MetaMask on Arbitrum Sepolia.");
  const [bidAmount, setBidAmount] = useState(50);
  const [roundId, setRoundId] = useState<bigint | null>(() => {
    const scoped = storedRoundId(storageKey);
    if (scoped != null) return scoped;
    if (sessionKey !== "auction") return null;
    const legacy = storedRoundId("tacet:round-id");
    if (legacy != null) {
      window.localStorage.setItem(storageKey, legacy.toString());
      window.localStorage.removeItem("tacet:round-id");
    }
    return legacy;
  });
  const [commitValue, setCommitValue] = useState<bigint | null>(null);
  const [sealedCiphertext, setSealedCiphertext] = useState<Uint8Array | null>(null);
  const [status, setStatus] = useState<ActionStatus>("idle");
  const [log, setLog] = useState<string[]>([]);
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null);
  const [live, setLive] = useState<Awaited<ReturnType<TacetClient["getRound"]>> | null>(null);
  const [bidders, setBidders] = useState<Address[]>([]);
  const [bidStates, setBidStates] = useState<
    Record<string, Awaited<ReturnType<TacetClient["getBidState"]>>>
  >({});
  const [revealProgress, setRevealProgress] = useState<{ current: number; total: number } | null>(
    null,
  );

  const client = useMemo(() => {
    if (!walletClient || !publicClient) return null;
    return new TacetClient({
      rpcUrl: RPC_URL,
      chain: CHAIN,
      roundAddress: ROUND_ADDRESS,
      tokenAddress: TOKEN_ADDRESS,
      walletClient,
      publicClient,
    });
  }, [walletClient, publicClient]);

  const reader = useMemo(
    () =>
      new TacetClient({
        rpcUrl: RPC_URL,
        chain: CHAIN,
        roundAddress: ROUND_ADDRESS,
        tokenAddress: TOKEN_ADDRESS,
        publicClient: publicClient ?? undefined,
      }),
    [publicClient],
  );

  const targetRound = live ? Number(live.revealRound) : 0;
  const drandGate = useDrandCountdown(targetRound || 1);
  const commitSecondsRemaining = live
    ? Math.max(0, Number(live.commitDeadline) - Math.floor(Date.now() / 1000))
    : null;
  const revealSecondsRemaining = live
    ? Math.max(0, Number(live.revealDeadline) - Math.floor(Date.now() / 1000))
    : null;
  const commitClosed = commitSecondsRemaining != null && commitSecondsRemaining <= 0;
  const revealClosed = revealSecondsRemaining != null && revealSecondsRemaining <= 0;
  const hasCommitted = Boolean(
    address &&
      ((bidStates[address]?.escrow ?? 0n) > 0n || (commitValue ?? 0n) > 0n),
  );
  const revealedCount = Object.values(bidStates).filter((s) => s.revealed).length;
  const wrongChain = isConnected && chainId !== CHAIN.id;

  const push = useCallback((message: string) => {
    setLog((prev) => [message, ...prev].slice(0, 10));
  }, []);

  const selectRound = useCallback((id: bigint | null) => {
    setRoundId(id);
    setLive(null);
    setBidders([]);
    setBidStates({});
    setCommitValue(null);
    setSealedCiphertext(null);
    if (id == null) {
      window.localStorage.removeItem(storageKey);
    } else {
      window.localStorage.setItem(storageKey, id.toString());
    }
  }, [storageKey]);

  useEffect(() => {
    selectRound(storedRoundId(storageKey));
    setLog([]);
    setStatus("idle");
  }, [storageKey, selectRound]);

  const refresh = useCallback(
    async (id = roundId) => {
      if (!id) return;
      try {
        const round = await reader.getRound(id);
        const list = await reader.getBidders(id);
        const states: Record<string, Awaited<ReturnType<TacetClient["getBidState"]>>> = {};
        for (const bidder of list) {
          states[bidder] = await reader.getBidState(id, bidder);
        }
        setLive(round);
        setBidders(list);
        setBidStates(states);
      } catch (e) {
        push(displayError(e));
      }
    },
    [reader, roundId, push],
  );

  useEffect(() => {
    if (roundId) void refresh(roundId);
    const id = window.setInterval(() => {
      if (roundId) void refresh(roundId);
    }, 12_000);
    return () => window.clearInterval(id);
  }, [roundId, refresh]);

  useEffect(() => {
    if (!address || !publicClient) {
      setTokenBalance(null);
      return;
    }
    void publicClient
      .readContract({
        address: TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      })
      .then(setTokenBalance)
      .catch(() => setTokenBalance(null));
  }, [address, publicClient, status]);

  async function connect() {
    setStatus("working");
    try {
      const connector = connectors[0];
      if (!connector) throw new Error("No wallet connector found");
      await connectAsync({ connector, chainId: CHAIN.id });
      setWalletStatus(`Connected on Arbitrum Sepolia.`);
      push("Wallet connected.");
      setStatus("ok");
    } catch (e) {
      const msg = displayError(e);
      setWalletStatus(msg);
      setStatus("error");
      push(msg);
    }
  }

  async function switchNetwork() {
    setStatus("working");
    try {
      await switchChainAsync({ chainId: CHAIN.id });
      setWalletStatus("Connected on Arbitrum Sepolia.");
      push("Switched to Arbitrum Sepolia.");
      setStatus("ok");
    } catch (e) {
      const msg = displayError(e);
      setWalletStatus(msg);
      setStatus("error");
      push(msg);
    }
  }

  async function bufferedFees() {
    if (!publicClient) throw new Error("Arbitrum RPC client unavailable.");
    const [block, estimate] = await Promise.all([
      publicClient.getBlock({ blockTag: "latest" }),
      publicClient.estimateFeesPerGas({ type: "eip1559" }),
    ]);
    const priority = estimate.maxPriorityFeePerGas;
    const baseFee = block.baseFeePerGas ?? estimate.maxFeePerGas;
    const bufferedMaxFee = baseFee * 2n + priority;
    return {
      maxFeePerGas:
        bufferedMaxFee > estimate.maxFeePerGas ? bufferedMaxFee : estimate.maxFeePerGas,
      maxPriorityFeePerGas: priority,
    };
  }

  async function mintDemoTokens() {
    if (!client || !walletClient || !address) return;
    setStatus("working");
    try {
      const amount = toTokenUnits(1000);
      const fees = await bufferedFees();
      const hash = await walletClient.writeContract({
        address: TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: "mint",
        args: [address, amount],
        chain: CHAIN,
        account: address,
        ...fees,
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      push(`Minted ${formatTokenAmount(amount)} for demo.`);
      setStatus("ok");
    } catch (e) {
      const msg = displayError(e);
      setStatus("error");
      push(msg);
    }
  }

  async function createRound(durationSeconds = DEFAULT_COMMIT_DURATION_SECONDS) {
    if (!client || !address) return;
    setStatus("working");
    try {
      const drand = quicknet();
      const revealInSeconds = durationSeconds + LIVE_COMMIT_CLOSE_BEFORE_REVEAL_SECONDS;
      const revealRound = await roundInSeconds(drand, revealInSeconds);
      const info = await drand.chain().info();
      const tReveal = Number(info.genesis_time) + Number(info.period) * revealRound;
      const commitDeadline = BigInt(tReveal - LIVE_COMMIT_CLOSE_BEFORE_REVEAL_SECONDS);
      const revealDeadline = BigInt(tReveal + LIVE_REVEAL_WINDOW_AFTER_REVEAL_SECONDS);
      const itemRef = itemRefFromString(`tacet:${address}:${Date.now()}`);
      const { roundId: newId, hash } = await client.createRound({
        itemRef,
        revealRound: BigInt(revealRound),
        clearingRule: "HighestBid",
        commitDeadline,
        revealDeadline,
      });
      selectRound(newId);
      setStatus("ok");
      push(`Round #${newId} created · R=${revealRound} · tx ${hash.slice(0, 10)}…`);
      await refresh(newId);
    } catch (e) {
      const msg = displayError(e);
      setStatus("error");
      push(msg);
    }
  }

  async function joinRound(idStr: string) {
    if (!address) return;
    const trimmed = idStr.trim();
    if (!trimmed) return;
    setStatus("working");
    try {
      const parsed = BigInt(trimmed);
      const round = await reader.getRound(parsed);
      if (round.status !== "Open") {
        throw new Error(`Round #${parsed} is ${round.status} — commit window closed.`);
      }
      const now = BigInt(Math.floor(Date.now() / 1000));
      if (round.commitDeadline <= now) {
        throw new Error(`Round #${parsed} commit window has already closed.`);
      }
      selectRound(parsed);
      setStatus("ok");
      push(`Joined round #${parsed}.`);
      await refresh(parsed);
    } catch (e) {
      const msg = displayError(e);
      setStatus("error");
      push(msg);
    }
  }

  async function commitBid() {
    if (!client || !address || roundId == null || !walletClient) return;
    setStatus("working");
    try {
      const round = await reader.getRound(roundId);
      const escrow = toTokenUnits(bidAmount);
      const nonce = generateNonce();
      const drand = quicknet();
      const sealed = await sealBid({
        value: escrow,
        nonce,
        round: Number(round.revealRound),
        client: drand,
      });

      const fees = await bufferedFees();
      const approveHash = await walletClient.writeContract({
        address: TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: "approve",
        args: [ROUND_ADDRESS, escrow],
        chain: CHAIN,
        account: address,
        ...fees,
      });
      await publicClient!.waitForTransactionReceipt({ hash: approveHash });

      const hash = await client.commit({ roundId, sealed, escrow });
      setCommitValue(escrow);
      setSealedCiphertext(sealed.ciphertext);
      setStatus("ok");
      push(`Sealed ${formatTokenAmount(escrow)} · tx ${hash.slice(0, 10)}…`);
      await refresh(roundId);
    } catch (e) {
      const msg = displayError(e);
      setStatus("error");
      push(msg);
    }
  }

  async function openAndReveal() {
    if (!client || roundId == null) return;
    if (live && live.status === "Open" && !commitClosed) {
      push("Commit window still open — wait for deadline before reveal.");
      return;
    }
    setStatus("working");
    setRevealProgress(null);
    try {
      let round = await reader.getRound(roundId);
      if (round.status === "Open") {
        if (!commitClosed) throw new Error("Commit deadline not reached yet.");
        const hash = await client.openReveal(roundId);
        push(`Reveal gate opened · tx ${hash.slice(0, 10)}…`);
        round = await reader.getRound(roundId);
      }
      if (round.status !== "Revealing") {
        throw new Error(`Round is ${round.status}, expected Revealing.`);
      }

      const list = await reader.getBidders(roundId);
      const pending: Address[] = [];
      for (const bidder of list) {
        const state = await reader.getBidState(roundId, bidder);
        if (!state.revealed) pending.push(bidder);
      }
      if (pending.length === 0 && list.length === 0) {
        throw new Error("No sealed bids on-chain. Commit before opening reveal.");
      }

      const drand = quicknet();
      let revealed = 0;
      for (let i = 0; i < pending.length; i++) {
        const bidder = pending[i]!;
        setRevealProgress({ current: i + 1, total: pending.length });
        let ciphertext: Uint8Array | null = null;
        try {
          const seal = await reader.getSeal(roundId, bidder);
          ciphertext = seal.ciphertext;
        } catch {
          /* fallback */
        }
        if (!ciphertext?.length && address === bidder && sealedCiphertext) {
          ciphertext = sealedCiphertext;
        }
        if (!ciphertext?.length) continue;

        const opened = await openBid(ciphertext, drand);
        const nonce = toHex(opened.nonce, { size: 32 });
        await client.reveal({
          roundId,
          bidder,
          value: opened.value,
          nonce,
        });
        revealed += 1;
      }
      setRevealProgress(null);

      if (revealed === 0) throw new Error("Could not decrypt any bids. Wait for Drand R or check seals.");

      setStatus("ok");
      push(`${revealed} bid(s) revealed. Values are public; settlement opens after reveal deadline.`);
      await refresh(roundId);
    } catch (e) {
      setRevealProgress(null);
      const msg = displayError(e);
      setStatus("error");
      push(msg);
    }
  }

  async function finalizeRound() {
    if (!client || roundId == null) return;
    setStatus("working");
    try {
      let round = await reader.getRound(roundId);
      if (round.status === "Revealing") {
        if (BigInt(Math.floor(Date.now() / 1000)) <= round.revealDeadline) {
          throw new Error("Reveal window is still open. Settlement begins after its deadline.");
        }
        const { hash } = await client.clear(roundId);
        push(`Round cleared — winner selected · tx ${hash.slice(0, 10)}…`);
        round = await reader.getRound(roundId);
      }
      if (round.status === "Cleared") {
        const settleHash = await client.settle(roundId);
        push(`Settled · tx ${(settleHash as Hash).slice(0, 10)}…`);
      } else if (round.status !== "Settled" && round.status !== "Voided") {
        throw new Error(`Round is ${round.status}; it cannot settle yet.`);
      }
      setStatus("ok");
      await refresh(roundId);
    } catch (e) {
      const msg = displayError(e);
      setStatus("error");
      push(msg);
    }
  }

  return {
    address,
    isConnected,
    wrongChain,
    walletStatus,
    bidAmount,
    setBidAmount,
    roundId,
    status,
    log,
    tokenBalance,
    live,
    bidders,
    bidStates,
    targetRound,
    drandGate,
    commitSecondsRemaining,
    revealSecondsRemaining,
    commitClosed,
    revealClosed,
    hasCommitted,
    revealedCount,
    revealProgress,
    canUseContract: Boolean(ROUND_ADDRESS && client),
    connect,
    switchNetwork,
    disconnect,
    mintDemoTokens,
    createRound,
    joinRound,
    commitBid,
    openAndReveal,
    finalizeRound,
    leaveRound: () => selectRound(null),
    refresh,
    formatCountdown,
  };
}
