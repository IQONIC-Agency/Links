import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PageView } from "@/components/PageView";
import { PageviewBeacon } from "@/components/PageviewBeacon";
import { BlockedView, NeutralView } from "@/components/SimpleViews";
import { getPageBySlug } from "@/lib/data";
import { guard } from "@/lib/guard";
import { normalizeHost } from "@/lib/host";
import { parseUa } from "@/lib/ua";

export const dynamic = "force-dynamic";

type Params = Promise<{ host: string; slug: string }>;

async function load(params: Params) {
  const { host, slug } = await params;
  const data = await getPageBySlug(normalizeHost(decodeURIComponent(host)), decodeURIComponent(slug));
  if (!data || !data.page.live) return null;
  return data;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  // Link previews get no title, image or description.
  const data = await load(params);
  if (!data || parseUa((await headers()).get("user-agent")).isBot) return { title: " " };
  return { title: data.page.config.title || " " };
}

export default async function SitePage({ params }: { params: Params }) {
  const data = await load(params);
  if (!data) notFound();
  const { page, buttons } = data;

  const result = await guard(page, await headers());
  if (result.kind === "bot") return <NeutralView />;
  if (result.kind === "blocked") return <BlockedView />;

  return (
    <>
      <PageView
        pageId={page.id}
        config={page.config}
        deeplinkEnabled={page.deeplinkEnabled}
        buttons={buttons.map((b) => ({ id: b.id, label: b.label, style: b.style, deeplink: b.deeplink }))}
      />
      <PageviewBeacon pageId={page.id} />
    </>
  );
}
