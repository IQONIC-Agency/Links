import Link from "next/link";
import { ctr, overview, parseRange, type Metrics, type PageRow } from "@/lib/stats";
import { n, pct, RangeFilter } from "./RangeFilter";

function Cells({ m }: { m: Metrics }) {
  return (
    <>
      <td className="num">{n(m.views)}</td>
      <td className="num">{n(m.u_views)}</td>
      <td className="num">{n(m.clicks)}</td>
      <td className="num">{n(m.u_clicks)}</td>
      <td className="num">{n(m.u_confirms)}</td>
      <td className="num">
        <strong>{pct(ctr(m))}</strong>
      </td>
    </>
  );
}

export default async function StatsOverview({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const range = parseRange(await searchParams);
  const { perPage, perModel, total } = await overview(range);

  const groups = new Map<string, PageRow[]>();
  for (const row of perPage) {
    const list = groups.get(row.model) ?? [];
    list.push(row);
    groups.set(row.model, list);
  }
  const qs = range.key === "custom" ? `?range=custom&from=${range.from}&to=${range.to}` : `?range=${range.key}`;

  return (
    <>
      <h1>Stats</h1>
      <RangeFilter basePath="/admin/stats" range={range} />
      <div className="adm-kpis">
        <div className="adm-kpi">
          <div className="v">{n(total.u_views)}</div>
          <div className="l">Besucher ({n(total.views)} Aufrufe)</div>
        </div>
        <div className="adm-kpi">
          <div className="v">{n(total.u_clicks)}</div>
          <div className="l">Klickende Besucher ({n(total.clicks)} Klicks)</div>
        </div>
        <div className="adm-kpi">
          <div className="v">{n(total.u_confirms)}</div>
          <div className="l">18+ bestätigt</div>
        </div>
        <div className="adm-kpi">
          <div className="v">{pct(ctr(total))}</div>
          <div className="l">CTR (pro Besucher)</div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Seite</th>
            <th>Notiz</th>
            <th className="num">Aufrufe</th>
            <th className="num">Besucher</th>
            <th className="num">Klicks</th>
            <th className="num">Klickende Besucher</th>
            <th className="num">18+ bestätigt</th>
            <th className="num">CTR</th>
          </tr>
        </thead>
        <tbody>
          {[...groups.entries()].map(([model, rows]) => (
            <GroupRows key={model} model={model} rows={rows} sum={perModel.get(model)!} qs={qs} />
          ))}
        </tbody>
      </table>
      <p className="muted">
        CTR = eindeutige Besucher mit Klick ÷ eindeutige Besucher mit Aufruf. Neuladen und Zurück-Button zählen dadurch nicht
        doppelt. Besucher über mehrere Seiten eines Models zählen in der Model-Zeile einmal.
      </p>
    </>
  );
}

function GroupRows({ model, rows, sum, qs }: { model: string; rows: PageRow[]; sum: Metrics; qs: string }) {
  return (
    <>
      <tr className="adm-group">
        <td colSpan={2}>{model || "(ohne Model)"}</td>
        <Cells m={sum} />
      </tr>
      {rows.map((r) => (
        <tr key={r.id}>
          <td>
            <Link href={`/admin/stats/${r.id}${qs}`}>
              {r.domain}/{r.slug}
            </Link>{" "}
            {r.live ? null : <span className="badge">offline</span>}
          </td>
          <td className="muted">{r.notes}</td>
          <Cells m={r} />
        </tr>
      ))}
    </>
  );
}
