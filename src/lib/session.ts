// Signed admin session cookie. Edge-safe (WebCrypto only): the middleware
// checks signature + expiry, the server additionally checks the user row.

export const SESSION_COOKIE = "lh_admin";
export const SESSION_DAYS = 14;

/** "env" = the owner login from ADMIN_USER/ADMIN_PASSWORD, otherwise a users.id */
export type SessionClaims = { uid: string; ver: string; exp: number };

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function secret(): string {
  const s = process.env.AUTH_SECRET || process.env.VISITOR_SALT;
  if (!s) throw new Error("AUTH_SECRET or VISITOR_SALT must be set");
  return s;
}

async function hmac(data: string): Promise<string> {
  // Domain-separated so the visitor-hash salt is never used directly as a session key.
  const key = await crypto.subtle.importKey("raw", enc.encode(`admin-session:${secret()}`), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function signSession(uid: string, ver: string): Promise<{ value: string; maxAge: number }> {
  const maxAge = SESSION_DAYS * 24 * 3600;
  const exp = Math.floor(Date.now() / 1000) + maxAge;
  const payload = `${uid}.${ver}.${exp}`;
  return { value: `${payload}.${await hmac(payload)}`, maxAge };
}

export async function verifySession(value: string | undefined): Promise<SessionClaims | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [uid, ver, expRaw, sig] = parts as [string, string, string, string];
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return null;
  if (!safeEqual(await hmac(`${uid}.${ver}.${expRaw}`), sig)) return null;
  return { uid, ver, exp };
}

/** Session version of the env owner login: changes when ADMIN_PASSWORD changes. */
export async function envOwnerVersion(): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(`owner:${process.env.ADMIN_PASSWORD ?? ""}`));
  return b64url(d).slice(0, 12);
}
