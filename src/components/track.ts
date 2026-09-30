"use client";

type Payload = { t: "pageview" | "click"; p: number; b?: string };

/** sendBeacon survives the navigation that follows a click; fetch keepalive as fallback. */
export function beacon(payload: Payload) {
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon?.("/api/e", new Blob([body], { type: "text/plain" }))) return;
  } catch {
    /* fall through */
  }
  fetch("/api/e", { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(
    () => {},
  );
}

/**
 * Deeplink that makes Instagram/Threads open `target` in the system browser.
 * Returns null outside those in-app browsers (normal navigation then).
 */
export function externalBrowserLink(target: string, ua = navigator.userAgent): string | null {
  const ios = /iPhone|iPad|iPod/i.test(ua);
  const android = /Android/i.test(ua);
  const threads = /Barcelona/i.test(ua);
  const instagram = !threads && /Instagram/i.test(ua);
  const otherInApp = /FBAN|FBAV|FB_IAB|FB4A|musical_ly|BytedanceWebview|TikTok/i.test(ua);

  if (ios) {
    if (threads) return `barcelona://extbrowser/?url=${encodeURIComponent(target)}`;
    if (instagram) return `instagram://extbrowser/?url=${encodeURIComponent(target)}`;
    return null;
  }
  if (android && (threads || instagram || otherInApp)) {
    const u = new URL(target);
    return (
      `intent://${u.host}${u.pathname}${u.search}` +
      `#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(target)};end`
    );
  }
  return null;
}
