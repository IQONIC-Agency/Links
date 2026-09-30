import Link from "next/link";
import type { Range } from "@/lib/stats";

const LABELS = [
  ["today", "Heute"],
  ["yesterday", "Gestern"],
  ["7d", "7 Tage"],
  ["30d", "30 Tage"],
] as const;

export function RangeFilter({ basePath, range }: { basePath: string; range: Range }) {
  return (
    <div className="adm-filter">
      {LABELS.map(([key, label]) => (
        <Link key={key} className={`btn ${range.key === key ? "active" : ""}`} href={`${basePath}?range=${key}`}>
          {label}
        </Link>
      ))}
      <form method="get" action={basePath} style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input type="hidden" name="range" value="custom" />
        <input type="date" name="from" defaultValue={range.from} required style={{ width: 150 }} />
        <span className="muted">bis</span>
        <input type="date" name="to" defaultValue={range.to} required style={{ width: 150 }} />
        <button type="submit" className={range.key === "custom" ? "primary" : ""}>
          Custom
        </button>
      </form>
    </div>
  );
}

export function pct(v: number | null): string {
  return v === null ? "–" : `${(v * 100).toFixed(1)} %`;
}

export function n(v: number): string {
  return v.toLocaleString("de-DE");
}
