// Closed Call Ledger section extracted from app/page.tsx (Phase 6.2).
// JSX preserved verbatim; props passed explicitly (no grouping).
import { formatNumber } from "../utils";

export function ClosedCallLedger({
  overallClosedCount,
  closedTodayCount,
  closedRegionBreakdown,
  showClosedOnly,
  selectedRegion,
  openRecordsWithFilter,
}: Readonly<{
  overallClosedCount: number;
  closedTodayCount: number;
  closedRegionBreakdown: Array<{
    aspCode: string;
    regionName: string;
    closedCount: number;
    activeCount: number;
  }>;
  showClosedOnly: boolean;
  selectedRegion: string | null;
  openRecordsWithFilter: (filter: { region?: string | null; closedOnly?: boolean }) => void;
}>) {
  return (
    <div className="closedCallsSection">
      <div className="closedCallsHeader">
        <div>
          <p className="eyebrow">Closed Call Ledger</p>
          <h3>Closed Calls</h3>
          <p>
            Closed work orders are separated from the Work in Progress region breakdown
            to keep active contract-code operations clean.
          </p>
        </div>
        <button
          type="button"
          className={`closedCallsTotal ${showClosedOnly && (!selectedRegion || selectedRegion === "ALL") ? "active" : ""}`}
          onClick={() => openRecordsWithFilter({ region: "ALL", closedOnly: true })}
        >
          <span>Closed Today</span>
          <strong>{formatNumber(closedTodayCount)}</strong>
          <small>{formatNumber(overallClosedCount)} closed in total</small>
        </button>
      </div>

      <div className="closedRegionGrid">
        {closedRegionBreakdown.map((entry) => (
          <button
            key={entry.aspCode}
            type="button"
            className={`closedRegionCard ${showClosedOnly && selectedRegion === entry.aspCode ? "active" : ""}`}
            onClick={() => openRecordsWithFilter({ region: entry.aspCode, closedOnly: true })}
          >
            <span>{entry.regionName}</span>
            <strong>{formatNumber(entry.closedCount)}</strong>
            <small>{entry.aspCode} | {formatNumber(entry.activeCount)} active WIP</small>
          </button>
        ))}
      </div>
    </div>
  );
}
