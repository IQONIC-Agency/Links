"use server";

import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  buttons,
  db,
  defaultButtonStyle,
  defaultPageConfig,
  pages,
  type ButtonStyle,
  type FontKey,
  type PageConfig,
} from "@/db";
import { domainForUser, pageForUser, requireUser, type CurrentUser } from "@/lib/auth";
import { FONTS } from "@/lib/fonts";
import { normalizeHost, RESERVED_SLUGS, SLUG_RE } from "@/lib/host";
import { randomId } from "@/lib/ids";

// Every action checks the logged-in user and its tenant itself. The middleware
// only proves that *some* valid session exists.

function cleanSlug(raw: unknown): string {
  const slug = String(raw ?? "").trim().toLowerCase().replace(/^\/+/, "");
  if (!SLUG_RE.test(slug) || RESERVED_SLUGS.has(slug)) {
    throw new Error("Slug: nur a–z, 0–9, - und _ (max. 64 Zeichen), keine reservierten Wörter wie admin/api/r.");
  }
  return slug;
}

function cleanDomain(raw: unknown): string {
  const domain = normalizeHost(String(raw ?? "").replace(/^https?:\/\//i, "").split("/")[0]);
  if (!/^[a-z0-9.-]+$/.test(domain) || domain.length > 253) throw new Error("Ungültige Domain.");
  return domain;
}

function cleanUrl(raw: unknown): string {
  const s = String(raw ?? "").trim();
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new Error(`Ungültige Ziel-URL: ${s || "(leer)"}`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`Nur http(s)-Links erlaubt: ${s}`);
  return u.toString();
}

function cleanColor(raw: unknown, fallback: string): string {
  const s = String(raw ?? "");
  return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : fallback;
}

function clampNum(raw: unknown, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function cleanImage(raw: unknown): string | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return undefined;
  if (s.startsWith("/uploads/") || /^https:\/\//.test(s)) return s;
  return undefined;
}

/** Domain must be registered and belong to a tenant the user can access. Returns the tenant. */
async function usableDomain(u: CurrentUser, domain: string): Promise<number> {
  const d = await domainForUser(u, domain);
  if (!d) throw new Error(`Die Domain ${domain} ist nicht in deinem Konto. Erst unter „Domains“ hinzufügen.`);
  return d.tenantId;
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

function back(path: string, error: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}`);
}

export async function createPage(form: FormData) {
  const u = await requireUser();
  let id: number;
  try {
    const domain = cleanDomain(form.get("domain"));
    const slug = cleanSlug(form.get("slug"));
    const model = String(form.get("model") ?? "").trim().slice(0, 80);
    const tenantId = await usableDomain(u, domain);
    const [row] = await db()
      .insert(pages)
      .values({ tenantId, domain, slug, model, config: defaultPageConfig })
      .returning({ id: pages.id });
    id = row!.id;
  } catch (err) {
    back("/admin", isUniqueViolation(err) ? "Diese Domain + Slug gibt es schon." : (err as Error).message);
  }
  redirect(`/admin/pages/${id}`);
}

/** Copies a page with all buttons (new random button ids). The copy starts offline. */
export async function duplicatePage(form: FormData) {
  const u = await requireUser();
  const sourceId = Number(form.get("id"));
  let newId: number;
  try {
    const src = await pageForUser(u, sourceId);
    if (!src) throw new Error("Seite nicht gefunden.");
    const slug = cleanSlug(form.get("slug"));
    const domainRaw = String(form.get("domain") ?? "").trim();
    const domain = domainRaw ? cleanDomain(domainRaw) : src.domain;
    const tenantId = await usableDomain(u, domain);
    const [row] = await db()
      .insert(pages)
      .values({
        tenantId,
        domain,
        slug,
        model: src.model,
        crmId: src.crmId,
        notes: src.notes,
        live: false,
        deeplinkEnabled: src.deeplinkEnabled,
        blockVpn: src.blockVpn,
        blockedCountries: src.blockedCountries,
        config: src.config,
      })
      .returning({ id: pages.id });
    newId = row!.id;
    const srcButtons = await db().select().from(buttons).where(eq(buttons.pageId, sourceId));
    if (srcButtons.length) {
      await db()
        .insert(buttons)
        .values(srcButtons.map((b) => ({ ...b, id: randomId(), pageId: newId })));
    }
  } catch (err) {
    back("/admin", isUniqueViolation(err) ? "Diese Domain + Slug gibt es schon." : (err as Error).message);
  }
  revalidatePath("/admin");
  redirect(`/admin/pages/${newId}`);
}

export async function toggleFlag(form: FormData) {
  const u = await requireUser();
  const id = Number(form.get("id"));
  const flag = String(form.get("flag"));
  const col = flag === "live" ? pages.live : flag === "deeplink" ? pages.deeplinkEnabled : null;
  if (!col || !(await pageForUser(u, id))) return;
  await db()
    .update(pages)
    .set({ [flag === "live" ? "live" : "deeplinkEnabled"]: sql`not ${col}`, updatedAt: new Date() })
    .where(eq(pages.id, id));
  revalidatePath("/admin");
}

export async function deletePage(form: FormData) {
  const u = await requireUser();
  const id = Number(form.get("id"));
  if (!(await pageForUser(u, id))) return;
  // Events are kept on purpose (history); they just no longer show up per page.
  await db().delete(pages).where(eq(pages.id, id));
  revalidatePath("/admin");
  redirect("/admin");
}

export type EditorButton = {
  id: string | null;
  label: string;
  url: string;
  ageGate: boolean;
  deeplink: boolean;
  style: ButtonStyle;
};

export type EditorPayload = {
  id: number;
  domain: string;
  slug: string;
  model: string;
  crmId: string;
  notes: string;
  live: boolean;
  deeplinkEnabled: boolean;
  blockVpn: boolean;
  blockedCountries: string[];
  config: PageConfig;
  buttons: EditorButton[];
};

export async function savePage(p: EditorPayload): Promise<{ ok: true; buttonIds: string[] } | { ok: false; error: string }> {
  const u = await requireUser();
  try {
    if (!(await pageForUser(u, Number(p.id)))) throw new Error("Seite nicht gefunden.");
    const domain = cleanDomain(p.domain);
    const slug = cleanSlug(p.slug);
    // Moving a page to another domain also moves it to that domain's tenant (superadmin only can cross tenants).
    const tenantId = await usableDomain(u, domain);
    const countries = [
      ...new Set(p.blockedCountries.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c))),
    ];
    const font = (Object.keys(FONTS) as FontKey[]).includes(p.config.font) ? p.config.font : "inter";
    const config: PageConfig = {
      title: String(p.config.title ?? "").slice(0, 120),
      subtitle: String(p.config.subtitle ?? "").slice(0, 500),
      avatarUrl: cleanImage(p.config.avatarUrl),
      backgroundImageUrl: cleanImage(p.config.backgroundImageUrl),
      backgroundColor: cleanColor(p.config.backgroundColor, defaultPageConfig.backgroundColor),
      backgroundOverlay: clampNum(p.config.backgroundOverlay, 0, 0.9, 0.3),
      textColor: cleanColor(p.config.textColor, defaultPageConfig.textColor),
      font,
    };
    const btns = p.buttons.map((b, i) => ({
      id: b.id && /^[a-z0-9]{6,32}$/.test(b.id) ? b.id : randomId(),
      pageId: p.id,
      position: i,
      label: String(b.label ?? "").trim().slice(0, 120) || "Link",
      url: cleanUrl(b.url),
      ageGate: Boolean(b.ageGate),
      deeplink: Boolean(b.deeplink),
      style: {
        bgColor: cleanColor(b.style.bgColor, defaultButtonStyle.bgColor),
        textColor: cleanColor(b.style.textColor, defaultButtonStyle.textColor),
        borderColor: cleanColor(b.style.borderColor, defaultButtonStyle.borderColor),
        borderWidth: clampNum(b.style.borderWidth, 0, 8, 0),
        radius: clampNum(b.style.radius, 0, 40, 14),
        imageUrl: cleanImage(b.style.imageUrl),
      } satisfies ButtonStyle,
    }));

    await db()
      .update(pages)
      .set({
        tenantId,
        domain,
        slug,
        model: String(p.model ?? "").trim().slice(0, 80),
        crmId: String(p.crmId ?? "").trim().slice(0, 100),
        notes: String(p.notes ?? "").slice(0, 2000),
        live: Boolean(p.live),
        deeplinkEnabled: Boolean(p.deeplinkEnabled),
        blockVpn: Boolean(p.blockVpn),
        blockedCountries: countries,
        config,
        updatedAt: new Date(),
      })
      .where(eq(pages.id, p.id));

    // Upsert by id so existing /r/<id> links and click history stay stable.
    const keep = btns.map((b) => b.id);
    await db()
      .delete(buttons)
      .where(keep.length ? and(eq(buttons.pageId, p.id), notInArray(buttons.id, keep)) : eq(buttons.pageId, p.id));
    if (btns.length) {
      // A button id must never move to another page.
      const foreign = await db()
        .select({ id: buttons.id })
        .from(buttons)
        .where(and(inArray(buttons.id, keep), sql`${buttons.pageId} <> ${p.id}`));
      if (foreign.length) throw new Error("Button-ID gehört zu einer anderen Seite. Bitte Seite neu laden.");
      for (const b of btns) {
        await db()
          .insert(buttons)
          .values(b)
          .onConflictDoUpdate({
            target: buttons.id,
            set: { position: b.position, label: b.label, url: b.url, ageGate: b.ageGate, deeplink: b.deeplink, style: b.style },
          });
      }
    }
    revalidatePath("/admin");
    return { ok: true, buttonIds: keep };
  } catch (err) {
    return { ok: false, error: isUniqueViolation(err) ? "Diese Domain + Slug gibt es schon." : (err as Error).message };
  }
}
