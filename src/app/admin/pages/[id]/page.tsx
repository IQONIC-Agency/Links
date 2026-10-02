import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { buttons, db, domains, pages } from "@/db";
import { isSuperadmin, pageForUser, requireUser } from "@/lib/auth";
import { Editor } from "./Editor";

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const user = await requireUser();
  const page = await pageForUser(user, id);
  if (!page) notFound();
  const btns = await db().select().from(buttons).where(eq(buttons.pageId, id)).orderBy(asc(buttons.position));
  // Domains and models of this page's tenant only (a superadmin may also move it to any domain).
  const domainRows = await db()
    .select({ domain: domains.domain })
    .from(domains)
    .where(isSuperadmin(user) ? undefined : eq(domains.tenantId, page.tenantId))
    .orderBy(asc(domains.domain));
  const modelRows = await db().selectDistinct({ model: pages.model }).from(pages).where(eq(pages.tenantId, page.tenantId));

  return (
    <Editor
      initial={{
        id: page.id,
        domain: page.domain,
        slug: page.slug,
        model: page.model,
        notes: page.notes,
        live: page.live,
        deeplinkEnabled: page.deeplinkEnabled,
        blockVpn: page.blockVpn,
        blockedCountries: page.blockedCountries,
        config: page.config,
        buttons: btns.map((b) => ({ id: b.id, label: b.label, url: b.url, ageGate: b.ageGate, deeplink: b.deeplink, style: b.style })),
      }}
      domains={domainRows.map((d) => d.domain)}
      models={modelRows.map((m) => m.model).filter(Boolean)}
    />
  );
}
