/** "WWW.Example.com:3000" -> "example.com" */
export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/^www\./, "");
}

export const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** Top-level paths that are never treated as a page slug. */
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "r",
  "site",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "uploads",
]);
