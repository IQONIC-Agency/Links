import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { buttons, db } from "@/db";
import { logEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

/** Beacon endpoint for pageviews and clicks. Always answers 204 so the client never retries. */
export async function POST(req: Request) {
  let body: { t?: unknown; p?: unknown; b?: unknown };
  try {
    body = JSON.parse(await req.text());
  } catch {
    return new Response(null, { status: 204 });
  }
  const pageId = Number(body.p);
  if (!Number.isInteger(pageId) || pageId <= 0) return new Response(null, { status: 204 });

  try {
    if (body.t === "pageview") {
      await logEvent("pageview", pageId, null, await headers());
    } else if (body.t === "click" && typeof body.b === "string" && body.b.length <= 32) {
      // Only accept clicks for a button that really belongs to that page.
      const [btn] = await db().select({ pageId: buttons.pageId }).from(buttons).where(eq(buttons.id, body.b)).limit(1);
      if (btn?.pageId === pageId) await logEvent("click", pageId, body.b, await headers());
    }
  } catch (err) {
    console.log(JSON.stringify({ evt: "event_log_failed", error: String(err) }));
  }
  return new Response(null, { status: 204 });
}
