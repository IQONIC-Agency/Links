import "server-only";
import { asc } from "drizzle-orm";
import Link from "next/link";
import { db, tenants } from "@/db";
import { isSuperadmin, type CurrentUser } from "@/lib/auth";

/** Members are pinned to their tenant; superadmins can filter with ?t=<id> (none = all). */
export function pickTenant(u: CurrentUser, t: string | undefined): number | null {
  if (!isSuperadmin(u)) return u.tenantId;
  const n = Number(t);
  return t && Number.isInteger(n) && n > 0 ? n : null;
}

export async function tenantNames(): Promise<Map<number, string>> {
  const rows = await db().select({ id: tenants.id, name: tenants.name }).from(tenants).orderBy(asc(tenants.name));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Superadmin-only filter row. `extra` keeps other query params (e.g. the stats range). */
export function TenantFilter({
  basePath,
  names,
  current,
  extra = "",
}: {
  basePath: string;
  names: Map<number, string>;
  current: number | null;
  extra?: string;
}) {
  const href = (t: number | null) => {
    const q = [t == null ? "" : `t=${t}`, extra].filter(Boolean).join("&");
    return q ? `${basePath}?${q}` : basePath;
  };
  return (
    <div className="adm-filter">
      <span className="muted">Kunde:</span>
      <Link className={`btn ${current == null ? "active" : ""}`} href={href(null)}>
        Alle
      </Link>
      {[...names.entries()].map(([id, name]) => (
        <Link key={id} className={`btn ${current === id ? "active" : ""}`} href={href(id)}>
          {name}
        </Link>
      ))}
    </div>
  );
}
