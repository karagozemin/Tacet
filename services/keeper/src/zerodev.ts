import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
  type KernelAccountClient,
} from "@zerodev/sdk";
import { getEntryPoint, KERNEL_V3_3 } from "@zerodev/sdk/constants";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import {
  createPublicClient,
  encodeFunctionData,
  http,
  type Address,
  type Chain,
  type Hash,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { TacetClient, tacetRoundAbi, type CreateRoundParams, type RevealParams } from "@tacet/sdk";

export interface ZeroDevTacetClientConfig {
  rpcUrl: string;
  zeroDevRpc: string;
  chain: Chain;
  roundAddress: Address;
  ownerKey: Hex;
}

export interface SponsoredTransaction {
  userOpHash: Hash;
  transactionHash: Hash;
}

export class ZeroDevTacetClient {
  readonly reader: TacetClient;
  readonly accountAddress: Address;

  private constructor(
    readonly kernel: KernelAccountClient,
    config: ZeroDevTacetClientConfig,
    accountAddress: Address,
  ) {
    this.reader = new TacetClient({
      rpcUrl: config.rpcUrl,
      chain: config.chain,
      roundAddress: config.roundAddress,
    });
    this.accountAddress = accountAddress;
  }

  static async create(config: ZeroDevTacetClientConfig): Promise<ZeroDevTacetClient> {
    const publicClient = createPublicClient({
      chain: config.chain,
      transport: http(config.rpcUrl),
    });
    const signer = privateKeyToAccount(config.ownerKey);
    const entryPoint = getEntryPoint("0.7");
    const validator = await signerToEcdsaValidator(publicClient, {
      signer,
      entryPoint,
      kernelVersion: KERNEL_V3_3,
    });
    const account = await createKernelAccount(publicClient, {
      plugins: { sudo: validator },
      entryPoint,
      kernelVersion: KERNEL_V3_3,
    });
    const paymaster = createZeroDevPaymasterClient({
      chain: config.chain,
      transport: http(config.zeroDevRpc),
    });
    const kernel = createKernelAccountClient({
      account,
      chain: config.chain,
      bundlerTransport: http(config.zeroDevRpc),
      paymaster: {
        getPaymasterData: paymaster.getPaymasterData,
        getPaymasterStubData: paymaster.getPaymasterStubData,
      },
      client: publicClient,
    });

    return new ZeroDevTacetClient(kernel, config, account.address);
  }

  getRound(roundId: bigint) {
    return this.reader.getRound(roundId);
  }

  get public() {
    return this.reader.public;
  }

  getBidders(roundId: bigint) {
    return this.reader.getBidders(roundId);
  }

  getBidState(roundId: bigint, bidder: Address) {
    return this.reader.getBidState(roundId, bidder);
  }

  getSeal(roundId: bigint, bidder: Address) {
    return this.reader.getSeal(roundId, bidder);
  }

  async send(functionName: string, args: readonly unknown[]): Promise<SponsoredTransaction> {
    const callData = encodeFunctionData({
      abi: tacetRoundAbi,
      functionName,
      args,
    });
    const userOpHash = await this.kernel.sendUserOperation({
      callData: await this.kernel.account!.encodeCalls([
        { to: this.reader.roundAddress, value: 0n, data: callData },
      ]),
    });
    const receipt = await this.kernel.waitForUserOperationReceipt({ hash: userOpHash });
    if (!receipt.success || receipt.receipt.status !== "success") {
      throw new Error(receipt.reason ?? `ZeroDev UserOperation ${userOpHash} reverted`);
    }
    return { userOpHash, transactionHash: receipt.receipt.transactionHash };
  }

  async createRound(params: CreateRoundParams) {
    const rule = params.clearingRule === "LowestBid" ? 1 : 0;
    const result = await this.send("createRound", [
      params.itemRef,
      params.revealRound,
      rule,
      params.commitDeadline,
      params.revealDeadline,
    ]);
    const next = (await this.reader.public.readContract({
      address: this.reader.roundAddress,
      abi: tacetRoundAbi,
      functionName: "nextRoundId",
    })) as bigint;
    return { ...result, roundId: next - 1n };
  }

  async openReveal(roundId: bigint): Promise<Hash> {
    return (await this.send("openReveal", [roundId])).transactionHash;
  }

  async reveal(params: RevealParams): Promise<Hash> {
    return (await this.send("reveal", [
      params.roundId,
      params.bidder,
      params.value,
      params.nonce,
    ])).transactionHash;
  }

  async clear(roundId: bigint): Promise<{ winner?: Address; winningBid: bigint; hash: Hash }> {
    const { transactionHash } = await this.send("clear", [roundId]);
    const round = await this.getRound(roundId);
    return {
      winner:
        round.winner === "0x0000000000000000000000000000000000000000"
          ? undefined
          : round.winner,
      winningBid: round.winningBid,
      hash: transactionHash,
    };
  }

  async settle(roundId: bigint): Promise<Hash> {
    return (await this.send("settle", [roundId])).transactionHash;
  }
}
