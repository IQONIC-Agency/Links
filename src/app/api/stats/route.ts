import { timingSafeEqual } from "node:crypto";
import { ctr, overview, pageDetail, parseRange } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const expected = process.env.STATS_API_KEY;
  if (!expected) return false; // API disabled
  const got = req.headers.get("x-api-key") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * GET /api/stats?range=today|yesterday|7d|30d|custom&from=YYYY-MM-DD&to=YYYY-MM-DD[&page=<id>]
 * Header: x-api-key: <STATS_API_KEY>
 */
export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const range = parseRange(sp);

  if (sp.page) {
    const id = Number(sp.page);
    if (!Number.isInteger(id)) return Response.json({ error: "bad page id" }, { status: 400 });
    const d = await pageDetail(id, range);
    return Response.json({ range, pageId: id, ...d, ctr: ctr(d.totals) });
  }

  const { perPage, perModel, total } = await overview(range);
  return Response.json({
    range,
    total: { ...total, ctr: ctr(total) },
    models: [...perModel.values()].map((m) => ({ ...m, ctr: ctr(m) })),
    pages: perPage.map((p) => ({ ...p, ctr: ctr(p) })),
  });
}
