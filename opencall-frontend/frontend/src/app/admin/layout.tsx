"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { clearSession, readSession, type ClientSession } from "../../lib/session";

interface NavItem {
  href: string;
  label: string;
}

const NAV: NavItem[] = [
  { href: "/admin/users", label: "Users" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<ClientSession | null>(null);
  const [isLoaded, setLoaded] = useState(false);

  useEffect(() => {
    const s = readSession();
    setSession(s);
    setLoaded(true);

    if (!s) {
      router.replace("/");
      return;
    }
    if (s.user.role !== "SUPER_ADMIN") {
      // REGION_ADMIN doesn't get an admin shell — back to operational app.
      router.replace("/");
    }
  }, [router]);

  if (!isLoaded) {
    return (
      <div className="adminShell">
        <p className="muted" style={{ padding: 32 }}>
          Loading admin console…
        </p>
      </div>
    );
  }

  if (!session || session.user.role !== "SUPER_ADMIN") {
    return null;
  }

  function logout() {
    clearSession();
    router.replace("/");
  }

  return (
    <div className="adminShell">
      <aside className="adminSidebar">
        <div className="adminBrand">
          <div className="brandMark" aria-hidden="true">
            OC
          </div>
          <div>
            <p className="eyebrow">Open Call</p>
            <h1>Admin Console</h1>
          </div>
        </div>
        <nav className="adminNav" aria-label="Admin navigation">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "adminNavLink active" : "adminNavLink"}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="adminSidebarFooter">
          <Link href="/" className="adminNavLink">
            ← Operational app
          </Link>
          <Link href="/me/password" className="adminNavLink">
            Change password
          </Link>
          <button type="button" className="adminNavLink danger" onClick={logout}>
            Log out
          </button>
        </div>
      </aside>
      <main className="adminMain">{children}</main>
    </div>
  );
}
