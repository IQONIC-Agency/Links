import { asc, sql } from "drizzle-orm";
import { db, tenants, users } from "@/db";
import { MIN_PASSWORD, requireSuperadmin } from "@/lib/auth";
import { createTenantAction, createUserAction, renameTenantAction, resetPasswordAction, toggleUserAction } from "./actions";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  await requireSuperadmin();

  const tenantRows = await db()
    .select({
      id: tenants.id,
      name: tenants.name,
      // Raw column names: drizzle renders columns unqualified inside sql``.
      domains: sql<number>`(select count(*)::int from domains d where d.tenant_id = "tenants"."id")`,
      pages: sql<number>`(select count(*)::int from pages p where p.tenant_id = "tenants"."id")`,
    })
    .from(tenants)
    .orderBy(asc(tenants.name));
  const userRows = await db().select().from(users).orderBy(asc(users.email));
  const tenantName = new Map(tenantRows.map((t) => [t.id, t.name]));

  return (
    <>
      <h1>Kunden &amp; Logins</h1>
      {sp.error ? <div className="adm-card" style={{ color: "#c22" }}>{sp.error}</div> : null}
      {sp.ok ? <div className="adm-card">{sp.ok}</div> : null}

      <h2>Kunden</h2>
      <p className="muted">Jeder Kunde sieht nur seine eigenen Domains, Seiten und Stats. Du siehst als Haupt-Admin alles.</p>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th className="num">Domains</th>
            <th className="num">Seiten</th>
          </tr>
        </thead>
        <tbody>
          {tenantRows.map((t) => (
            <tr key={t.id}>
              <td>
                <form action={renameTenantAction} style={{ display: "flex", gap: 6 }}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="text" name="name" defaultValue={t.name} required style={{ maxWidth: 260 }} />
                  <button type="submit">Umbenennen</button>
                </form>
              </td>
              <td className="num">{t.domains}</td>
              <td className="num">{t.pages}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form action={createTenantAction} className="adm-card row" style={{ marginTop: 12 }}>
        <div className="field">
          <label>Neuer Kunde</label>
          <input type="text" name="name" required placeholder="z. B. Agentur Müller" />
        </div>
        <div className="field" style={{ flex: "0 0 auto" }}>
          <button className="primary" type="submit">
            Kunde anlegen
          </button>
        </div>
      </form>

      <h2>Logins</h2>
      <p className="muted">
        Dein Haupt-Login ({process.env.ADMIN_USER}) steht in Vercel unter ADMIN_USER / ADMIN_PASSWORD und taucht hier nicht auf.
      </p>
      <table>
        <thead>
          <tr>
            <th>E-Mail</th>
            <th>Name</th>
            <th>Kunde</th>
            <th>Letzter Login</th>
            <th>Neues Passwort</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {userRows.map((u) => (
            <tr key={u.id} style={u.disabled ? { opacity: 0.5 } : undefined}>
              <td>{u.email}</td>
              <td>{u.name}</td>
              <td>{u.role === "superadmin" ? <strong>Haupt-Admin</strong> : tenantName.get(u.tenantId!)}</td>
              <td className="muted">{u.lastLoginAt ? u.lastLoginAt.toLocaleString("de-DE") : "nie"}</td>
              <td>
                <form action={resetPasswordAction} style={{ display: "flex", gap: 6 }}>
                  <input type="hidden" name="id" value={u.id} />
                  <input type="text" name="password" minLength={MIN_PASSWORD} required placeholder="neues Passwort" autoComplete="off" style={{ width: 160 }} />
                  <button type="submit">Setzen</button>
                </form>
              </td>
              <td>
                <form action={toggleUserAction}>
                  <input type="hidden" name="id" value={u.id} />
                  <button type="submit" className={u.disabled ? "" : "danger"}>
                    {u.disabled ? "Entsperren" : "Sperren"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {userRows.length === 0 ? (
            <tr>
              <td colSpan={6} className="muted">
                Noch keine Logins.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <form action={createUserAction} className="adm-card row" style={{ marginTop: 12 }}>
        <div className="field">
          <label>E-Mail</label>
          <input type="text" name="email" required autoComplete="off" />
        </div>
        <div className="field">
          <label>Name</label>
          <input type="text" name="name" />
        </div>
        <div className="field">
          <label>Passwort (min. {MIN_PASSWORD} Zeichen)</label>
          <input type="text" name="password" minLength={MIN_PASSWORD} required autoComplete="off" />
        </div>
        <div className="field">
          <label>Gehört zu</label>
          <select name="tenant" required defaultValue="">
            <option value="" disabled>
              Kunde wählen
            </option>
            {tenantRows.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="superadmin">Haupt-Admin (sieht alles)</option>
          </select>
        </div>
        <div className="field" style={{ flex: "0 0 auto" }}>
          <button className="primary" type="submit">
            Login anlegen
          </button>
        </div>
      </form>
    </>
  );
}
