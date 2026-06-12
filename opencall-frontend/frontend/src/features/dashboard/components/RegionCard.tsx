// Region breakdown card extracted from app/page.tsx renderRegionCard (Phase 6.12).
// JSX preserved verbatim; presentational. The closure variables it referenced
// (selectedRegion, show* flags, printCaseFilter, openRecordsWithFilter) are now
// props with identical names, so the JSX, highlight/active conditions,
// openRecordsWithFilter calls, and key generation are unchanged. Rendered by
// RegionBreakdown.
import type { RegionStats, PrintCaseFilter } from "../types";

export type RegionFilterArgs = Readonly<{
  region?: string | null;
  woOtcCode?: string | null;
  printCase?: PrintCaseFilter | null;
  pcOnly?: boolean;
  cissOnly?: boolean;
  rcaOnly?: boolean;
  tradeOnly?: boolean;
  consumerOnly?: boolean;
  commercialOnly?: boolean;
  warrantyOnly?: boolean;
  nonWarrantyOnly?: boolean;
}>;

export function RegionCard({
  aspCode,
  regionName,
  subtitle,
  stats,
  isActive,
  selectedRegion,
  selectedWoOtcCode,
  showConsumerOnly,
  showCommercialOnly,
  showWarrantyOnly,
  showNonWarrantyOnly,
  showPcOnly,
  showCissOnly,
  showRcaOnly,
  printCaseFilter,
  openRecordsWithFilter,
}: Readonly<{
  aspCode: string;
  regionName: string;
  subtitle: string;
  stats: RegionStats;
  isActive: boolean;
  selectedRegion: string | null;
  selectedWoOtcCode: string | null;
  showConsumerOnly: boolean;
  showCommercialOnly: boolean;
  showWarrantyOnly: boolean;
  showNonWarrantyOnly: boolean;
  showPcOnly: boolean;
  showCissOnly: boolean;
  showRcaOnly: boolean;
  printCaseFilter: PrintCaseFilter | null;
  openRecordsWithFilter: (args: RegionFilterArgs) => void;
}>) {
  return (
    <div
      key={`region-card-${aspCode || regionName}`}
      className={`regionCard ${isActive ? "active" : ""}`}
      onClick={() => openRecordsWithFilter({ region: aspCode })}
      style={{ cursor: "pointer" }}
    >
      {/* Card Header */}
      <div className="regionCardHeader">
        <div className="regionCardValue">{stats.count}</div>
        <div className="regionCardName">{regionName}</div>
        <div className="regionCardSubtitle">{subtitle}</div>
      </div>

      {/* Primary Metrics (2x2 Grid of buttons/boxes) */}
      <div className="regionSegmentGrid">
        <div
          className={`regionSegmentBox ${selectedRegion === aspCode && showConsumerOnly ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            openRecordsWithFilter({ region: aspCode, consumerOnly: true });
          }}
        >
          <span className="segmentLabel">Consumer</span>
          <span className="segmentCount">{stats.consumerCount}</span>
        </div>

        <div
          className={`regionSegmentBox ${selectedRegion === aspCode && showCommercialOnly ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            openRecordsWithFilter({ region: aspCode, commercialOnly: true });
          }}
        >
          <span className="segmentLabel">Commercial</span>
          <span className="segmentCount">{stats.commercialCount}</span>
        </div>

        <div
          className={`regionSegmentBox ${selectedRegion === aspCode && showWarrantyOnly ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            openRecordsWithFilter({ region: aspCode, warrantyOnly: true });
          }}
        >
          <span className="segmentLabel">Warranty</span>
          <span className="segmentCount">{stats.warrantyCount}</span>
        </div>

        <div
          className={`regionSegmentBox ${selectedRegion === aspCode && showNonWarrantyOnly ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            openRecordsWithFilter({ region: aspCode, nonWarrantyOnly: true });
          }}
        >
          <span className="segmentLabel">Trade</span>
          <span className="segmentCount">{stats.nonWarrantyCount}</span>
        </div>
      </div>

      {/* Details Grid (Left and Right columns) */}
      <div className="regionCardDetailsGrid">
        {/* Left Column: Detail cards */}
        <div className="regionCardDetailsCol">
          <div className="regionWoOtcHeader">Segment Product</div>
          <div
            className={`regionDetailMetricCard ${selectedRegion === aspCode && showWarrantyOnly && showPcOnly ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              openRecordsWithFilter({ region: aspCode, warrantyOnly: true, pcOnly: true });
            }}
          >
            <div className="regionDetailMetricHeader">
              <span className="regionDetailMetricTitle">PC Total</span>
              <span className="regionDetailMetricCount">{stats.pcCount}</span>
            </div>
            <div className="regionDetailMetricSubtext">
              commercial: {stats.pcCommercial} consumer: {stats.pcConsumer}
            </div>
          </div>

          <div
            className={`regionDetailMetricCard ${selectedRegion === aspCode && showWarrantyOnly && printCaseFilter === "fix" ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              openRecordsWithFilter({ region: aspCode, warrantyOnly: true, printCase: "fix" });
            }}
          >
            <div className="regionDetailMetricHeader">
              <span className="regionDetailMetricTitle">Print Total</span>
              <span className="regionDetailMetricCount">{stats.printCount - stats.installCount}</span>
            </div>
            <div className="regionDetailMetricSubtext">
              commercial: {stats.printCommercial - stats.installCommercial} consumer: {stats.printConsumer - stats.installConsumer}
            </div>
          </div>

          <div
            className={`regionDetailMetricCard ${selectedRegion === aspCode && showWarrantyOnly && printCaseFilter === "installation" ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              openRecordsWithFilter({ region: aspCode, warrantyOnly: true, printCase: "installation" });
            }}
          >
            <div className="regionDetailMetricHeader">
              <span className="regionDetailMetricTitle">Installation Total</span>
              <span className="regionDetailMetricCount">{stats.installCount}</span>
            </div>
            <div className="regionDetailMetricSubtext">
              commercial: {stats.installCommercial} consumer: {stats.installConsumer}
            </div>
          </div>
        </div>

        {/* Right Column: WO OTC Breakdown list */}
        <div className="regionCardDetailsCol">
          <div className="regionWoOtcHeader">WO OTC Breakdown</div>
          {stats.woOtcCodeBreakdown.length > 0 ? (
            <div className="regionWoOtcList">
              {stats.woOtcCodeBreakdown.map(woCode => (
                <div
                  key={woCode.code}
                  className={`regionWoOtcItem ${selectedRegion === aspCode && selectedWoOtcCode === woCode.code ? "active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    openRecordsWithFilter({ region: aspCode, woOtcCode: woCode.code });
                  }}
                >
                  <span className="regionWoOtcCode">{woCode.code}</span>
                  <span className="regionWoOtcCount">{woCode.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="regionWoOtcEmpty">No records</div>
          )}
        </div>
      </div>

      {/* CISS and RCA Cases Section */}
      <div style={{
        borderTop: "1px dashed var(--border)",
        paddingTop: "14px",
        marginBottom: "14px",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "8px"
      }}>
        <div
          className={`regionDetailMetricCard ${selectedRegion === aspCode && showCissOnly ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            openRecordsWithFilter({ region: aspCode, cissOnly: true });
          }}
          style={{ margin: 0 }}
        >
          <div className="regionDetailMetricHeader">
            <span className="regionDetailMetricTitle">CISS Case</span>
            <span className="regionDetailMetricCount">{stats.cissCount}</span>
          </div>
          <div className="regionDetailMetricSubtext">
            consumer: {stats.cissConsumer}
          </div>
        </div>

        <div
          className={`regionDetailMetricCard ${selectedRegion === aspCode && showRcaOnly ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            openRecordsWithFilter({ region: aspCode, rcaOnly: true });
          }}
          style={{ margin: 0 }}
        >
          <div className="regionDetailMetricHeader">
            <span className="regionDetailMetricTitle">RCA Case</span>
            <span className="regionDetailMetricCount">{stats.rcaCount}</span>
          </div>
          <div className="regionDetailMetricSubtext">
            commercial: {stats.rcaCommercial} consumer: {stats.rcaConsumer}
          </div>
        </div>
      </div>

      {/* Bottom Section: Trade breakdown */}
      <div className="regionTradeSection">
        <div className="regionTradeHeader">Trade {stats.tradeCount}</div>
        <div className="regionTradeGrid">
          <div
            className="regionTradeMetricCard"
            onClick={(e) => {
              e.stopPropagation();
              openRecordsWithFilter({ region: aspCode, tradeOnly: true, pcOnly: true });
            }}
          >
            <div className="regionTradeMetricLabel">PC Total</div>
            <div className="regionTradeMetricSubtext">
              comms: {stats.tradePcCommercial} cons: {stats.tradePcConsumer}
            </div>
            <div className="regionTradeMetricValue">{stats.tradePcCount}</div>
          </div>

          <div
            className="regionTradeMetricCard"
            onClick={(e) => {
              e.stopPropagation();
              openRecordsWithFilter({ region: aspCode, tradeOnly: true, printCase: "all" });
            }}
          >
            <div className="regionTradeMetricLabel">Print Total</div>
            <div className="regionTradeMetricSubtext">
              comms: {stats.tradePrintCommercial} cons: {stats.tradePrintConsumer}
            </div>
            <div className="regionTradeMetricValue">{stats.tradePrintCount}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
