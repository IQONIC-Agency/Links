import type { PageConfig } from "@/db/schema";
import { fontStack } from "./fonts";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const NO_STORE = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  "x-robots-tag": "noindex, nofollow",
};

function doc(body: string, cfg?: Partial<PageConfig>): string {
  const bg = cfg?.backgroundColor ?? "#111";
  const fg = cfg?.textColor ?? "#fff";
  const font = fontStack(cfg?.font);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title> </title><style>
html,body{margin:0;height:100%}body{display:flex;align-items:center;justify-content:center;background:${esc(bg)};color:${esc(fg)};font-family:${font};text-align:center;padding:24px;box-sizing:border-box}
.box{max-width:360px}h1{font-size:22px;margin:0 0 8px}p{opacity:.85;margin:0 0 24px;line-height:1.45}
button,a.btn{display:block;width:100%;padding:16px;border:0;border-radius:14px;font:inherit;font-weight:700;font-size:17px;cursor:pointer;text-decoration:none;box-sizing:border-box}
.yes{background:${esc(fg)};color:${esc(bg)}}.no{background:transparent;color:${esc(fg)};opacity:.7;margin-top:10px}
</style></head><body><div class="box">${body}</div></body></html>`;
}

export function neutralResponse(): Response {
  return new Response(doc("<p>👋</p>"), { status: 200, headers: NO_STORE });
}

export function blockedResponse(): Response {
  return new Response(
    doc("<p>This page is not available in your region.</p>"),
    { status: 403, headers: NO_STORE },
  );
}

export function ageGateResponse(buttonId: string, cfg: PageConfig): Response {
  const action = `/r/${encodeURIComponent(buttonId)}/confirm`;
  return new Response(
    doc(
      `<h1>18+</h1><p>The following content is for adults only. Please confirm that you are at least 18 years old.</p>
<form method="post" action="${action}" onsubmit="this.querySelector('button').disabled=true">
<button class="yes" type="submit">I am 18 or older</button></form>
<a class="btn no" href="javascript:history.back()">Go back</a>`,
      cfg,
    ),
    { status: 200, headers: NO_STORE },
  );
}
