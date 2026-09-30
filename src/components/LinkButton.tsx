"use client";

import type { CSSProperties, MouseEvent } from "react";
import type { ButtonStyle } from "@/db/schema";
import { beacon, externalBrowserLink } from "./track";

export type PublicButton = { id: string; label: string; style: ButtonStyle; deeplink: boolean };

const FALLBACK_MS = 1500;

export function LinkButton({
  button,
  pageId,
  deeplinkEnabled,
  preview = false,
}: {
  button: PublicButton;
  pageId: number;
  deeplinkEnabled: boolean;
  preview?: boolean;
}) {
  const href = `/r/${button.id}`;

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (preview) {
      e.preventDefault();
      return;
    }
    // Log first, always, before anything can leave the page.
    beacon({ t: "click", p: pageId, b: button.id });

    if (!deeplinkEnabled || !button.deeplink) return; // normal navigation to /r/<id>
    const target = new URL(href, window.location.href).toString();
    const deeplink = externalBrowserLink(target);
    if (!deeplink) return;

    e.preventDefault();
    // If the app switch works, this page gets hidden and the fallback is dropped.
    // If nothing happens (user taps "Cancel"), continue inside the in-app browser.
    let left = false;
    const onHide = () => {
      if (document.visibilityState === "hidden") left = true;
    };
    const onPageHide = () => {
      left = true;
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    window.setTimeout(() => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      if (!left) window.location.href = target;
    }, FALLBACK_MS);
    window.location.href = deeplink;
  }

  const s = button.style;
  const style: CSSProperties = {
    background: s.bgColor,
    color: s.textColor,
    border: `${s.borderWidth}px solid ${s.borderColor}`,
    borderRadius: s.radius,
  };

  return (
    <a className="lh-btn" href={href} onClick={onClick} style={style} rel="nofollow noopener">
      {s.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="lh-btn-img" src={s.imageUrl} alt="" style={{ borderRadius: Math.max(0, s.radius - 4) }} />
      ) : null}
      <span className="lh-btn-label">{button.label}</span>
    </a>
  );
}
