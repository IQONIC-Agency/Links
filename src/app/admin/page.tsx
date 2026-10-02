import { asc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { db, domains as domainsTable, pages } from "@/db";
import { isSuperadmin, requireUser } from "@/lib/auth";
import { pickTenant, tenantNames, TenantFilter } from "./tenants";
import { createPage, deletePage, duplicatePage, toggleFlag } from "./actions";

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ error?: string; t?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const tenant = pickTenant(user, sp.t);
  const list = await db()
    .select()
    .from(pages)
    .where(tenant == null ? undefined : eq(pages.tenantId, tenant))
    .orderBy(asc(pages.tenantId), asc(sql`lower(${pages.model})`), asc(pages.domain), asc(pages.slug));
  const domainRows = await db()
    .select({ domain: domainsTable.domain })
    .from(domainsTable)
    .where(tenant == null ? undefined : eq(domainsTable.tenantId, tenant))
    .orderBy(asc(domainsTable.domain));
  const domains = domainRows.map((d) => d.domain);
  const models = [...new Set(list.map((p) => p.model).filter(Boolean))];
  const names = isSuperadmin(user) ? await tenantNames() : null;
  const error = sp.error;

  return (
    <>
      <h1>Seiten</h1>
      {names ? <TenantFilter basePath="/admin" names={names} current={tenant} /> : null}
      {error ? <div className="adm-card" style={{ color: "#c22" }}>{error}</div> : null}
      {domains.length === 0 ? (
        <div className="adm-card">
          Noch keine Domain. Zuerst unter <Link href="/admin/domains">Domains</Link> eine Domain hinzufügen.
        </div>
      ) : null}

      <form action={createPage} className="adm-card row">
        <div className="field">
          <label>Domain</label>
          <select name="domain" required>
            {domains.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Slug</label>
          <input type="text" name="slug" required placeholder="anna" pattern="[a-zA-Z0-9][a-zA-Z0-9_\-]{0,63}" />
        </div>
        <div className="field">
          <label>Model</label>
          <input type="text" name="model" list="models" placeholder="Anna" />
        </div>
        <div className="field" style={{ flex: "0 0 auto" }}>
          <button className="primary" type="submit">Neue Seite</button>
        </div>
        <datalist id="models">{models.map((m) => <option key={m} value={m} />)}</datalist>
      </form>

      <table>
        <thead>
          <tr>
            {names ? <th>Kunde</th> : null}
            <th>Model</th>
            <th>Link</th>
            <th>Notiz</th>
            <th>Live</th>
            <th>Deeplink</th>
            <th>Duplizieren (neuer Slug)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id}>
              {names ? <td className="muted">{names.get(p.tenantId)}</td> : null}
              <td>{p.model || <span className="muted">–</span>}</td>
              <td>
                <a href={`https://${p.domain}/${p.slug}`} target="_blank" rel="noreferrer">
                  {p.domain}/{p.slug}
                </a>
              </td>
              <td className="muted" style={{ maxWidth: 240 }}>{p.notes}</td>
              <td>
                <form action={toggleFlag}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="flag" value="live" />
                  <button type="submit" className={`badge ${p.live ? "on" : ""}`}>{p.live ? "live" : "offline"}</button>
                </form>
              </td>
              <td>
                <form action={toggleFlag}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="flag" value="deeplink" />
                  <button type="submit" className={`badge ${p.deeplinkEnabled ? "on" : ""}`}>
                    {p.deeplinkEnabled ? "an" : "aus"}
                  </button>
                </form>
              </td>
              <td>
                <form action={duplicatePage} style={{ display: "flex", gap: 6 }}>
                  <input type="hidden" name="id" value={p.id} />
                  <select name="domain" defaultValue={p.domain} style={{ width: 150 }}>
                    {domains.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <input type="text" name="slug" required placeholder="neuer-slug" style={{ width: 120 }} />
                  <button type="submit">Kopieren</button>
                </form>
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                <Link className="btn" href={`/admin/pages/${p.id}`}>Bearbeiten</Link>{" "}
                <Link className="btn" href={`/admin/stats/${p.id}`}>Stats</Link>{" "}
                <form action={deletePage} style={{ display: "inline" }}>
                  <input type="hidden" name="id" value={p.id} />
                  <ConfirmSubmit className="danger" message={`${p.domain}/${p.slug} wirklich löschen?`}>Löschen</ConfirmSubmit>
                </form>
              </td>
            </tr>
          ))}
          {list.length === 0 ? (
            <tr>
              <td colSpan={names ? 8 : 7} className="muted">Noch keine Seiten.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </>
  );
}
