// Closed Call Ledger section extracted from app/page.tsx (Phase 6.2).
// JSX preserved verbatim; props passed explicitly (no grouping).
import { formatNumber } from "../utils";

export function ClosedCallLedger({
  overallClosedCount,
  closedRegionBreakdown,
  showClosedOnly,
  selectedRegion,
  openRecordsWithFilter,
}: Readonly<{
  overallClosedCount: number;
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
          <span>Total Closed</span>
          <strong>{formatNumber(overallClosedCount)}</strong>
          <small>Open closed records</small>
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
