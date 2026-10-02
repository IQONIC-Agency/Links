import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";

export type RangeKey = "today" | "yesterday" | "7d" | "30d" | "custom";
export type Range = { key: RangeKey; from?: string; to?: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseRange(sp: { range?: string; from?: string; to?: string }): Range {
  const key = (["today", "yesterday", "7d", "30d", "custom"] as const).find((k) => k === sp.range) ?? "7d";
  if (key === "custom") {
    if (sp.from && DATE_RE.test(sp.from) && sp.to && DATE_RE.test(sp.to)) {
      return sp.from <= sp.to ? { key, from: sp.from, to: sp.to } : { key, from: sp.to, to: sp.from };
    }
    return { key: "7d" };
  }
  return { key };
}

function tz(): string {
  const z = process.env.STATS_TIMEZONE || "Europe/Berlin";
  return /^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/.test(z) ? z : "Europe/Berlin";
}

/** Local midnight `daysAgo` days back, as timestamptz. */
function dayStart(daysAgo: number): SQL {
  return sql`((date_trunc('day', now() at time zone ${tz()}) - make_interval(days => ${daysAgo})) at time zone ${tz()})`;
}

/** WHERE fragment on e.created_at for the selected range (calendar days in STATS_TIMEZONE). */
export function rangeCond(r: Range): SQL {
  switch (r.key) {
    case "today":
      return sql`e.created_at >= ${dayStart(0)}`;
    case "yesterday":
      return sql`e.created_at >= ${dayStart(1)} and e.created_at < ${dayStart(0)}`;
    case "7d":
      return sql`e.created_at >= ${dayStart(6)}`;
    case "30d":
      return sql`e.created_at >= ${dayStart(29)}`;
    case "custom":
      return sql`e.created_at >= (${r.from}::date::timestamp at time zone ${tz()}) and e.created_at < ((${r.to}::date + 1)::timestamp at time zone ${tz()})`;
  }
}

/**
 * u_* are distinct visitors (visitor_hash). CTR uses them, not raw counts,
 * so reloads and back-button returns do not distort it.
 */
const METRICS = sql`
  count(*) filter (where e.type = 'pageview')::int as views,
  count(distinct e.visitor_hash) filter (where e.type = 'pageview')::int as u_views,
  count(*) filter (where e.type = 'click')::int as clicks,
  count(distinct e.visitor_hash) filter (where e.type = 'click')::int as u_clicks,
  count(*) filter (where e.type = 'age_confirm')::int as confirms,
  count(distinct e.visitor_hash) filter (where e.type = 'age_confirm')::int as u_confirms`;

export type Metrics = {
  views: number;
  u_views: number;
  clicks: number;
  u_clicks: number;
  confirms: number;
  u_confirms: number;
};

export function ctr(m: Pick<Metrics, "u_views" | "u_clicks">): number | null {
  return m.u_views > 0 ? m.u_clicks / m.u_views : null;
}

async function rows<T>(q: SQL): Promise<T[]> {
  const res = (await db().execute(q)) as unknown as { rows: T[] };
  return res.rows;
}

export type PageRow = Metrics & {
  id: number;
  tenant_id: number;
  domain: string;
  slug: string;
  model: string;
  crm_id: string;
  notes: string;
  live: boolean;
};

/** Key of a model group: the same model name in two tenants is two groups. */
export function modelKey(tenantId: number, model: string): string {
  return `${tenantId}:${model}`;
}

/** tenantId null = all tenants (superadmin / stats API). */
export async function overview(r: Range, tenantId: number | null = null) {
  const cond = rangeCond(r);
  const scope = tenantId == null ? sql`true` : sql`p.tenant_id = ${tenantId}`;
  const [perPage, perModel, total] = await Promise.all([
    rows<PageRow>(sql`
      select p.id, p.tenant_id, p.domain, p.slug, p.model, p.crm_id, p.notes, p.live, ${METRICS}
      from pages p left join events e on e.page_id = p.id and ${cond}
      where ${scope}
      group by p.id
      order by p.tenant_id, lower(p.model), p.domain, p.slug`),
    // Separate query: a visitor seen on two pages of one model counts once for the model.
    rows<Metrics & { tenant_id: number; model: string }>(sql`
      select p.tenant_id, p.model, ${METRICS}
      from pages p left join events e on e.page_id = p.id and ${cond}
      where ${scope}
      group by p.tenant_id, p.model`),
    // Events of deleted pages only show up in the all-tenants total.
    tenantId == null
      ? rows<Metrics>(sql`select ${METRICS} from events e where ${cond}`)
      : rows<Metrics>(sql`select ${METRICS} from events e join pages p on p.id = e.page_id where ${scope} and ${cond}`),
  ]);
  return { perPage, perModel: new Map(perModel.map((m) => [modelKey(m.tenant_id, m.model), m])), total: total[0]! };
}

export type Breakdown = { key: string | null; u_views: number; u_clicks: number; u_confirms: number; views: number; clicks: number };

async function breakdown(pageId: number, cond: SQL, dim: SQL): Promise<Breakdown[]> {
  return rows<Breakdown>(sql`
    select ${dim} as key,
      count(*) filter (where e.type = 'pageview')::int as views,
      count(*) filter (where e.type = 'click')::int as clicks,
      count(distinct e.visitor_hash) filter (where e.type = 'pageview')::int as u_views,
      count(distinct e.visitor_hash) filter (where e.type = 'click')::int as u_clicks,
      count(distinct e.visitor_hash) filter (where e.type = 'age_confirm')::int as u_confirms
    from events e
    where e.page_id = ${pageId} and ${cond}
    group by 1
    order by u_views desc, u_clicks desc`);
}

export async function pageDetail(pageId: number, r: Range) {
  const cond = rangeCond(r);
  const [totals, countries, devices, inApp, vpn, daily, perButton] = await Promise.all([
    rows<Metrics>(sql`select ${METRICS} from events e where e.page_id = ${pageId} and ${cond}`),
    breakdown(pageId, cond, sql`coalesce(e.country, '??')`),
    breakdown(pageId, cond, sql`e.device`),
    breakdown(pageId, cond, sql`coalesce(e.in_app_name, 'browser')`),
    breakdown(pageId, cond, sql`case when e.is_vpn is null then 'unbekannt' when e.is_vpn then 'VPN/Proxy' else 'kein VPN' end`),
    rows<Metrics & { day: string }>(sql`
      select to_char(date_trunc('day', e.created_at at time zone ${tz()}), 'YYYY-MM-DD') as day, ${METRICS}
      from events e where e.page_id = ${pageId} and ${cond}
      group by 1 order by 1`),
    rows<{ button_id: string; label: string | null; clicks: number; u_clicks: number; u_confirms: number }>(sql`
      select e.button_id, b.label,
        count(*) filter (where e.type = 'click')::int as clicks,
        count(distinct e.visitor_hash) filter (where e.type = 'click')::int as u_clicks,
        count(distinct e.visitor_hash) filter (where e.type = 'age_confirm')::int as u_confirms
      from events e left join buttons b on b.id = e.button_id
      where e.page_id = ${pageId} and e.button_id is not null and ${cond}
      group by e.button_id, b.label
      order by u_clicks desc`),
  ]);
  return { totals: totals[0]!, countries, devices, inApp, vpn, daily, perButton };
}

export type CreatorRow = Metrics & { crm_id: string; tenant_ids: number[]; models: string[]; page_ids: number[] };

/**
 * Stats per CRM creator (pages.crm_id), across all tenants. A visitor seen on two pages
 * of one creator counts once. `crmId` limits it to one creator and adds the daily series.
 */
export async function creatorStats(r: Range, crmId?: string) {
  const cond = rangeCond(r);
  const only = crmId ? sql`p.crm_id = ${crmId}` : sql`p.crm_id <> ''`;
  const [creators, daily] = await Promise.all([
    rows<CreatorRow>(sql`
      select p.crm_id,
        array_agg(distinct p.tenant_id) as tenant_ids,
        array_agg(distinct p.model) as models,
        array_agg(distinct p.id) as page_ids,
        ${METRICS}
      from pages p left join events e on e.page_id = p.id and ${cond}
      where ${only}
      group by p.crm_id
      order by p.crm_id`),
    crmId
      ? rows<Metrics & { day: string }>(sql`
          select to_char(date_trunc('day', e.created_at at time zone ${tz()}), 'YYYY-MM-DD') as day, ${METRICS}
          from events e join pages p on p.id = e.page_id
          where ${only} and ${cond}
          group by 1 order by 1`)
      : Promise.resolve(null),
  ]);
  return { creators, daily };
}
