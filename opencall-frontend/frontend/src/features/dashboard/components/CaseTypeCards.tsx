// Case Type Overview cards extracted from app/page.tsx (Phase 6.9).
// JSX preserved verbatim; props passed explicitly (no filtering, count-calculation,
// click-through, state, or handler changes). openRecordsWithFilter is passed in
// unchanged. The `showCaseTypeOverview` render guard stays in page.tsx.
import { formatNumber } from "../utils";
import { PC_SEGMENT } from "../constants";
import type { ReportRow, PrintCaseFilter } from "../types";

export function CaseTypeCards({
  printInstallationRows,
  cissRows,
  printFixRows,
  pcRows,
  tradeRows,
  rcaRows,
  printCaseFilter,
  showCissOnly,
  showTradeOnly,
  showRcaOnly,
  caseTypeRegionBreakdown,
  openRecordsWithFilter,
}: Readonly<{
  printInstallationRows: ReportRow[];
  cissRows: ReportRow[];
  printFixRows: ReportRow[];
  pcRows: ReportRow[];
  tradeRows: ReportRow[];
  rcaRows: ReportRow[];
  printCaseFilter: PrintCaseFilter | null;
  showCissOnly: boolean;
  showTradeOnly: boolean;
  showRcaOnly: boolean;
  caseTypeRegionBreakdown: Array<{
    aspCode: string;
    regionName: string;
    printInstallation: number;
    ciss: number;
    printFix: number;
    pc: number;
    trade: number;
    rca: number;
  }>;
  openRecordsWithFilter: (args: Readonly<{
    region?: string | null;
    printCase?: PrintCaseFilter | null;
    cissOnly?: boolean;
    segment?: string | null;
    tradeOnly?: boolean;
    rcaOnly?: boolean;
  }>) => void;
}>) {
  return (
    <div className="caseTypeSection">
      <div className="sectionHeader">
        <div>
          <h3>Case Type Overview</h3>
          <p>Warranty priority: Installation first, then CISS (excludes 01-Trade), Print Fix, PC, Trade, and RCA.</p>
        </div>
      </div>
      <div className="caseTypeGrid compactSix">
        <div className={`caseTypeCard ${printCaseFilter === "installation" ? "active" : ""}`}>
          <button type="button" className="caseTypeSummary" onClick={() => openRecordsWithFilter({ printCase: "installation" })}>
            <span>Installation</span>
            <strong>{formatNumber(printInstallationRows.length)}</strong>
            <small>Warranty priority 1 - WO OTC 05F</small>
          </button>
          <div className="caseTypeRegionList">
            {caseTypeRegionBreakdown.map((entry) => (
              <button
                type="button"
                key={entry.aspCode}
                onClick={() => openRecordsWithFilter({ region: entry.aspCode, printCase: "installation" })}
              >
                <span>{entry.regionName}</span>
                <strong>{entry.printInstallation}</strong>
              </button>
            ))}
          </div>
        </div>
        <div className={`caseTypeCard ${showCissOnly ? "active" : ""}`}>
          <button type="button" className="caseTypeSummary" onClick={() => openRecordsWithFilter({ cissOnly: true })}>
            <span>CISS Cases</span>
            <strong>{formatNumber(cissRows.length)}</strong>
            <small>Product line contains CISS (excludes Trade)</small>
          </button>
          <div className="caseTypeRegionList">
            {caseTypeRegionBreakdown.map((entry) => (
              <button
                type="button"
                key={entry.aspCode}
                onClick={() => openRecordsWithFilter({ region: entry.aspCode, cissOnly: true })}
              >
                <span>{entry.regionName}</span>
                <strong>{entry.ciss}</strong>
              </button>
            ))}
          </div>
        </div>
        <div className={`caseTypeCard ${printCaseFilter === "fix" ? "active" : ""}`}>
          <button type="button" className="caseTypeSummary" onClick={() => openRecordsWithFilter({ printCase: "fix" })}>
            <span>Print Fix Cases</span>
            <strong>{formatNumber(printFixRows.length)}</strong>
            <small>Remaining Print (non-Installation)</small>
          </button>
          <div className="caseTypeRegionList">
            {caseTypeRegionBreakdown.map((entry) => (
              <button
                type="button"
                key={entry.aspCode}
                onClick={() => openRecordsWithFilter({ region: entry.aspCode, printCase: "fix" })}
              >
                <span>{entry.regionName}</span>
                <strong>{entry.printFix}</strong>
              </button>
            ))}
          </div>
        </div>
        <div className="caseTypeCard">
          <button type="button" className="caseTypeSummary" onClick={() => openRecordsWithFilter({ segment: PC_SEGMENT })}>
            <span>PC Cases</span>
            <strong>{formatNumber(pcRows.length)}</strong>
            <small>Segment is PC</small>
          </button>
          <div className="caseTypeRegionList">
            {caseTypeRegionBreakdown.map((entry) => (
              <button
                type="button"
                key={entry.aspCode}
                onClick={() => openRecordsWithFilter({ region: entry.aspCode, segment: PC_SEGMENT })}
              >
                <span>{entry.regionName}</span>
                <strong>{entry.pc}</strong>
              </button>
            ))}
          </div>
        </div>
        <div className={`caseTypeCard ${showTradeOnly ? "active" : ""}`}>
          <button type="button" className="caseTypeSummary" onClick={() => openRecordsWithFilter({ tradeOnly: true })}>
            <span>Trade Cases</span>
            <strong>{formatNumber(tradeRows.length)}</strong>
            <small>WO OTC CODE 01-Trade (non-warranty)</small>
          </button>
          <div className="caseTypeRegionList">
            {caseTypeRegionBreakdown.map((entry) => (
              <button
                type="button"
                key={entry.aspCode}
                onClick={() => openRecordsWithFilter({ region: entry.aspCode, tradeOnly: true })}
              >
                <span>{entry.regionName}</span>
                <strong>{entry.trade}</strong>
              </button>
            ))}
          </div>
        </div>
        <div className={`caseTypeCard ${showRcaOnly ? "active" : ""}`}>
          <button type="button" className="caseTypeSummary" onClick={() => openRecordsWithFilter({ rcaOnly: true })}>
            <span>RCA Cases</span>
            <strong>{formatNumber(rcaRows.length)}</strong>
            <small>RCA value available</small>
          </button>
          <div className="caseTypeRegionList">
            {caseTypeRegionBreakdown.map((entry) => (
              <button
                type="button"
                key={entry.aspCode}
                onClick={() => openRecordsWithFilter({ region: entry.aspCode, rcaOnly: true })}
              >
                <span>{entry.regionName}</span>
                <strong>{entry.rca}</strong>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
