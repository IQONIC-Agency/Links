import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser, isSuperadmin } from "@/lib/auth";
import { logoutAction } from "./login/actions";
import { tenantNames } from "./tenants";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // Login page (and expired sessions): no navigation.
  if (!user) {
    return (
      <div className="adm">
        <div className="adm-main">{children}</div>
      </div>
    );
  }
  const customer = user.tenantId != null ? (await tenantNames()).get(user.tenantId) : null;
  return (
    <div className="adm">
      <header className="adm-top">
        <strong>link-hub</strong>
        <Link href="/admin">Seiten</Link>
        <Link href="/admin/stats">Stats</Link>
        <Link href="/admin/domains">Domains</Link>
        {isSuperadmin(user) ? <Link href="/admin/accounts">Kunden &amp; Logins</Link> : null}
        <span style={{ flex: 1 }} />
        <Link href="/admin/account" className="muted">
          {user.name || user.email}
          {customer ? ` · ${customer}` : isSuperadmin(user) ? " · Haupt-Admin" : ""}
        </Link>
        <form action={logoutAction}>
          <button type="submit">Abmelden</button>
        </form>
      </header>
      <div className="adm-main">{children}</div>
    </div>
  );
}
