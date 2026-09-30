import "server-only";
import type { Page } from "@/db";
import { checkIp } from "./proxycheck";
import { parseUa, type UaInfo } from "./ua";
import { clientCountry, clientIp } from "./visitor";

type HeaderLike = { get(name: string): string | null };

export type GuardResult =
  | { kind: "bot" }
  | { kind: "blocked"; reason: "country" | "vpn" }
  | { kind: "ok"; ua: UaInfo; country: string | null; isVpn: boolean | null };

/**
 * Same checks for the public page and for /r/<id>, so a blocked visitor
 * cannot skip the page and open the redirect directly.
 */
export async function guard(page: Pick<Page, "blockedCountries" | "blockVpn">, h: HeaderLike): Promise<GuardResult> {
  const ua = parseUa(h.get("user-agent"));
  if (ua.isBot) return { kind: "bot" };

  let country = clientCountry(h);
  const blocked = new Set(page.blockedCountries.map((c) => c.toUpperCase()));
  if (country && blocked.has(country)) return { kind: "blocked", reason: "country" };

  const ipc = await checkIp(clientIp(h));
  if (!country && ipc.country) {
    country = ipc.country;
    if (blocked.has(country)) return { kind: "blocked", reason: "country" };
  }
  if (page.blockVpn && ipc.isVpn === true) return { kind: "blocked", reason: "vpn" };

  return { kind: "ok", ua, country, isVpn: ipc.isVpn };
}
