import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, pages } from "@/db";
import { ctr, pageDetail, parseRange, type Breakdown } from "@/lib/stats";
import { n, pct, RangeFilter } from "../RangeFilter";

function BreakdownTable({ title, rows, labels }: { title: string; rows: Breakdown[]; labels?: Record<string, string> }) {
  const totalViews = rows.reduce((s, r) => s + r.u_views, 0);
  const max = Math.max(1, ...rows.map((r) => r.u_views));
  return (
    <div className="adm-card">
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <table>
        <thead>
          <tr>
            <th></th>
            <th className="num">Besucher</th>
            <th className="num">Anteil</th>
            <th className="num">Klickende</th>
            <th className="num">CTR</th>
            <th style={{ width: "20%" }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key ?? "null"}>
              <td>{(r.key && labels?.[r.key]) ?? r.key}</td>
              <td className="num">{n(r.u_views)}</td>
              <td className="num">{pct(totalViews ? r.u_views / totalViews : null)}</td>
              <td className="num">{n(r.u_clicks)}</td>
              <td className="num">{pct(ctr(r))}</td>
              <td>
                <div className="adm-bar" style={{ width: `${(r.u_views / max) * 100}%` }} />
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="muted">Keine Daten</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

const DEVICE_LABELS = { ios: "iOS", android: "Android", desktop: "Desktop", other: "Sonstige" };
const APP_LABELS = { instagram: "Instagram", threads: "Threads", facebook: "Facebook", tiktok: "TikTok", browser: "Kein In-App (Browser)" };

export default async function StatsDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [page] = await db().select().from(pages).where(eq(pages.id, id)).limit(1);
  if (!page) notFound();
  const range = parseRange(await searchParams);
  const d = await pageDetail(id, range);
  const t = d.totals;
  const maxDay = Math.max(1, ...d.daily.map((x) => x.u_views));
  const inAppShare = d.inApp.reduce((s, r) => s + (r.key === "browser" ? 0 : r.u_views), 0);

  const steps = [
    { label: "Aufrufe", u: t.u_views, raw: t.views },
    { label: "OF-Klicks", u: t.u_clicks, raw: t.clicks },
    { label: "18+ bestätigt", u: t.u_confirms, raw: t.confirms },
  ];

  return (
    <>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <h1 style={{ flex: 1 }}>
          {page.domain}/{page.slug} <span className="muted">{page.model}</span>
        </h1>
        <Link className="btn" href={`/admin/pages/${id}`}>
          Bearbeiten
        </Link>
      </div>
      {page.notes ? <p className="muted">{page.notes}</p> : null}
      <RangeFilter basePath={`/admin/stats/${id}`} range={range} />

      <div className="adm-card">
        <h2 style={{ marginTop: 0 }}>Funnel (eindeutige Besucher)</h2>
        <table>
          <tbody>
            {steps.map((s, i) => (
              <tr key={s.label}>
                <td style={{ width: 140 }}>{s.label}</td>
                <td className="num" style={{ width: 90 }}>
                  <strong>{n(s.u)}</strong>
                </td>
                <td className="num muted" style={{ width: 110 }}>
                  {n(s.raw)} gesamt
                </td>
                <td className="num" style={{ width: 90 }}>
                  {i === 0 ? "" : pct(steps[i - 1]!.u ? s.u / steps[i - 1]!.u : null)}
                </td>
                <td>
                  <div className="adm-bar" style={{ width: `${t.u_views ? (s.u / t.u_views) * 100 : 0}%` }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ marginBottom: 0 }}>
          CTR pro Besucher: <strong>{pct(ctr(t))}</strong> · In-App-Anteil: {pct(t.u_views ? inAppShare / t.u_views : null)}
        </p>
      </div>

      <div className="adm-card">
        <h2 style={{ marginTop: 0 }}>Verlauf pro Tag</h2>
        <table>
          <thead>
            <tr>
              <th>Tag</th>
              <th className="num">Besucher</th>
              <th className="num">Klickende</th>
              <th className="num">18+</th>
              <th className="num">CTR</th>
              <th style={{ width: "40%" }}></th>
            </tr>
          </thead>
          <tbody>
            {d.daily.map((x) => (
              <tr key={x.day}>
                <td>{x.day}</td>
                <td className="num">{n(x.u_views)}</td>
                <td className="num">{n(x.u_clicks)}</td>
                <td className="num">{n(x.u_confirms)}</td>
                <td className="num">{pct(ctr(x))}</td>
                <td>
                  <div className="adm-bar" style={{ width: `${(x.u_views / maxDay) * 100}%` }} />
                </td>
              </tr>
            ))}
            {d.daily.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">Keine Daten</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="adm-grid2">
        <BreakdownTable title="Länder" rows={d.countries} labels={{ "??": "Unbekannt" }} />
        <BreakdownTable title="Geräte" rows={d.devices} labels={DEVICE_LABELS} />
        <BreakdownTable title="In-App-Browser" rows={d.inApp} labels={APP_LABELS} />
        <BreakdownTable title="VPN / Proxy" rows={d.vpn} />
      </div>

      <div className="adm-card">
        <h2 style={{ marginTop: 0 }}>Klicks pro Button</h2>
        <table>
          <thead>
            <tr>
              <th>Button</th>
              <th className="num">Klicks</th>
              <th className="num">Klickende</th>
              <th className="num">18+ bestätigt</th>
            </tr>
          </thead>
          <tbody>
            {d.perButton.map((b) => (
              <tr key={b.button_id}>
                <td>{b.label ?? <span className="muted">gelöscht ({b.button_id})</span>}</td>
                <td className="num">{n(b.clicks)}</td>
                <td className="num">{n(b.u_clicks)}</td>
                <td className="num">{n(b.u_confirms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
