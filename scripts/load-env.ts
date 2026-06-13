import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Load .env.local then .env into process.env (no dependency). */
export function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!value) continue;
      if (process.env[key] === undefined || process.env[key] === "") process.env[key] = value;
    }
  }
}

export function envKey(name: string, fallback?: string): string {
  const v = process.env[name]?.trim();
  if (v) return v;
  if (fallback) return fallback;
  throw new Error(`Missing ${name}`);
}

export function normalizePrivateKey(key: string): `0x${string}` {
  const clean = key.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error("invalid private key format (expected 64 hex chars)");
  }
  return `0x${clean}` as `0x${string}`;
}
