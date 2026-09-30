import type { CSSProperties } from "react";
import type { PageConfig } from "@/db/schema";
import { fontStack } from "@/lib/fonts";
import { LinkButton, type PublicButton } from "./LinkButton";

export function PageView({
  pageId,
  config,
  buttons,
  deeplinkEnabled,
  preview = false,
}: {
  pageId: number;
  config: PageConfig;
  buttons: PublicButton[];
  deeplinkEnabled: boolean;
  preview?: boolean;
}) {
  const bg: CSSProperties = {
    backgroundColor: config.backgroundColor,
    backgroundImage: config.backgroundImageUrl
      ? `linear-gradient(rgba(0,0,0,${config.backgroundOverlay}), rgba(0,0,0,${config.backgroundOverlay})), url("${config.backgroundImageUrl}")`
      : undefined,
    color: config.textColor,
    fontFamily: fontStack(config.font),
  };

  return (
    <main className={preview ? "lh-page lh-preview" : "lh-page"} style={bg}>
      <div className="lh-inner">
        {config.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="lh-avatar" src={config.avatarUrl} alt="" />
        ) : null}
        {config.title ? <h1 className="lh-title">{config.title}</h1> : null}
        {config.subtitle ? <p className="lh-subtitle">{config.subtitle}</p> : null}
        <nav className="lh-buttons">
          {buttons.map((b) => (
            <LinkButton key={b.id} button={b} pageId={pageId} deeplinkEnabled={deeplinkEnabled} preview={preview} />
          ))}
        </nav>
      </div>
    </main>
  );
}
