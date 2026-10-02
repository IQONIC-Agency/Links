import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type BinaryLike, type ScryptOptions } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, domains, loginFailures, pages, users, type Role } from "@/db";
import { envOwnerVersion, SESSION_COOKIE, signSession, verifySession } from "./session";

export type CurrentUser = {
  /** "env" for the owner login from ADMIN_USER/ADMIN_PASSWORD */
  id: number | "env";
  email: string;
  name: string;
  role: Role;
  tenantId: number | null;
};

// ---------- passwords ----------

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
export const MIN_PASSWORD = 10;

function scrypt(pw: BinaryLike, salt: BinaryLike, len: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(pw, salt, len, opts, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 32, SCRYPT);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

async function checkPassword(pw: string, stored: string): Promise<boolean> {
  const [algo, saltB64, keyB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const got = await scrypt(pw, Buffer.from(saltB64, "base64"), expected.length, SCRYPT);
  return timingSafeEqual(got, expected);
}

export async function verifyUserPassword(userId: number, pw: string): Promise<boolean> {
  const [u] = await db().select({ h: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  return Boolean(u) && (await checkPassword(pw, u!.h));
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---------- login ----------

const MAX_FAILURES = 10;
const FAILURE_WINDOW = sql`now() - interval '15 minutes'`;

/** Returns an error message, or null after setting the session cookie. */
export async function login(identifier: string, password: string, ipKey: string): Promise<string | null> {
  const ident = identifier.trim().toLowerCase();
  const keys = [`id:${ident}`, `ip:${ipKey}`];

  const [{ n }] = (await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(loginFailures)
    .where(and(inArray(loginFailures.key, keys), gte(loginFailures.createdAt, FAILURE_WINDOW)))) as [{ n: number }];
  if (n >= MAX_FAILURES) return "Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.";

  let session: { uid: string; ver: string } | null = null;

  const ownerUser = process.env.ADMIN_USER;
  const ownerPass = process.env.ADMIN_PASSWORD;
  if (ownerUser && ownerPass && sameString(ident, ownerUser.toLowerCase())) {
    if (sameString(password, ownerPass)) session = { uid: "env", ver: await envOwnerVersion() };
  } else {
    const [u] = await db().select().from(users).where(eq(users.email, ident)).limit(1);
    // Hash anyway when the user does not exist, so timing does not reveal valid emails.
    const ok = await checkPassword(password, u?.passwordHash ?? "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
    if (u && ok && !u.disabled) {
      session = { uid: String(u.id), ver: String(u.sessionVersion) };
      await db().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
    }
  }

  if (!session) {
    await db().insert(loginFailures).values(keys.map((key) => ({ key })));
    // Housekeeping: old rows are useless.
    await db().delete(loginFailures).where(sql`${loginFailures.createdAt} < now() - interval '1 day'`);
    return "E-Mail/Benutzername oder Passwort falsch.";
  }

  const { value, maxAge } = await signSession(session.uid, session.ver);
  (await cookies()).set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return null;
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
}

// ---------- current user ----------

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const claims = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  if (claims.uid === "env") {
    if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) return null;
    if (claims.ver !== (await envOwnerVersion())) return null;
    return { id: "env", email: process.env.ADMIN_USER, name: "Owner", role: "superadmin", tenantId: null };
  }
  const id = Number(claims.uid);
  if (!Number.isInteger(id)) return null;
  const [u] = await db().select().from(users).where(eq(users.id, id)).limit(1);
  if (!u || u.disabled || String(u.sessionVersion) !== claims.ver) return null;
  if (u.role !== "superadmin" && u.tenantId == null) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role, tenantId: u.role === "superadmin" ? null : u.tenantId };
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/admin/login");
  return u;
}

export async function requireSuperadmin(): Promise<CurrentUser> {
  const u = await requireUser();
  if (u.role !== "superadmin") redirect("/admin");
  return u;
}

export function isSuperadmin(u: CurrentUser): boolean {
  return u.role === "superadmin";
}

// ---------- access checks (every admin read/write goes through these) ----------

/** Tenant filter for list queries: null = everything (superadmin). */
export function tenantScope(u: CurrentUser): number | null {
  return isSuperadmin(u) ? null : u.tenantId;
}

export function canAccessTenant(u: CurrentUser, tenantId: number): boolean {
  return isSuperadmin(u) || u.tenantId === tenantId;
}

/** The page if this user may see/edit it, else null. */
export async function pageForUser(u: CurrentUser, pageId: number) {
  if (!Number.isInteger(pageId)) return null;
  const [p] = await db().select().from(pages).where(eq(pages.id, pageId)).limit(1);
  return p && canAccessTenant(u, p.tenantId) ? p : null;
}

/** The domain row if this user may put pages on it, else null. */
export async function domainForUser(u: CurrentUser, domain: string) {
  const [d] = await db().select().from(domains).where(eq(domains.domain, domain)).limit(1);
  return d && canAccessTenant(u, d.tenantId) ? d : null;
}
