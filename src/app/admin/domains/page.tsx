import { asc, eq, sql } from "drizzle-orm";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { db, domains } from "@/db";
import { isSuperadmin, requireUser } from "@/lib/auth";
import { domainStatus, vercelConfigured, type DomainStatus } from "@/lib/vercel";
import { pickTenant, tenantNames, TenantFilter } from "../tenants";
import { addDomainAction, checkDomainAction, removeDomainAction } from "./actions";

type SP = { t?: string; error?: string; added?: string; checked?: string; pending?: string; removed?: string };

function StatusBadge({ s }: { s: DomainStatus }) {
  switch (s.state) {
    case "active":
      return <span className="badge on">aktiv</span>;
    case "pending":
      return <span className="badge" style={{ background: "#fff3d6", color: "#8a5a00" }}>wartet auf DNS</span>;
    case "missing":
      return <span className="badge" style={{ background: "#fde2e2", color: "#c22" }}>fehlt in Vercel</span>;
    case "error":
      return <span className="badge" style={{ background: "#fde2e2", color: "#c22" }} title={s.message}>Fehler</span>;
    case "unconfigured":
      return <span className="badge">manuell</span>;
  }
}

export default async function DomainsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const tenant = pickTenant(user, sp.t);
  const names = isSuperadmin(user) ? await tenantNames() : null;

  const list = await db()
    .select({
      domain: domains.domain,
      tenantId: domains.tenantId,
      // Raw column names: drizzle renders columns unqualified inside sql``, which would compare pages.domain to itself.
      pageCount: sql<number>`(select count(*)::int from pages p where p.domain = "domains"."domain")`,
    })
    .from(domains)
    .where(tenant == null ? undefined : eq(domains.tenantId, tenant))
    .orderBy(asc(domains.domain));
  const statuses = await Promise.all(list.map((d) => domainStatus(d.domain)));
  // Remember the last time each domain was seen working.
  await Promise.all(
    list.map((d, i) =>
      statuses[i]!.state === "active"
        ? db().update(domains).set({ verifiedAt: new Date() }).where(eq(domains.domain, d.domain))
        : null,
    ),
  );

  return (
    <>
      <h1>Domains</h1>
      {names ? <TenantFilter basePath="/admin/domains" names={names} current={tenant} /> : null}
      {sp.error ? <div className="adm-card" style={{ color: "#c22" }}>{sp.error}</div> : null}
      {sp.added ? (
        <div className="adm-card">
          <strong>{sp.added}</strong> wurde hinzugefügt. Jetzt die DNS-Einträge unten bei deinem Domain-Anbieter setzen und danach
          auf „Prüfen“ klicken.
        </div>
      ) : null}
      {sp.checked ? <div className="adm-card"><strong>{sp.checked}</strong> ist aktiv.</div> : null}
      {sp.pending ? (
        <div className="adm-card">
          <strong>{sp.pending}</strong> ist noch nicht aktiv. DNS-Änderungen brauchen manchmal bis zu einer Stunde. Einträge prüfen
          und später erneut auf „Prüfen“ klicken.
        </div>
      ) : null}
      {sp.removed ? <div className="adm-card"><strong>{sp.removed}</strong> wurde entfernt.</div> : null}
      {!vercelConfigured() && names ? (
        <div className="adm-card" style={{ color: "#8a5a00" }}>
          Vercel-Anbindung fehlt (VERCEL_TOKEN / VERCEL_PROJECT_ID). Domains werden nur gespeichert und müssen von dir in Vercel
          eingetragen werden.
        </div>
      ) : null}

      <form action={addDomainAction} className="adm-card row">
        <div className="field">
          <label>Neue Domain (ohne https:// und ohne www.)</label>
          <input type="text" name="domain" required placeholder="meinedomain.com" />
        </div>
        {names ? (
          <div className="field">
            <label>Kunde</label>
            <select name="tenant" required defaultValue={tenant ?? ""}>
              <option value="" disabled>
                Kunde wählen
              </option>
              {[...names.entries()].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="field" style={{ flex: "0 0 auto" }}>
          <button className="primary" type="submit">
            Hinzufügen
          </button>
        </div>
      </form>

      <div className="adm-card">
        <strong>So verbindest du eine Domain:</strong> Domain oben hinzufügen. Dann beim Domain-Anbieter (z. B. Cloudflare → DNS →
        Records) genau die Einträge anlegen, die unten bei der Domain stehen. Bei Cloudflare den Proxy ausschalten (graue Wolke,
        „DNS only“), sonst funktionieren Länder-Erkennung und Besucherzählung nicht. Danach „Prüfen“ klicken.
      </div>

      <table>
        <thead>
          <tr>
            {names ? <th>Kunde</th> : null}
            <th>Domain</th>
            <th>Status</th>
            <th>DNS-Einträge</th>
            <th className="num">Seiten</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {list.map((d, i) => {
            const s = statuses[i]!;
            return (
              <tr key={d.domain}>
                {names ? <td className="muted">{names.get(d.tenantId)}</td> : null}
                <td>{d.domain}</td>
                <td>
                  <StatusBadge s={s} />
                  {s.state === "error" ? <div className="muted" style={{ fontSize: 12 }}>{s.message}</div> : null}
                </td>
                <td>
                  {s.state === "pending" ? (
                    <table style={{ fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th>Typ</th>
                          <th>Name</th>
                          <th>Wert</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.records.map((r) => (
                          <tr key={`${r.type}${r.name}${r.value}`}>
                            <td>{r.type}</td>
                            <td>
                              <code>{r.name}</code>
                            </td>
                            <td>
                              <code style={{ wordBreak: "break-all" }}>{r.value}</code>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : s.state === "unconfigured" ? (
                    <span className="muted">wird vom Admin in Vercel eingetragen</span>
                  ) : s.state === "missing" ? (
                    <span className="muted">„Prüfen“ klicken, dann wird sie neu eingetragen</span>
                  ) : (
                    <span className="muted">–</span>
                  )}
                </td>
                <td className="num">{d.pageCount}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {s.state !== "active" && s.state !== "unconfigured" ? (
                    <form action={checkDomainAction} style={{ display: "inline" }}>
                      <input type="hidden" name="domain" value={d.domain} />
                      <button type="submit">Prüfen</button>
                    </form>
                  ) : null}{" "}
                  {d.pageCount === 0 ? (
                    <form action={removeDomainAction} style={{ display: "inline" }}>
                      <input type="hidden" name="domain" value={d.domain} />
                      <ConfirmSubmit className="danger" message={`${d.domain} wirklich entfernen?`}>
                        Entfernen
                      </ConfirmSubmit>
                    </form>
                  ) : null}
                </td>
              </tr>
            );
          })}
          {list.length === 0 ? (
            <tr>
              <td colSpan={names ? 6 : 5} className="muted">
                Noch keine Domains.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </>
  );
}
