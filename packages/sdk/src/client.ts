import {
  createPublicClient,
  createWalletClient,
  encodePacked,
  fromHex,
  http,
  keccak256,
  toHex,
  type Address,
  type Chain,
  type Hash,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { SealedBid } from "@tacet/tlock";

import tacetRoundAbi from "./abi/TacetRound.json" with { type: "json" };

export const ROUND_STATUS = ["Open", "Revealing", "Cleared", "Settled", "Voided"] as const;
export const CLEARING_RULE = ["HighestBid", "LowestBid"] as const;

export type RoundStatus = (typeof ROUND_STATUS)[number];
export type ClearingRule = (typeof CLEARING_RULE)[number];

export interface TacetClientConfig {
  rpcUrl: string;
  chain: Chain;
  roundAddress: Address;
  tokenAddress?: Address;
  /** Local/script signing via private key. */
  account?: Hex;
  /** Browser wallet from wagmi / injected provider. */
  walletClient?: WalletClient;
  publicClient?: PublicClient;
}

export interface CreateRoundParams {
  itemRef: Hex;
  revealRound: bigint;
  clearingRule?: ClearingRule;
  commitDeadline: bigint;
  revealDeadline: bigint;
}

export interface CommitParams {
  roundId: bigint;
  sealed: SealedBid;
  escrow: bigint;
}

export interface RevealParams {
  roundId: bigint;
  bidder: Address;
  value: bigint;
  nonce: Hex;
}

export class TacetClient {
  readonly public: PublicClient;
  readonly wallet?: WalletClient;
  readonly roundAddress: Address;
  readonly account?: import("viem").Account;

  constructor(private readonly config: TacetClientConfig) {
    this.roundAddress = config.roundAddress;
    this.public =
      config.publicClient ??
      createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
    if (config.walletClient) {
      this.wallet = config.walletClient;
      this.account = config.walletClient.account ?? undefined;
    } else if (config.account) {
      this.account = privateKeyToAccount(config.account);
      this.wallet = createWalletClient({
        account: this.account,
        chain: config.chain,
        transport: http(config.rpcUrl),
      });
    }
  }

  async getRound(roundId: bigint) {
    const r = (await this.public.readContract({
      address: this.roundAddress,
      abi: tacetRoundAbi,
      functionName: "getRound",
      args: [roundId],
    })) as readonly [
      Address,
      Hex,
      bigint,
      number,
      bigint,
      bigint,
      number,
      Address,
      bigint,
    ];
    return {
      operator: r[0],
      itemRef: r[1],
      revealRound: r[2],
      clearingRule: CLEARING_RULE[Number(r[3])] as ClearingRule,
      commitDeadline: r[4],
      revealDeadline: r[5],
      status: ROUND_STATUS[Number(r[6])] as RoundStatus,
      winner: r[7],
      winningBid: r[8],
    };
  }

  async getBidders(roundId: bigint) {
    return (await this.public.readContract({
      address: this.roundAddress,
      abi: tacetRoundAbi,
      functionName: "getBidders",
      args: [roundId],
    })) as Address[];
  }

  async getBidState(roundId: bigint, bidder: Address) {
    const s = (await this.public.readContract({
      address: this.roundAddress,
      abi: tacetRoundAbi,
      functionName: "getBidState",
      args: [roundId, bidder],
    })) as readonly [Hex, bigint, bigint, boolean, boolean, boolean];
    return {
      commitment: s[0],
      escrow: s[1],
      revealedValue: s[2],
      revealed: s[3],
      valid: s[4],
      settled: s[5],
    };
  }

  async getSeal(roundId: bigint, bidder: Address) {
    const [ciphertext, auditorBlob] = (await this.public.readContract({
      address: this.roundAddress,
      abi: tacetRoundAbi,
      functionName: "getSeal",
      args: [roundId, bidder],
    })) as readonly [Hex, Hex];
    return {
      ciphertext: fromHex(ciphertext, "bytes"),
      auditorBlob: fromHex(auditorBlob, "bytes"),
    };
  }

  private requireWallet() {
    if (!this.wallet) throw new Error("wallet client required");
    const account = this.wallet.account ?? this.account;
    if (!account) throw new Error("wallet account required");
    return { wallet: this.wallet, account };
  }

  private async bufferedFees() {
    const [block, estimate] = await Promise.all([
      this.public.getBlock({ blockTag: "latest" }),
      this.public.estimateFeesPerGas({ chain: this.config.chain, type: "eip1559" }),
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

  async createRound(params: CreateRoundParams): Promise<{ roundId: bigint; hash: Hash }> {
    const { wallet, account } = this.requireWallet();
    const fees = await this.bufferedFees();
    const rule = params.clearingRule === "LowestBid" ? 1 : 0;
    const hash = await wallet.writeContract({
      address: this.roundAddress,
      abi: tacetRoundAbi,
      functionName: "createRound",
      args: [
        params.itemRef,
        params.revealRound,
        rule,
        params.commitDeadline,
        params.revealDeadline,
      ],
      account,
      chain: this.config.chain,
      ...fees,
    });
    await this.public.waitForTransactionReceipt({ hash });
    const next = (await this.public.readContract({
      address: this.roundAddress,
      abi: tacetRoundAbi,
      functionName: "nextRoundId",
    })) as bigint;
    return { roundId: next - 1n, hash };
  }

  async commit(params: CommitParams): Promise<Hash> {
    const { wallet, account } = this.requireWallet();
    const fees = await this.bufferedFees();
    const hash = await wallet.writeContract({
      address: this.roundAddress,
      abi: tacetRoundAbi,
      functionName: "commit",
      args: [
        params.roundId,
        params.sealed.commitmentHex,
        toHex(params.sealed.ciphertext),
        params.sealed.auditorBlob.length ? toHex(params.sealed.auditorBlob) : "0x",
        params.escrow,
      ],
      account,
      chain: this.config.chain,
      ...fees,
    });
    await this.public.waitForTransactionReceipt({ hash });
    return hash;
  }

  async openReveal(roundId: bigint): Promise<Hash> {
    const { wallet, account } = this.requireWallet();
    const fees = await this.bufferedFees();
    const hash = await wallet.writeContract({
      address: this.roundAddress,
      abi: tacetRoundAbi,
      functionName: "openReveal",
      args: [roundId],
      account,
      chain: this.config.chain,
      ...fees,
    });
    await this.public.waitForTransactionReceipt({ hash });
    return hash;
  }

  async reveal(params: RevealParams): Promise<Hash> {
    const { wallet, account } = this.requireWallet();
    const fees = await this.bufferedFees();
    const hash = await wallet.writeContract({
      address: this.roundAddress,
      abi: tacetRoundAbi,
      functionName: "reveal",
      args: [params.roundId, params.bidder, params.value, params.nonce],
      account,
      chain: this.config.chain,
      ...fees,
    });
    await this.public.waitForTransactionReceipt({ hash });
    return hash;
  }

  async clear(roundId: bigint): Promise<{ winner?: Address; winningBid: bigint; hash: Hash }> {
    const { wallet, account } = this.requireWallet();
    const fees = await this.bufferedFees();
    const hash = await wallet.writeContract({
      address: this.roundAddress,
      abi: tacetRoundAbi,
      functionName: "clear",
      args: [roundId],
      account,
      chain: this.config.chain,
      ...fees,
    });
    await this.public.waitForTransactionReceipt({ hash });
    const round = await this.getRound(roundId);
    return {
      winner: round.winner === "0x0000000000000000000000000000000000000000" ? undefined : round.winner,
      winningBid: round.winningBid,
      hash,
    };
  }

  async settle(roundId: bigint): Promise<Hash> {
    const { wallet, account } = this.requireWallet();
    const fees = await this.bufferedFees();
    const hash = await wallet.writeContract({
      address: this.roundAddress,
      abi: tacetRoundAbi,
      functionName: "settle",
      args: [roundId],
      account,
      chain: this.config.chain,
      ...fees,
    });
    await this.public.waitForTransactionReceipt({ hash });
    return hash;
  }

  async voidRound(roundId: bigint): Promise<Hash> {
    const { wallet, account } = this.requireWallet();
    const fees = await this.bufferedFees();
    const hash = await wallet.writeContract({
      address: this.roundAddress,
      abi: tacetRoundAbi,
      functionName: "voidRound",
      args: [roundId],
      account,
      chain: this.config.chain,
      ...fees,
    });
    await this.public.waitForTransactionReceipt({ hash });
    return hash;
  }
}

export function itemRefFromString(ref: string): Hex {
  return keccak256(encodePacked(["string"], [ref]));
}

export { tacetRoundAbi };
