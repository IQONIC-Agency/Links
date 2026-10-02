"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, tenants, users, type Role } from "@/db";
import { hashPassword, MIN_PASSWORD, requireSuperadmin } from "@/lib/auth";

// Superadmin only: customers (tenants) and their logins.

function back(params: Record<string, string>): never {
  redirect(`/admin/accounts?${new URLSearchParams(params).toString()}`);
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export async function createTenantAction(form: FormData) {
  await requireSuperadmin();
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  if (!name) back({ error: "Name fehlt." });
  await db().insert(tenants).values({ name });
  revalidatePath("/admin", "layout");
  back({ ok: `Kunde „${name}“ angelegt.` });
}

export async function renameTenantAction(form: FormData) {
  await requireSuperadmin();
  const id = Number(form.get("id"));
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  if (!Number.isInteger(id) || !name) back({ error: "Name fehlt." });
  await db().update(tenants).set({ name }).where(eq(tenants.id, id));
  revalidatePath("/admin", "layout");
  back({ ok: "Gespeichert." });
}

export async function createUserAction(form: FormData) {
  await requireSuperadmin();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const password = String(form.get("password") ?? "");
  const target = String(form.get("tenant") ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back({ error: "Ungültige E-Mail." });
  if (password.length < MIN_PASSWORD) back({ error: `Passwort muss mindestens ${MIN_PASSWORD} Zeichen haben.` });
  if (email === (process.env.ADMIN_USER ?? "").toLowerCase()) back({ error: "Diese E-Mail ist der Haupt-Login." });

  let role: Role = "member";
  let tenantId: number | null = null;
  if (target === "superadmin") {
    role = "superadmin";
  } else {
    tenantId = Number(target);
    const [t] = Number.isInteger(tenantId) ? await db().select().from(tenants).where(eq(tenants.id, tenantId)).limit(1) : [];
    if (!t) back({ error: "Bitte einen Kunden auswählen." });
  }

  try {
    await db().insert(users).values({ email, name, role, tenantId, passwordHash: await hashPassword(password) });
  } catch (err) {
    back({ error: isUniqueViolation(err) ? `${email} gibt es schon.` : (err as Error).message });
  }
  back({ ok: `Login für ${email} angelegt. Passwort sicher weitergeben (nicht per Instagram-DM).` });
}

export async function resetPasswordAction(form: FormData) {
  await requireSuperadmin();
  const id = Number(form.get("id"));
  const password = String(form.get("password") ?? "");
  if (!Number.isInteger(id)) back({ error: "Login nicht gefunden." });
  if (password.length < MIN_PASSWORD) back({ error: `Passwort muss mindestens ${MIN_PASSWORD} Zeichen haben.` });
  // New password also ends every existing session of that user.
  await db()
    .update(users)
    .set({ passwordHash: await hashPassword(password), sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, id));
  back({ ok: "Passwort geändert, alle Geräte dieses Logins sind abgemeldet." });
}

export async function toggleUserAction(form: FormData) {
  const me = await requireSuperadmin();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) back({ error: "Login nicht gefunden." });
  if (me.id === id) back({ error: "Du kannst dich nicht selbst sperren." });
  await db()
    .update(users)
    .set({ disabled: sql`not ${users.disabled}`, sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, id));
  back({ ok: "Gespeichert." });
}
