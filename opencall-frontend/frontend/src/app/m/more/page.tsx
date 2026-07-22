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
  section?: string;
  superAdminOnly?: boolean;
  external?: boolean;
}

const ITEMS: Item[] = [
  { href: "/m/records", label: "Records", icon: "📋", section: "records" },
  { href: "/m/closed", label: "Closed Calls", icon: "📁", section: "closed-calls" },
  { href: "/m/engineers", label: "Engineers", icon: "👷" },
  { href: "/", label: "Overview", icon: "📊", hint: "Full workspace", section: "overview", external: true },
  { href: "/", label: "RTPL Dashboard", icon: "📈", hint: "Full workspace", section: "rtpl-dashboard", external: true },
  { href: "/", label: "Flex Dashboard", icon: "⚡", hint: "Full workspace", section: "flex", external: true },
  { href: "/", label: "Parts Catalog", icon: "🔩", hint: "Full workspace", superAdminOnly: true, external: true },
  { href: "/", label: "Quotations", icon: "📄", hint: "Full workspace", superAdminOnly: true, external: true },
];

export default function MobileMorePage() {
  const { session, signOut } = useMobileSession();

  const items = ITEMS.filter((i) => {
    if (i.superAdminOnly) return isSuperAdminSession(session);
    return !i.section || canSeeMobileSection(session, i.section);
  });

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

        <div className="mSectionTitle">Sections</div>
        <div className="mList">
          {items.map((item) => (
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
