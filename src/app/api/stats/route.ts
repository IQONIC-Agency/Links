import { timingSafeEqual } from "node:crypto";
import { asc } from "drizzle-orm";
import { db, tenants } from "@/db";
import { creatorStats, ctr, overview, pageDetail, parseRange } from "@/lib/stats";

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
 * GET /api/stats?range=today|yesterday|7d|30d|custom&from=YYYY-MM-DD&to=YYYY-MM-DD[&page=<id>|&crm_id=<id>]
 * Header: x-api-key: <STATS_API_KEY>
 * Covers all tenants (the owner's CRM matches creators by crm_id).
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

  if (sp.crm_id) {
    const crmId = sp.crm_id.slice(0, 100);
    const { creators, daily } = await creatorStats(range, crmId);
    const c = creators[0];
    return Response.json({
      range,
      crm_id: crmId,
      creator: c ? { ...c, ctr: ctr(c) } : null,
      daily: (daily ?? []).map((d) => ({ ...d, ctr: ctr(d) })),
    });
  }

  const [{ perPage, perModel, total }, { creators }, tenantRows] = await Promise.all([
    overview(range),
    creatorStats(range),
    db().select({ id: tenants.id, name: tenants.name }).from(tenants).orderBy(asc(tenants.id)),
  ]);
  return Response.json({
    range,
    total: { ...total, ctr: ctr(total) },
    tenants: tenantRows,
    creators: creators.map((c) => ({ ...c, ctr: ctr(c) })),
    models: [...perModel.values()].map((m) => ({ ...m, ctr: ctr(m) })),
    pages: perPage.map((p) => ({ ...p, ctr: ctr(p) })),
  });
}
