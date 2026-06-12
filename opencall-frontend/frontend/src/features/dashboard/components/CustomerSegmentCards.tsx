// Customer Segment Split + Warranty Segment Split cards extracted from
// app/page.tsx (Phase 6.10). JSX preserved verbatim; props passed explicitly (no
// filtering, customer-segment calculation, click-through, state, or handler
// changes). openRecordsWithFilter is passed in unchanged. The
// `showCustomerSegmentSplit` render guard stays in page.tsx.
import { formatNumber } from "../utils";
import type { ReportRow } from "../types";

export function CustomerSegmentCards({
  showConsumerOnly,
  consumerRows,
  showCommercialOnly,
  commercialRows,
  showWarrantyOnly,
  warrantyRows,
  showNonWarrantyOnly,
  nonWarrantyRows,
  caseTypeRegionBreakdown,
  incompleteCellCount,
  openRecordsWithFilter,
}: Readonly<{
  showConsumerOnly: boolean;
  consumerRows: ReportRow[];
  showCommercialOnly: boolean;
  commercialRows: ReportRow[];
  showWarrantyOnly: boolean;
  warrantyRows: ReportRow[];
  showNonWarrantyOnly: boolean;
  nonWarrantyRows: ReportRow[];
  caseTypeRegionBreakdown: Array<{
    aspCode: string;
    regionName: string;
    consumer: number;
    commercial: number;
    warranty: number;
    nonWarranty: number;
  }>;
  incompleteCellCount: number;
  openRecordsWithFilter: (args: Readonly<{
    region?: string | null;
    consumerOnly?: boolean;
    commercialOnly?: boolean;
    warrantyOnly?: boolean;
    nonWarrantyOnly?: boolean;
  }>) => void;
}>) {
  return (
    <div className="segmentSplitGrid">
      <div className="caseTypeSection segmentSplitSection">
        <div className="sectionHeader">
          <div>
            <h3>Customer Segment Split</h3>
            <p>Split counts for Consumer (Retail/Individual) and Commercial (Corporate/Business) cases.</p>
          </div>
        </div>
        <div className="caseTypeGrid twoUp">
          <div className={`caseTypeCard ${showConsumerOnly ? "active" : ""}`} style={{ padding: "16px" }}>
            <button
              type="button"
              className="caseTypeSummary"
              style={{ minHeight: "auto", padding: "0", cursor: "pointer", width: "100%", background: "none", border: "none", textAlign: "left" }}
              onClick={() => openRecordsWithFilter({ consumerOnly: true })}
            >
              <span>Consumer Segment</span>
              <strong style={{ color: "#4f46e5", fontSize: "36px", marginTop: "8px" }}>{formatNumber(consumerRows.length)}</strong>
              <small style={{ marginTop: "4px" }}>Retail / Individual Accounts</small>
            </button>
            <div className="caseTypeRegionList" style={{ marginTop: "12px" }}>
              {caseTypeRegionBreakdown.map((entry) => (
                <button
                  type="button"
                  key={entry.aspCode}
                  onClick={() => openRecordsWithFilter({ region: entry.aspCode, consumerOnly: true })}
                >
                  <span>{entry.regionName}</span>
                  <strong>{entry.consumer}</strong>
                </button>
              ))}
            </div>
          </div>
          <div className={`caseTypeCard ${showCommercialOnly ? "active" : ""}`} style={{ padding: "16px" }}>
            <button
              type="button"
              className="caseTypeSummary"
              style={{ minHeight: "auto", padding: "0", cursor: "pointer", width: "100%", background: "none", border: "none", textAlign: "left" }}
              onClick={() => openRecordsWithFilter({ commercialOnly: true })}
            >
              <span>Commercial Segment</span>
              <strong style={{ color: "#2563eb", fontSize: "36px", marginTop: "8px" }}>{formatNumber(commercialRows.length)}</strong>
              <small style={{ marginTop: "4px" }}>Corporate / Business / Enterprise Accounts</small>
            </button>
            <div className="caseTypeRegionList" style={{ marginTop: "12px" }}>
              {caseTypeRegionBreakdown.map((entry) => (
                <button
                  type="button"
                  key={entry.aspCode}
                  onClick={() => openRecordsWithFilter({ region: entry.aspCode, commercialOnly: true })}
                >
                  <span>{entry.regionName}</span>
                  <strong>{entry.commercial}</strong>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="caseTypeSection segmentSplitSection">
        <div className="sectionHeader">
          <div>
            <h3>Warranty Segment Split</h3>
            <p>Split counts for Active Warranty and Non-Warranty (Trade) cases.</p>
          </div>
        </div>
        <div className="caseTypeGrid twoUp">
          <div className={`caseTypeCard ${showWarrantyOnly ? "active" : ""}`} style={{ padding: "16px" }}>
            <button
              type="button"
              className="caseTypeSummary"
              style={{ minHeight: "auto", padding: "0", cursor: "pointer", width: "100%", background: "none", border: "none", textAlign: "left" }}
              onClick={() => openRecordsWithFilter({ warrantyOnly: true })}
            >
              <span>Warranty Segment</span>
              <strong style={{ color: "#16a34a", fontSize: "36px", marginTop: "8px" }}>{formatNumber(warrantyRows.length)}</strong>
              <small style={{ marginTop: "4px" }}>Active Warranty / Service Contracts</small>
            </button>
            <div className="caseTypeRegionList" style={{ marginTop: "12px" }}>
              {caseTypeRegionBreakdown.map((entry) => (
                <button
                  type="button"
                  key={entry.aspCode}
                  onClick={() => openRecordsWithFilter({ region: entry.aspCode, warrantyOnly: true })}
                >
                  <span>{entry.regionName}</span>
                  <strong>{entry.warranty}</strong>
                </button>
              ))}
            </div>
          </div>
          <div className={`caseTypeCard ${showNonWarrantyOnly ? "active" : ""}`} style={{ padding: "16px" }}>
            <button
              type="button"
              className="caseTypeSummary"
              style={{ minHeight: "auto", padding: "0", cursor: "pointer", width: "100%", background: "none", border: "none", textAlign: "left" }}
              onClick={() => openRecordsWithFilter({ nonWarrantyOnly: true })}
            >
              <span>Non-Warranty Segment</span>
              <strong style={{ color: "#ea580c", fontSize: "36px", marginTop: "8px" }}>{formatNumber(nonWarrantyRows.length)}</strong>
              <small style={{ marginTop: "4px" }}>Trade / Non-Warranty / Out-of-Warranty Accounts</small>
            </button>
            <div className="caseTypeRegionList" style={{ marginTop: "12px" }}>
              {caseTypeRegionBreakdown.map((entry) => (
                <button
                  type="button"
                  key={entry.aspCode}
                  onClick={() => openRecordsWithFilter({ region: entry.aspCode, nonWarrantyOnly: true })}
                >
                  <span>{entry.regionName}</span>
                  <strong>{entry.nonWarranty}</strong>
                </button>
              ))}
            </div>
          </div>
        </div>
        {incompleteCellCount > 0 ? (
          <p className="hint">
            Click any highlighted "Entry" cell or the row Edit button to enter manual data.
          </p>
        ) : null}
      </div>
    </div>
  );
}
