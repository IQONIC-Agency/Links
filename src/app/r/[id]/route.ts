import { cookies, headers } from "next/headers";
import { getButtonWithPage } from "@/lib/data";
import { guard } from "@/lib/guard";
import { ageGateResponse, blockedResponse, neutralResponse } from "@/lib/html";

export const dynamic = "force-dynamic";

const AGE_COOKIE = "lh_age";

/**
 * Masked outbound link. The real URL only ever appears in this 302's Location
 * header, never in the page HTML. The click itself is logged by the button's
 * beacon before navigation, so nothing is logged here (no double counting
 * when a deeplink reopens this URL in the system browser).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getButtonWithPage(id);
  if (!row || !row.page.live) return new Response("Not found", { status: 404 });

  const result = await guard(row.page, await headers());
  if (result.kind === "bot") return neutralResponse();
  if (result.kind === "blocked") return blockedResponse();

  if (row.button.ageGate && (await cookies()).get(AGE_COOKIE)?.value !== "1") {
    return ageGateResponse(row.button.id, row.page.config);
  }
  return new Response(null, {
    status: 302,
    headers: { location: row.button.url, "cache-control": "no-store, max-age=0", "x-robots-tag": "noindex" },
  });
}
