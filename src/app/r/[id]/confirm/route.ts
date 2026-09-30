import { headers } from "next/headers";
import { getButtonWithPage } from "@/lib/data";
import { logEvent } from "@/lib/events";
import { guard } from "@/lib/guard";
import { blockedResponse, neutralResponse } from "@/lib/html";

export const dynamic = "force-dynamic";

const AGE_COOKIE = "lh_age";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getButtonWithPage(id);
  if (!row || !row.page.live) return new Response("Not found", { status: 404 });

  const h = await headers();
  const result = await guard(row.page, h);
  if (result.kind === "bot") return neutralResponse();
  if (result.kind === "blocked") return blockedResponse();

  await logEvent("age_confirm", row.page.id, row.button.id, h);

  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return new Response(null, {
    status: 303,
    headers: {
      location: row.button.url,
      "cache-control": "no-store, max-age=0",
      "set-cookie": `${AGE_COOKIE}=1; Path=/; Max-Age=${THIRTY_DAYS}; HttpOnly; SameSite=Lax${secure}`,
    },
  });
}
