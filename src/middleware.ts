import { NextResponse, type NextRequest } from "next/server";
import { normalizeHost, RESERVED_SLUGS } from "@/lib/host";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = normalizeHost(req.headers.get("host"));

  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/")) {
    const adminHost = normalizeHost(process.env.ADMIN_HOST);
    if (adminHost && host !== adminHost) return new NextResponse("Not found", { status: 404 });
    if (pathname === "/admin/login") return NextResponse.next();
    // Signature + expiry only; the server also checks the user row (disabled, password changed).
    if (!(await verifySession(req.cookies.get(SESSION_COOKIE)?.value))) {
      if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = "";
      return NextResponse.redirect(url);
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
