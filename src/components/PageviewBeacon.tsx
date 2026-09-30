"use client";

import { useEffect } from "react";
import { beacon } from "./track";

declare global {
  interface Window {
    __lhPageviews?: Set<number>;
  }
}

/**
 * Logs exactly one pageview per page load. The window-level set guards
 * against React StrictMode double effects and re-mounts; a bfcache restore
 * (back button) does not re-run effects, so it is not counted again.
 */
export function PageviewBeacon({ pageId }: { pageId: number }) {
  useEffect(() => {
    const seen = (window.__lhPageviews ??= new Set());
    if (seen.has(pageId)) return;
    seen.add(pageId);
    beacon({ t: "pageview", p: pageId });
  }, [pageId]);
  return null;
}
