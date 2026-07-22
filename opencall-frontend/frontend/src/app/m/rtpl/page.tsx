"use client";

import { useMemo, useState } from "react";
import { AppBar } from "../AppBar";
import { useMobileSession } from "../session";
import { useMobileReport } from "../useMobileReport";
import { useRegionAnalytics } from "../../../features/dashboard/hooks/useRegionAnalytics";
import { isRecordsPageVisibleRow } from "../../../lib/reportDashboardAnalytics";
import type { RegionStats } from "../../../features/dashboard/types/analytics.types";

/**
 * RTPL Dashboard — the phone version of the desktop "Region-wise Breakdown" cards.
 *
 * Row filter and aggregation come straight from the web: activeRows =
 * report.rows.filter(isRecordsPageVisibleRow), then useRegionAnalytics (which runs the
 * same calculateRegionStats the desktop cards render). A card starts collapsed showing
 * the four headline splits, and expands into the full segment / OTC / CISS / RCA / Trade
 * detail the desktop RegionCard shows.
 */
export default function MobileRtplDashboardPage() {
  const { session } = useMobileSession();
  const { report, loading, error, reload } = useMobileReport(session);

  const activeRows = useMemo(
    () => (report ? report.rows.filter(isRecordsPageVisibleRow) : []),
    [report],
  );

  const { activeRegionBreakdown, overallStats } = useRegionAnalytics({ activeRows, report });

  // The desktop hides the "All Regions" card from a REGION_ADMIN.
  const canShowAllRegions = session?.user.role !== "REGION_ADMIN";

  const cards = useMemo(() => {
    const list: Array<{ key: string; title: string; subtitle: string; stats: RegionStats }> = [];
    if (canShowAllRegions) {
      list.push({ key: "ALL", title: "All Regions", subtitle: "Overall", stats: overallStats });
    }
    for (const entry of activeRegionBreakdown.filter((e) => e.count > 0)) {
      list.push({
        key: entry.aspCode || entry.regionName,
        title: entry.regionName,
        subtitle: entry.aspCode,
        stats: entry,
      });
    }
    return list;
  }, [activeRegionBreakdown, overallStats, canShowAllRegions]);

  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <AppBar
        title="RTPL Dashboard"
        subtitle={report?.reportDate ?? undefined}
        back
        action={
          <button type="button" className="mIconBtn" aria-label="Refresh" onClick={reload}>
            ↻
          </button>
        }
      />
      <main className="mMain">
        {error && <div className="mError">{error}</div>}

        {loading ? (
          <div className="mCard" style={{ textAlign: "center", padding: 26 }}>
            <div className="mSpinner" />
            <div className="mMuted">Loading regions…</div>
          </div>
        ) : cards.length === 0 ? (
          <div className="mCard"><div className="mMuted">No active rows in this report.</div></div>
        ) : (
          <>
            <div className="mMuted" style={{ margin: "0 2px 10px" }}>
              Region-wise Breakdown · tap a card for the full split
            </div>
            {cards.map((card) => (
              <RegionCard
                key={card.key}
                title={card.title}
                subtitle={card.subtitle}
                stats={card.stats}
                expanded={open === card.key}
                onToggle={() => setOpen(open === card.key ? null : card.key)}
              />
            ))}
          </>
        )}
      </main>
    </>
  );
}

function RegionCard({
  title, subtitle, stats, expanded, onToggle,
}: Readonly<{
  title: string;
  subtitle: string;
  stats: RegionStats;
  expanded: boolean;
  onToggle: () => void;
}>) {
  // Print Total is a render-time subtraction on the desktop too — kept identical.
  const printTotal = stats.printCount - stats.installCount;
  const printCommercial = stats.printCommercial - stats.installCommercial;
  const printConsumer = stats.printConsumer - stats.installConsumer;

  return (
    <div className="mCard" style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          border: "none",
          background: "transparent",
          padding: 14,
          textAlign: "left",
          cursor: "pointer",
          font: "inherit",
          color: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 750, fontSize: 15 }}>{title}</div>
            <div className="mMuted" style={{ fontSize: 11.5, fontWeight: 600 }}>{subtitle}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: "var(--m-primary)" }}>
              {stats.count}
            </div>
            <span className="mMuted" style={{ fontSize: 13 }} aria-hidden="true">
              {expanded ? "▴" : "▾"}
            </span>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 6,
            marginTop: 12,
            paddingTop: 12,
            borderTop: "1px solid var(--m-border)",
          }}
        >
          <Mini label="Consumer" value={stats.consumerCount} />
          <Mini label="Commercial" value={stats.commercialCount} />
          <Mini label="Warranty" value={stats.warrantyCount} color="var(--m-good)" />
          <Mini label="Trade" value={stats.nonWarrantyCount} color="var(--m-warn)" />
        </div>
      </button>

      {expanded && (
        <div style={{ padding: "0 14px 14px" }}>
          <Group title="Segment Product">
            <Detail
              label="PC Total"
              value={stats.pcCount}
              hint={`commercial: ${stats.pcCommercial}  ·  consumer: ${stats.pcConsumer}`}
            />
            <Detail
              label="Print Total"
              value={printTotal}
              hint={`commercial: ${printCommercial}  ·  consumer: ${printConsumer}`}
            />
            <Detail
              label="Installation Total"
              value={stats.installCount}
              hint={`commercial: ${stats.installCommercial}  ·  consumer: ${stats.installConsumer}`}
            />
          </Group>

          <Group title="WO OTC Breakdown">
            {stats.woOtcCodeBreakdown.length === 0 ? (
              <div className="mMuted" style={{ fontSize: 12.5, padding: "4px 0" }}>No records</div>
            ) : (
              stats.woOtcCodeBreakdown.map((w) => (
                <Detail key={w.code} label={w.code} value={w.count} />
              ))
            )}
          </Group>

          <Group title="Special Cases">
            <Detail
              label="CISS Case"
              value={stats.cissCount}
              hint={`consumer: ${stats.cissConsumer}`}
            />
            <Detail
              label="RCA Case"
              value={stats.rcaCount}
              hint={`commercial: ${stats.rcaCommercial}  ·  consumer: ${stats.rcaConsumer}`}
            />
          </Group>

          <Group title={`Trade · ${stats.tradeCount}`}>
            <Detail
              label="PC Total"
              value={stats.tradePcCount}
              hint={`comms: ${stats.tradePcCommercial}  ·  cons: ${stats.tradePcConsumer}`}
            />
            <Detail
              label="Print Total"
              value={stats.tradePrintCount}
              hint={`comms: ${stats.tradePrintCommercial}  ·  cons: ${stats.tradePrintConsumer}`}
            />
          </Group>
        </div>
      )}
    </div>
  );
}

function Mini({
  label, value, color,
}: Readonly<{ label: string; value: number; color?: string }>) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: color ?? "var(--m-text)" }}>{value}</div>
      <div style={{ fontSize: 9.5, color: "var(--m-muted)", fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function Group({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: "var(--m-muted)",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ display: "grid", gap: 2 }}>{children}</div>
    </div>
  );
}

function Detail({
  label, value, hint,
}: Readonly<{ label: string; value: number; hint?: string }>) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 10,
        padding: "6px 0",
        borderBottom: "1px solid var(--m-border)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 650 }}>{label}</div>
        {hint && (
          <div className="mMuted" style={{ fontSize: 10.5 }}>{hint}</div>
        )}
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, flexShrink: 0 }}>{value}</div>
    </div>
  );
}
