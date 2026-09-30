import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { buttons, db, pages } from "@/db";
import { Editor } from "./Editor";

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [page] = await db().select().from(pages).where(eq(pages.id, id)).limit(1);
  if (!page) notFound();
  const btns = await db().select().from(buttons).where(eq(buttons.pageId, id)).orderBy(asc(buttons.position));
  const all = await db().select({ domain: pages.domain, model: pages.model }).from(pages);

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
      domains={[...new Set(all.map((a) => a.domain))]}
      models={[...new Set(all.map((a) => a.model).filter(Boolean))]}
    />
  );
}
