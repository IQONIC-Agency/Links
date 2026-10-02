"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, domains, pages, tenants } from "@/db";
import { domainForUser, isSuperadmin, requireUser } from "@/lib/auth";
import { normalizeHost } from "@/lib/host";
import { addDomain, domainStatus, removeDomain } from "@/lib/vercel";

function back(params: Record<string, string>): never {
  redirect(`/admin/domains?${new URLSearchParams(params).toString()}`);
}

function cleanDomain(raw: unknown): string | null {
  const d = normalizeHost(String(raw ?? "").replace(/^https?:\/\//i, "").split("/")[0]);
  // a.b at least, labels of a–z 0–9 -, no leading/trailing hyphen
  if (!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d)) return null;
  // Our own hosts are never a customer domain.
  if (d.endsWith(".vercel.app") || d === normalizeHost(process.env.ADMIN_HOST)) return null;
  return d;
}

export async function addDomainAction(form: FormData) {
  const u = await requireUser();
  const domain = cleanDomain(form.get("domain"));
  if (!domain) back({ error: "Ungültige Domain. Beispiel: meinedomain.com (ohne https:// und ohne /)" });

  let tenantId = u.tenantId;
  if (isSuperadmin(u)) {
    tenantId = Number(form.get("tenant"));
    const [t] = Number.isInteger(tenantId) ? await db().select().from(tenants).where(eq(tenants.id, tenantId)).limit(1) : [];
    if (!t) back({ error: "Bitte einen Kunden auswählen." });
  }
  if (tenantId == null) back({ error: "Kein Kundenkonto." });

  const inserted = await db().insert(domains).values({ domain, tenantId }).onConflictDoNothing().returning();
  if (!inserted.length) back({ error: `${domain} ist schon eingetragen.` });

  const res = await addDomain(domain);
  if (!res.ok) {
    await db().delete(domains).where(eq(domains.domain, domain));
    back({ error: `Vercel hat ${domain} abgelehnt: ${res.message}` });
  }
  revalidatePath("/admin/domains");
  back({ added: domain });
}

export async function checkDomainAction(form: FormData) {
  const u = await requireUser();
  const d = await domainForUser(u, String(form.get("domain") ?? ""));
  if (!d) back({ error: "Domain nicht gefunden." });
  let s = await domainStatus(d.domain, true);
  if (s.state === "missing") {
    // Removed in Vercel by hand (or never added): register it again.
    const res = await addDomain(d.domain);
    if (!res.ok) back({ error: `Vercel hat ${d.domain} abgelehnt: ${res.message}` });
    s = await domainStatus(d.domain, true);
  }
  if (s.state === "active") {
    await db().update(domains).set({ verifiedAt: new Date() }).where(eq(domains.domain, d.domain));
  }
  revalidatePath("/admin/domains");
  back(s.state === "active" ? { checked: d.domain } : { pending: d.domain });
}

export async function removeDomainAction(form: FormData) {
  const u = await requireUser();
  const d = await domainForUser(u, String(form.get("domain") ?? ""));
  if (!d) back({ error: "Domain nicht gefunden." });
  const [{ n }] = (await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(pages)
    .where(and(eq(pages.domain, d.domain)))) as [{ n: number }];
  if (n > 0) back({ error: `Auf ${d.domain} liegen noch ${n} Seite(n). Erst die Seiten löschen.` });

  const res = await removeDomain(d.domain);
  if (!res.ok) back({ error: `Vercel: ${res.message}` });
  await db().delete(domains).where(eq(domains.domain, d.domain));
  revalidatePath("/admin/domains");
  back({ removed: d.domain });
}
