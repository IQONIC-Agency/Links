import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { cache } from "react";
import { buttons, db, pages } from "@/db";

/** cache(): generateMetadata and the page share one lookup per request. */
export const getPageBySlug = cache(async (domain: string, slug: string) => {
  const [page] = await db()
    .select()
    .from(pages)
    .where(and(eq(pages.domain, domain), eq(pages.slug, slug)))
    .limit(1);
  if (!page) return null;
  const btns = await db()
    .select()
    .from(buttons)
    .where(eq(buttons.pageId, page.id))
    .orderBy(asc(buttons.position));
  return { page, buttons: btns };
});

export async function getButtonWithPage(buttonId: string) {
  const rows = await db()
    .select({ button: buttons, page: pages })
    .from(buttons)
    .innerJoin(pages, eq(pages.id, buttons.pageId))
    .where(eq(buttons.id, buttonId))
    .limit(1);
  return rows[0] ?? null;
}
