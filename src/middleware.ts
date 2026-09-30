import { NextResponse, type NextRequest } from "next/server";
import { normalizeHost, RESERVED_SLUGS } from "@/lib/host";

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function adminAuthorized(req: NextRequest): boolean {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;
  if (!user || !pass) return false;
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  let decoded = "";
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  return safeEqual(decoded.slice(0, i), user) && safeEqual(decoded.slice(i + 1), pass);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = normalizeHost(req.headers.get("host"));

  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/")) {
    const adminHost = normalizeHost(process.env.ADMIN_HOST);
    if (adminHost && host !== adminHost) return new NextResponse("Not found", { status: 404 });
    if (!adminAuthorized(req)) {
      return new NextResponse("Authentication required", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="admin", charset="UTF-8"' },
      });
    }
    return NextResponse.next();
  }

  // Internal route, only reachable through the rewrite below.
  if (pathname === "/site" || pathname.startsWith("/site/")) {
    return new NextResponse("Not found", { status: 404 });
  }

  // domain.com/<slug>  ->  /site/<domain>/<slug>
  const m = /^\/([^/]+)\/?$/.exec(pathname);
  if (m && !RESERVED_SLUGS.has(m[1]!.toLowerCase()) && !m[1]!.includes(".")) {
    const url = req.nextUrl.clone();
    url.pathname = `/site/${encodeURIComponent(host)}/${encodeURIComponent(m[1]!.toLowerCase())}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
