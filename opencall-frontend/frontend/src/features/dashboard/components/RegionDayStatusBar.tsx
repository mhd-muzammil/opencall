// Per-region Final-EOD day boundary chips. Lives on the Open Call Report
// (Records) page, where the day being worked is the report's own date. Extracted
// from ProductivityPage so the control sits with the records the closure freezes.

export interface RegionDayStatusEntry {
  regionId: string;
  regionCode: string;
  regionName: string;
  status: "OPEN" | "CLOSED";
  closedAt: string | null;
  closedBy: string | null;
  canClose: boolean;
  canReopen: boolean;
}

function formatClosedAt(closedAt: string | null): string {
  if (!closedAt) return "";
  const parsed = new Date(closedAt);
  if (Number.isNaN(parsed.getTime())) return closedAt;
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Compact single-region Final-EOD control for the records toolbar. Shown to a
 * REGION_ADMIN for their own region only — no region name, no other regions
 * (the multi-region bar is SUPER_ADMIN-only). Renders the close button while
 * the day is live, then a frozen chip once closed (reopen is SUPER_ADMIN-only,
 * so none is offered here).
 */
export function RegionEodQuickAction({
  region,
  busy = false,
  onCloseRegionEod,
}: Readonly<{
  region: RegionDayStatusEntry;
  busy?: boolean;
  onCloseRegionEod: (regionId: string, regionName: string) => void;
}>) {
  if (region.status === "CLOSED") {
    return (
      <span
        title={`Frozen — edits after the close count toward the next working day`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "8px 14px",
          borderRadius: "8px",
          border: "1px solid #fecaca",
          background: "#fef2f2",
          color: "#991b1b",
          fontSize: "12px",
          fontWeight: "700",
          whiteSpace: "nowrap",
        }}
      >
        🔒 Day Closed{region.closedAt ? ` at ${formatClosedAt(region.closedAt)}` : ""}
      </span>
    );
  }

  if (!region.canClose) {
    return null;
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onCloseRegionEod(region.regionId, region.regionName)}
      title="Freeze today's productivity numbers for your region"
      style={{
        border: "none",
        borderRadius: "8px",
        padding: "8px 16px",
        background: busy ? "#94a3b8" : "linear-gradient(135deg, #dc2626, #b91c1c)",
        color: "#ffffff",
        fontSize: "13px",
        fontWeight: "700",
        cursor: busy ? "wait" : "pointer",
        whiteSpace: "nowrap",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.15)",
      }}
    >
      {busy ? "Closing…" : "Final EOD"}
    </button>
  );
}

/**
 * One chip per ACTIVE region. Duplicate names here mean duplicate rows in the
 * `regions` table, not a rendering fault — deduping visually would mask a split
 * that also splits reports, engineers and user assignments.
 */
export function RegionDayStatusBar({
  regions,
  workingDate = null,
  busyRegionId = null,
  onCloseRegionEod,
  onReopenRegionEod,
}: Readonly<{
  regions: readonly RegionDayStatusEntry[];
  workingDate?: string | null;
  busyRegionId?: string | null;
  onCloseRegionEod?: (regionId: string, regionName: string) => void;
  onReopenRegionEod?: (regionId: string, regionName: string) => void;
}>) {
  if (regions.length === 0) {
    return null;
  }

  return (
    <div style={{
      display: "flex",
      flexWrap: "wrap",
      gap: "10px",
      alignItems: "center",
      padding: "12px 14px",
      background: "#f8fafc",
      border: "1px solid var(--border)",
      borderRadius: "12px",
    }}>
      <span style={{ fontSize: "12px", fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        🔒 Region Day Status{workingDate ? ` (${workingDate})` : ""}:
      </span>
      {regions.map((region) => {
        const isClosed = region.status === "CLOSED";
        const isBusy = busyRegionId === region.regionId;
        return (
          <div
            key={region.regionId}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 10px",
              borderRadius: "999px",
              border: `1px solid ${isClosed ? "#fecaca" : "#bbf7d0"}`,
              background: isClosed ? "#fef2f2" : "#f0fdf4",
              fontSize: "12px",
              fontWeight: "600",
              color: isClosed ? "#991b1b" : "#166534",
            }}
            title={
              isClosed
                ? `Frozen — edits after the close count toward ${region.regionName}'s next working day`
                : `${region.regionName} is live; Final EOD freezes today's numbers`
            }
          >
            <span>{region.regionName}</span>
            <span style={{
              padding: "1px 8px",
              borderRadius: "999px",
              background: isClosed ? "#dc2626" : "#16a34a",
              color: "#ffffff",
              fontSize: "10px",
              fontWeight: "800",
              letterSpacing: "0.5px",
            }}>
              {isClosed ? "CLOSED" : "LIVE"}
            </span>
            {isClosed && (
              <span style={{ fontWeight: "500", color: "#7f1d1d" }}>
                Closed{region.closedAt ? ` at ${formatClosedAt(region.closedAt)}` : ""}{region.closedBy ? ` by ${region.closedBy}` : ""}
              </span>
            )}
            {!isClosed && region.canClose && onCloseRegionEod && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onCloseRegionEod(region.regionId, region.regionName)}
                style={{
                  border: "none",
                  borderRadius: "6px",
                  padding: "3px 10px",
                  background: isBusy ? "#94a3b8" : "linear-gradient(135deg, #dc2626, #b91c1c)",
                  color: "#ffffff",
                  fontSize: "11px",
                  fontWeight: "700",
                  cursor: isBusy ? "wait" : "pointer",
                }}
              >
                {isBusy ? "Closing…" : "Final EOD"}
              </button>
            )}
            {isClosed && region.canReopen && onReopenRegionEod && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onReopenRegionEod(region.regionId, region.regionName)}
                style={{
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  padding: "3px 10px",
                  background: isBusy ? "#94a3b8" : "#ffffff",
                  color: "#334155",
                  fontSize: "11px",
                  fontWeight: "700",
                  cursor: isBusy ? "wait" : "pointer",
                }}
              >
                {isBusy ? "Reopening…" : "Reopen"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
