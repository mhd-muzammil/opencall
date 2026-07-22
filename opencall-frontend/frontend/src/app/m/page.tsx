"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AppBar } from "./AppBar";
import { canSeeMobileSection, isSuperAdminSession, useMobileSession } from "./session";
import { useMobileReport } from "./useMobileReport";

/** Sections reachable from the home grid, each gated the same way the web sidebar is. */
interface Tile {
  href: string;
  label: string;
  icon: string;
  section?: string;
  superAdminOnly?: boolean;
}

const TILES: Tile[] = [
  { href: "/m/records", label: "Records", icon: "📋", section: "records" },
  { href: "/m/closed", label: "Closed Calls", icon: "📁", section: "closed-calls" },
  { href: "/m/engineers", label: "Engineers", icon: "👷" },
  { href: "/m/parts", label: "Parts Catalog", icon: "🔩", superAdminOnly: true },
  { href: "/m/quotations", label: "Quotations", icon: "📄", superAdminOnly: true },
  { href: "/m/more", label: "More", icon: "⋯" },
];

export default function MobileHomePage() {
  const { session } = useMobileSession();
  const { report, loading, error, reload } = useMobileReport(session);

  const stats = useMemo(() => {
    if (!report) return null;
    const closed = report.rows.filter((r) => r.carryForward.closedSyntheticRow).length;
    const total = report.rows.length;
    return { total, closed, active: total - closed, date: report.reportDate };
  }, [report]);

  const name =
    session?.user.username ||
    (session?.user.email ? session.user.email.split("@")[0] : null) ||
    "there";

  const tiles = TILES.filter((t) => {
    if (t.superAdminOnly) {
      return isSuperAdminSession(session) || canSeeMobileSection(session, t.href.slice(3));
    }
    return !t.section || canSeeMobileSection(session, t.section);
  });

  return (
    <>
      <AppBar
        title={`Hi, ${name}`}
        subtitle={stats?.date ? `Report ${stats.date}` : "Operations"}
        action={
          <button
            type="button"
            className="mIconBtn"
            aria-label="Refresh"
            onClick={reload}
          >
            ↻
          </button>
        }
      />

      <main className="mMain">
        {error && <div className="mError">{error}</div>}

        <div className="mSectionTitle">Today</div>
        {loading ? (
          <div className="mCard" style={{ textAlign: "center", padding: 26 }}>
            <div className="mSpinner" />
            <div className="mMuted">Loading report…</div>
          </div>
        ) : !stats ? (
          <div className="mCard">
            <div style={{ fontWeight: 700, marginBottom: 4 }}>No report yet</div>
            <div className="mMuted">
              Once a daily report is generated it will show up here.
            </div>
          </div>
        ) : (
          <div className="mKpiGrid">
            <Link href="/m/records" className="mKpi" style={{ textDecoration: "none" }}>
              <div className="mKpi__label">Active Calls</div>
              <div className="mKpi__value" style={{ color: "var(--m-primary)" }}>
                {stats.active.toLocaleString()}
              </div>
              <div className="mKpi__hint">Open work orders</div>
            </Link>
            <Link href="/m/closed" className="mKpi" style={{ textDecoration: "none" }}>
              <div className="mKpi__label">Closed Calls</div>
              <div className="mKpi__value" style={{ color: "var(--m-good)" }}>
                {stats.closed.toLocaleString()}
              </div>
              <div className="mKpi__hint">Completed</div>
            </Link>
          </div>
        )}

        <div className="mSectionTitle">Sections</div>
        <div className="mTiles">
          {tiles.map((tile) => (
            <Link key={tile.href} href={tile.href} className="mTile">
              <span className="mTile__icon" aria-hidden="true">{tile.icon}</span>
              <span className="mTile__label">{tile.label}</span>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
