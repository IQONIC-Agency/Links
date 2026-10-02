import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, users } from "@/db";
import { hashPassword, logout, MIN_PASSWORD, requireUser, verifyUserPassword } from "@/lib/auth";

async function changePassword(form: FormData) {
  "use server";
  const u = await requireUser();
  if (u.id === "env") redirect("/admin/account?error=" + encodeURIComponent("Der Haupt-Login wird in Vercel geändert."));
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (!(await verifyUserPassword(u.id, current))) redirect("/admin/account?error=" + encodeURIComponent("Aktuelles Passwort falsch."));
  if (next.length < MIN_PASSWORD) redirect("/admin/account?error=" + encodeURIComponent(`Mindestens ${MIN_PASSWORD} Zeichen.`));
  await db()
    .update(users)
    .set({ passwordHash: await hashPassword(next), sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, u.id));
  await logout();
  redirect("/admin/login");
}

async function logoutEverywhere() {
  "use server";
  const u = await requireUser();
  if (u.id !== "env") {
    await db().update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, u.id));
  }
  await logout();
  redirect("/admin/login");
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const u = await requireUser();
  return (
    <>
      <h1>Mein Login</h1>
      {error ? <div className="adm-card" style={{ color: "#c22" }}>{error}</div> : null}
      <div className="adm-card">
        Angemeldet als <strong>{u.email}</strong>
      </div>
      {u.id === "env" ? (
        <div className="adm-card muted">
          Das ist der Haupt-Login. Passwort ändern: in Vercel die Variable ADMIN_PASSWORD ändern und neu deployen. Danach sind
          alle Geräte mit dem alten Passwort abgemeldet.
        </div>
      ) : (
        <form action={changePassword} className="adm-card" style={{ maxWidth: 420 }}>
          <h2 style={{ marginTop: 0 }}>Passwort ändern</h2>
          <div className="field">
            <label>Aktuelles Passwort</label>
            <input type="password" name="current" required autoComplete="current-password" />
          </div>
          <div className="field">
            <label>Neues Passwort (min. {MIN_PASSWORD} Zeichen)</label>
            <input type="password" name="next" required minLength={MIN_PASSWORD} autoComplete="new-password" />
          </div>
          <button className="primary" type="submit">
            Ändern
          </button>
        </form>
      )}
      <form action={logoutEverywhere} className="adm-card">
        <button type="submit">Auf allen Geräten abmelden</button>
      </form>
    </>
  );
}
