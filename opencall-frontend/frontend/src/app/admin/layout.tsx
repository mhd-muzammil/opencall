"use client";

import Link from "next/link";
import iconImg from "../icon.png";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { clearSession, readSession, type ClientSession } from "../../lib/session";

interface NavItem {
  href: string;
  label: string;
  roles: ("SUPER_ADMIN" | "REGION_ADMIN")[];
}

const ALL_NAV: NavItem[] = [
  { href: "/admin/monitoring", label: "Monitoring", roles: ["SUPER_ADMIN"] },
  { href: "/admin/rca", label: "RCA tracker", roles: ["SUPER_ADMIN", "REGION_ADMIN"] },
  { href: "/admin/activity", label: "Activity feed", roles: ["SUPER_ADMIN", "REGION_ADMIN"] },
  { href: "/admin/users", label: "Users", roles: ["SUPER_ADMIN"] },
  { href: "/admin/special-access", label: "Special Access", roles: ["SUPER_ADMIN"] },
  { href: "/admin/engineers", label: "Engineers", roles: ["SUPER_ADMIN", "REGION_ADMIN"] },
  { href: "/admin/rtpl-statuses", label: "RTPL statuses", roles: ["SUPER_ADMIN"] },
  { href: "/admin/record-format", label: "Record Format", roles: ["SUPER_ADMIN", "REGION_ADMIN"] },
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
    if (s.user.role !== "SUPER_ADMIN" && s.user.role !== "REGION_ADMIN") {
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

  if (!session || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "REGION_ADMIN")) {
    return null;
  }

  const visibleNav = ALL_NAV.filter((item) =>
    item.roles.some((role) => role === session.user.role),
  );

  function logout() {
    clearSession();
    router.replace("/");
  }

  return (
    <div className="adminShell">
      <aside className="adminSidebar">
        <div className="adminBrand">
          <div className="brandMark" aria-hidden="true">
            <img
              src={iconImg.src}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "inherit" }}
            />
          </div>
          <div>
            <p className="eyebrow">Open Call</p>
            <h1>Admin Console</h1>
          </div>
        </div>
        <nav className="adminNav" aria-label="Admin navigation">
          {visibleNav.map((item) => {
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
