import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm">
      <header className="adm-top">
        <strong>link-hub</strong>
        <Link href="/admin">Seiten</Link>
        <Link href="/admin/stats">Stats</Link>
      </header>
      <div className="adm-main">{children}</div>
    </div>
  );
}
