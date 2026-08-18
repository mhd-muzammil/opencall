"use client";

import Link from "next/link";
import { AppBar } from "../AppBar";
import { canSeeMobileSection, isSuperAdminSession, useMobileSession } from "../session";

/**
 * Everything that does not fit in the bottom tab bar, plus account actions.
 *
 * Sections that already have a mobile screen link inside /m. The rest open the full
 * desktop workspace — it is the same app in the same WebView, so nothing is lost; those
 * screens simply have not been mobile-optimised yet.
 */
interface Item {
  href: string;
  label: string;
  icon: string;
  hint?: string;
  /** Operational section key from USER_SECTIONS — gates visibility exactly like the web. */
  section?: string;
  superAdminOnly?: boolean;
  /**
   * Sections the desktop shows to a SUPER_ADMIN always, and to a special-access login
   * only when that section is granted. Region admins never see them.
   */
  superAdminOrSection?: string;
  /**
   * Roles allowed to open an Admin Console page, copied from that console's own nav so the
   * app can never offer a page the web would refuse.
   */
  adminRoles?: readonly ("SUPER_ADMIN" | "REGION_ADMIN")[];
  group: string;
}

const ITEMS: Item[] = [
  // Dashboards — every one of these has a native mobile screen.
  { href: "/m/overview", label: "Overview", icon: "📊", section: "overview", group: "Dashboards" },
  { href: "/m/rtpl", label: "RTPL Dashboard", icon: "📈", section: "rtpl-dashboard", group: "Dashboards" },
  { href: "/m/rtpl-hours", label: "RTPL Hours Status", icon: "⏱️", section: "rtpl", group: "Dashboards" },
  { href: "/m/sla", label: "SLA TaT", icon: "🎯", section: "sla-tat", group: "Dashboards" },
  { href: "/m/pivot", label: "RTPL Pivot", icon: "🧮", section: "pivot", group: "Dashboards" },
  { href: "/m/tn", label: "TN View Status", icon: "🗺️", section: "tn-view-status", group: "Dashboards" },
  { href: "/m/flex", label: "Flex Dashboard", icon: "⚡", section: "flex", group: "Dashboards" },
  { href: "/m/flex-eod-bod", label: "Flex EOD & BOD", icon: "🌗", section: "flex-eod-bod", group: "Dashboards" },
  { href: "/m/productivity", label: "Engineer Productivity", icon: "🏅", section: "productivity", group: "Dashboards" },

  // Data & operations
  { href: "/m/records", label: "Records Table", icon: "📋", section: "records", group: "Data & Operations" },
  { href: "/m/closed", label: "Closed Calls", icon: "📁", section: "closed-calls", group: "Data & Operations" },
  { href: "/m/warranty", label: "Warranty Lookup", icon: "🛡️", section: "warranty", group: "Data & Operations" },
  { href: "/m/parts", label: "Parts Catalog", icon: "🔩", superAdminOrSection: "parts-catalog", group: "Data & Operations" },
  { href: "/m/quotations", label: "Quotations", icon: "📄", superAdminOrSection: "quotations", group: "Data & Operations" },
  { href: "/m/emails", label: "Customer Emails", icon: "✉️", section: "customer-emails", group: "Data & Operations" },
  { href: "/m/renewal", label: "Renewal Pipeline", icon: "🔄", section: "renewal-pipeline", group: "Data & Operations" },
  { href: "/m/record-format", label: "Record Format", icon: "🧾", section: "record-format", group: "Data & Operations" },

  // Admin
  { href: "/m/engineers", label: "Engineers", icon: "👷", group: "Admin" },
  { href: "/m/vendor", label: "Vendor Dashboard", icon: "🤝", superAdminOnly: true, group: "Admin" },
  { href: "/m/rtpl-statuses", label: "RTPL Statuses", icon: "🏷️", superAdminOnly: true, group: "Admin" },

  // Admin Console — the desktop pages, opened in the same WebView. Roles mirror
  // src/app/admin/layout.tsx exactly.
  { href: "/admin/users", label: "Users", icon: "👤", adminRoles: ["SUPER_ADMIN"], group: "Admin console" },
  { href: "/admin/special-access", label: "Special Access", icon: "🔐", adminRoles: ["SUPER_ADMIN"], group: "Admin console" },
  { href: "/admin/monitoring", label: "Monitoring", icon: "📡", adminRoles: ["SUPER_ADMIN"], group: "Admin console" },
  { href: "/admin/rca", label: "RCA Tracker", icon: "🔎", adminRoles: ["SUPER_ADMIN", "REGION_ADMIN"], group: "Admin console" },
  { href: "/admin/activity", label: "Activity Feed", icon: "📜", adminRoles: ["SUPER_ADMIN", "REGION_ADMIN"], group: "Admin console" },
  { href: "/admin/tracking", label: "Live Tracking", icon: "📍", adminRoles: ["SUPER_ADMIN", "REGION_ADMIN"], group: "Admin console" },
];

