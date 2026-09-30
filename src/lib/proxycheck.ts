import "server-only";
import { sql } from "drizzle-orm";
import { after } from "next/server";
import { db, ipChecks } from "@/db";
import { ipHash } from "./visitor";

export type IpCheck = {
  /** null = unknown (check disabled, timed out or failed) */
  isVpn: boolean | null;
  proxyType: string | null;
  country: string | null;
  source: "memory" | "db" | "api" | "skipped" | "error";
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MEMORY_MAX = 5000;

/** Tiny LRU: Map keeps insertion order, re-insert on hit moves an entry to the end. */
const memory = new Map<string, { value: IpCheck; at: number }>();

function memGet(key: string): IpCheck | null {
  const hit = memory.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    memory.delete(key);
    return null;
  }
  memory.delete(key);
  memory.set(key, hit);
  return { ...hit.value, source: "memory" };
}

function memSet(key: string, value: IpCheck) {
  memory.set(key, { value, at: Date.now() });
  if (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value!);
}

function log(event: string, data: Record<string, unknown>) {
  // One JSON line per event so Vercel log search / a drain can count failures
  // and decide whether to flip PROXYCHECK_DISABLED.
  console.log(JSON.stringify({ evt: event, svc: "proxycheck", ...data }));
}

function isPrivateIp(ip: string): boolean {
  return (
    ip === "0.0.0.0" ||
    ip === "::1" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith("fc") ||
    ip.startsWith("fd")
  );
}

/**
 * VPN/proxy lookup with memory LRU → Neon cache → proxycheck.io.
 * Never throws and never waits longer than PROXYCHECK_TIMEOUT_MS on the API:
 * on any failure the visitor is let through (isVpn = null).
 */
export async function checkIp(ip: string): Promise<IpCheck> {
  const skipped: IpCheck = { isVpn: null, proxyType: null, country: null, source: "skipped" };
  if (process.env.PROXYCHECK_DISABLED === "1" || !process.env.PROXYCHECK_API_KEY) return skipped;
  if (isPrivateIp(ip)) return skipped;

  const key = ipHash(ip);
  const mem = memGet(key);
  if (mem) return mem;

  try {
    // A slow DB (Neon cold start) must not stall the page either.
    const rows = await Promise.race([
      db()
        .select()
        .from(ipChecks)
        .where(sql`${ipChecks.ipHash} = ${key} and ${ipChecks.checkedAt} > now() - interval '24 hours'`)
        .limit(1),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("db cache timeout")), 500)),
    ]);
    const row = rows[0];
    if (row) {
      const value: IpCheck = {
        isVpn: row.isVpn,
        proxyType: row.proxyType,
        country: row.country,
        source: "db",
      };
      memSet(key, value);
      return value;
    }
  } catch (err) {
    log("cache_read_failed", { error: String(err) });
  }

  const timeoutMs = Number(process.env.PROXYCHECK_TIMEOUT_MS) || 800;
  const started = Date.now();
  try {
    const url = `https://proxycheck.io/v2/${encodeURIComponent(ip)}?key=${encodeURIComponent(
      process.env.PROXYCHECK_API_KEY,
    )}&vpn=1&asn=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as Record<string, unknown> & { status?: string; message?: string };
    const entry = body[ip] as { proxy?: string; type?: string; isocode?: string } | undefined;
    if (!entry || (body.status !== "ok" && body.status !== "warning")) {
      throw new Error(`bad response: ${body.status ?? "?"} ${body.message ?? ""}`.trim());
    }
    const value: IpCheck = {
      isVpn: entry.proxy === "yes",
      proxyType: entry.type ?? null,
      country: entry.isocode?.toUpperCase() ?? null,
      source: "api",
    };
    memSet(key, value);
    // Written after the response is sent so it never delays the visitor.
    after(() =>
      db()
      .insert(ipChecks)
      .values({ ipHash: key, isVpn: value.isVpn!, proxyType: value.proxyType, country: value.country })
      .onConflictDoUpdate({
        target: ipChecks.ipHash,
        set: { isVpn: value.isVpn!, proxyType: value.proxyType, country: value.country, checkedAt: new Date() },
      })
      .catch((err) => log("cache_write_failed", { error: String(err) })),
    );
    return value;
  } catch (err) {
    log("check_failed", {
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      ms: Date.now() - started,
      timeoutMs,
    });
    return { isVpn: null, proxyType: null, country: null, source: "error" };
  }
}
