import { arbitrumSepolia } from "viem/chains";

export const LOGO_SRC = "/tacet.png";

export const RPC_URL =
  import.meta.env.VITE_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc";

export const CHAIN =
  Number(import.meta.env.VITE_CHAIN_ID ?? arbitrumSepolia.id) === arbitrumSepolia.id
    ? arbitrumSepolia
    : arbitrumSepolia;

export const ROUND_ADDRESS = (import.meta.env.VITE_ROUND_ADDRESS ??
  "0x7359840f416951C27d7B0c1f84AE88091939dfdB") as `0x${string}`;

export const TOKEN_ADDRESS = (import.meta.env.VITE_TOKEN_ADDRESS ??
  "0xbAF3F929E3D11866ddD672E96bB669427cFA6726") as `0x${string}`;

export const TOKEN_DECIMALS = 6;
export const TOKEN_LABEL = "TACET";

export const LIVE_COMMIT_CLOSE_BEFORE_REVEAL_SECONDS = 30;
export const LIVE_REVEAL_WINDOW_AFTER_REVEAL_SECONDS = 600;

export const COMMIT_DURATION_PRESETS = [
  { seconds: 60, label: "1 min", helper: "solo demo" },
  { seconds: 120, label: "2 min", helper: "paired demo" },
  { seconds: 300, label: "5 min", helper: "public test" },
  { seconds: 600, label: "10 min", helper: "hackathon" },
] as const;

export const DEFAULT_COMMIT_DURATION_SECONDS = 120;

export function toTokenUnits(amount: number): bigint {
  return BigInt(Math.max(1, Math.round(amount * 10 ** TOKEN_DECIMALS)));
}

export function formatTokenAmount(units: bigint): string {
  return `${(Number(units) / 10 ** TOKEN_DECIMALS).toFixed(2)} ${TOKEN_LABEL}`;
}

export function displayError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("CommitDeadlinePassed") || message.includes("Commit deadline")) {
    return "Commit window closed. Create a fresh round and seal before the deadline.";
  }
  if (message.includes("RevealNotOpen") || message.includes("Reveal not open")) {
    return "Reveal gate not open yet. Wait for commit deadline + Drand R.";
  }
  if (message.includes("User rejected")) {
    return "Transaction rejected in wallet.";
  }
  if (message.includes("Connector already connected")) {
    return "Wallet is already connected.";
  }
  if (message.includes("Buffer is not defined")) {
    return "Encryption runtime was stale. Restart the Tacet web dev server and retry.";
  }
  if (message.includes("insufficient funds")) {
    return "Insufficient ETH for gas on Arbitrum Sepolia.";
  }
  if (
    message.includes("max fee per gas less than block base fee") ||
    message.includes("FeeCapTooLow")
  ) {
    return "Arbitrum base fee moved before submission. Retry the action; Tacet will use a fresh buffered fee.";
  }
  return message.length > 180 ? `${message.slice(0, 180)}…` : message;
}

export function arbiscanTx(hash: string): string {
  return `https://sepolia.arbiscan.io/tx/${hash}`;
}

export function arbiscanAddress(addr: string): string {
  return `https://sepolia.arbiscan.io/address/${addr}`;
}