const GROUP_ORDER = ["Dashboards", "Data & Operations", "Admin", "Admin console"] as const;

export default function MobileMorePage() {
  const { session, signOut } = useMobileSession();

  const items = ITEMS.filter((i) => {
    if (i.adminRoles) {
      const role = session?.user.role;
      return role === "SUPER_ADMIN" || (role === "REGION_ADMIN" && i.adminRoles.includes(role));
    }
    if (i.superAdminOnly) return isSuperAdminSession(session);
    if (i.superAdminOrSection) {
      return (
        isSuperAdminSession(session) || canSeeMobileSection(session, i.superAdminOrSection)
      );
    }
    // Special-access logins never reach Warranty Lookup — the backend rejects their token.
    if (i.section === "warranty" && session?.user.role === "SPECIAL_ACCESS") return false;
    return !i.section || canSeeMobileSection(session, i.section);
  });

  const groups = GROUP_ORDER.map((name) => ({
    name,
    items: items.filter((i) => i.group === name),
  })).filter((g) => g.items.length > 0);

  const user = session?.user;
  const displayName =
    user?.username || (user?.email ? user.email.split("@")[0] : null) || "user";
  const roleLabel = (user?.role ?? "")
    .split("_")
    .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
    .join(" ");

  return (
    <>
      <AppBar title="More" />
      <main className="mMain">
        <div className="mCard" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: "var(--m-primary)",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontSize: 17,
              fontWeight: 800,
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{displayName}</div>
            <div className="mMuted" style={{ fontSize: 12 }}>{roleLabel}</div>
          </div>
        </div>

        {groups.map((group) => (
          <div key={group.name}>
            <div className="mSectionTitle">{group.name}</div>
            <div className="mList">
              {group.items.map((item) => (
                <Link
                  key={`${item.href}-${item.label}`}
                  href={item.href}
                  className="mRow"
                  style={{ textDecoration: "none" }}
                >
                  <div className="mRow__top">
                    <span className="mRow__title">
                      <span style={{ marginRight: 8 }} aria-hidden="true">{item.icon}</span>
                      {item.label}
                    </span>
                    <span className="mMuted" style={{ fontSize: 12 }}>
                      {item.hint ?? "›"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}

        <div className="mSectionTitle">Account</div>
        <div className="mList">
          <Link href="/me/password" className="mRow" style={{ textDecoration: "none" }}>
            <div className="mRow__top">
              <span className="mRow__title">🔑 Change password</span>
              <span className="mMuted">›</span>
            </div>
          </Link>
          <button
            type="button"
            className="mRow"
            onClick={signOut}
            style={{ color: "var(--m-danger)" }}
          >
            <div className="mRow__top">
              <span className="mRow__title">↩ Sign out</span>
            </div>
          </button>
        </div>

        <p className="mMuted" style={{ textAlign: "center", marginTop: 22, fontSize: 11 }}>
          Renderways OpenCall
        </p>
      </main>
    </>
  );
}
