import "server-only";
import { createHmac } from "node:crypto";

type HeaderLike = { get(name: string): string | null };

export function clientIp(h: HeaderLike): string {
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return "0.0.0.0";
}

/** ISO country from Vercel's edge geo header, upper case, or null. */
export function clientCountry(h: HeaderLike): string | null {
  const c = h.get("x-vercel-ip-country");
  return c && /^[A-Za-z]{2}$/.test(c) ? c.toUpperCase() : null;
}

function salt(): string {
  const s = process.env.VISITOR_SALT;
  if (!s) {
    if (process.env.NODE_ENV === "production") throw new Error("VISITOR_SALT is not set");
    return "dev-salt";
  }
  return s;
}

/**
 * Anonymous visitor id. A plain SHA-256 of IP+UA can be reversed by brute
 * forcing the IPv4 space, so it is keyed with a server-side secret.
 */
export function visitorHash(ip: string, ua: string): string {
  return createHmac("sha256", salt()).update(`${ip}|${ua}`).digest("hex");
}

export function ipHash(ip: string): string {
  return createHmac("sha256", salt()).update(`ip|${ip}`).digest("hex");
}
