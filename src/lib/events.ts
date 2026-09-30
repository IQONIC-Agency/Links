import "server-only";
import { db, events, type EventType } from "@/db";
import { checkIp } from "./proxycheck";
import { parseUa } from "./ua";
import { clientCountry, clientIp, visitorHash } from "./visitor";

type HeaderLike = { get(name: string): string | null };

/** Returns false (and writes nothing) for bots. */
export async function logEvent(
  type: EventType,
  pageId: number,
  buttonId: string | null,
  h: HeaderLike,
): Promise<boolean> {
  const uaString = h.get("user-agent") ?? "";
  const ua = parseUa(uaString);
  if (ua.isBot) return false;
  const ip = clientIp(h);
  const ipc = await checkIp(ip); // cache hit in practice: the page render already checked this IP
  await db().insert(events).values({
    pageId,
    buttonId,
    type,
    country: clientCountry(h) ?? ipc.country,
    device: ua.device,
    inApp: ua.inApp,
    inAppName: ua.inAppName,
    isVpn: ipc.isVpn,
    visitorHash: visitorHash(ip, uaString),
  });
  return true;
}
