// RTPL DASHBOARD + FLEX DASHBOARD analytics sections extracted from app/page.tsx
// (Phase 6.8). JSX preserved verbatim; props passed explicitly (no analytics-
// calculation, filtering, scope-selection, region-selection, handler, or
// modal-opening changes). openRtplCheckpointModal and openRecordsWithFilter are
// passed in unchanged. These two sections render unconditionally in page.tsx.
import type { Dispatch, SetStateAction } from "react";
import { formatNumber, todayIsoDate } from "../utils";
import type { ReportRow, RtplCaseScope } from "../types";
import {
  ALL_REGIONS_FILTER,
  RTPL_CARRY_FORWARD_TIME_CARD_ID,
  type RtplTimeCardId,
  type RtplTimeCard,
  type RtplStatusMetric,
} from "../../../lib/reportDashboardAnalytics";

export function RTPLDashboard({
  rtplAnalyticsDate,
  setRtplAnalyticsDate,
  rtplAnalyticsRows,
  rtplCaseScopeOptions,
  selectedRtplCaseScope,
  setSelectedRtplCaseScope,
  rtplRegionOptions,
  selectedRtplRegion,
  setSelectedRtplRegion,
  rtplTimeCards,
  selectedRtplTimeCard,
  openRtplCheckpointModal,
  openRecordsWithFilter,
}: Readonly<{
  rtplAnalyticsDate: string;
  setRtplAnalyticsDate: Dispatch<SetStateAction<string>>;
  rtplAnalyticsRows: ReportRow[];
  rtplCaseScopeOptions: Array<{ value: RtplCaseScope; label: string; description: string; count: number }>;
  selectedRtplCaseScope: RtplCaseScope;
  setSelectedRtplCaseScope: Dispatch<SetStateAction<RtplCaseScope>>;
  rtplRegionOptions: Array<{ value: string; label: string; count: number }>;
  selectedRtplRegion: string;
  setSelectedRtplRegion: Dispatch<SetStateAction<string>>;
  rtplTimeCards: RtplTimeCard[];
  selectedRtplTimeCard: RtplTimeCard | null;
  openRtplCheckpointModal: (cardId: RtplTimeCardId, status?: string | null) => void;
  openRecordsWithFilter: (args: Readonly<{
    region?: string | null;
    rtplStatus?: string | null;
    flexStatus?: string | null;
    warrantyOnly?: boolean;
    tradeOnly?: boolean;
  }>) => void;
}>) {
  // Compute BOD/EOD and status breakdown counts for the cards
  const checkpointCards = rtplTimeCards.map((card) => {
    const isCarryForward = card.id === RTPL_CARRY_FORWARD_TIME_CARD_ID;
    let cardBod = 0;
    let cardEod = 0;

    interface BreakdownItem {
      status: string;
      bodCount: number;
      eodCount: number;
    }

    let breakdown: BreakdownItem[] = [];

    if (isCarryForward) {
      const detailsWithRows = card.details.map((detail) => {
        const row = rtplAnalyticsRows.find((r) => r.id === detail.rowId);
        let bodStatus = "";
        let eodStatus = "";
        if (row) {
          const prev = String(row.comparison?.previousRtplStatus || "").trim();
          bodStatus = prev && prev.toLowerCase() !== "manual entry required" ? prev : String(row.output["RTPL status"] || "").trim();
          eodStatus = String(row.output["RTPL status"] || "").trim();
        } else if (detail.type === "carry-forward") {
          bodStatus = detail.status;
          eodStatus = detail.status;
        }
        return { detail, bodStatus, eodStatus };
      });

      cardBod = detailsWithRows.filter((d) => d.bodStatus).length;
      cardEod = detailsWithRows.filter((d) => d.eodStatus).length;

      const statusCounts = new Map<string, { bod: number; eod: number }>();
      detailsWithRows.forEach(({ bodStatus, eodStatus }) => {
        if (bodStatus) {
          const counts = statusCounts.get(bodStatus) || { bod: 0, eod: 0 };
          counts.bod++;
          statusCounts.set(bodStatus, counts);
        }
        if (eodStatus) {
          const counts = statusCounts.get(eodStatus) || { bod: 0, eod: 0 };
          counts.eod++;
          statusCounts.set(eodStatus, counts);
        }
      });

      breakdown = Array.from(statusCounts.entries())
        .map(([status, counts]) => ({
          status,
          bodCount: counts.bod,
          eodCount: counts.eod,
        }))
        .sort((a, b) => b.eodCount - a.eodCount || b.bodCount - a.bodCount || a.status.localeCompare(b.status));
    } else {
      cardBod = 0;
      cardEod = card.count;
      breakdown = card.statusBreakdown.map((item) => ({
        status: item.status,
        bodCount: 0,
        eodCount: item.count,
      }));
    }

    return {
      ...card,
      cardBod,
      cardEod,
      breakdown,
    };
  });

  return (
    <div className="rtplAnalyticsSection">
      <div className="sectionHeader rtplAnalyticsHeader">
        <div>
          <h3>RTPL DASHBOARD</h3>
          <p>
            View RTPL movement by all cases, warranty cases, or 01-Trade non-warranty cases.
          </p>
        </div>
        <div className="rtplAnalyticsHeaderActions">
          <label className="rtplAnalyticsDatePicker">
            <span>Activity date</span>
            <input
              type="date"
              value={rtplAnalyticsDate}
              onChange={(event) => {
                setRtplAnalyticsDate(event.target.value || todayIsoDate());
              }}
            />
          </label>
          <span className="statusBadge neutral">
            {rtplAnalyticsRows.length} rows
          </span>
        </div>
      </div>

      <div className="rtplScopeTabs" aria-label="RTPL analytics case type view">
        {rtplCaseScopeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`rtplScopeTab ${selectedRtplCaseScope === option.value ? "active" : ""}`}
            onClick={() => setSelectedRtplCaseScope(option.value)}
          >
            <span>{option.label}</span>
            <small>{option.description}</small>
            <strong>{formatNumber(option.count)}</strong>
          </button>
        ))}
      </div>

      <div className="regionFilterTabs" aria-label="RTPL analytics region filter">
        {rtplRegionOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`regionFilterTab ${selectedRtplRegion === option.value ? "active" : ""}`}
            onClick={() => setSelectedRtplRegion(option.value)}
          >
            <span>{option.label}</span>
            <strong>{option.count}</strong>
          </button>
        ))}
      </div>

      <div className="rtplTimeCardGrid" aria-label="RTPL fixed checkpoint cards">
        {checkpointCards.map((card) => {
          const badgeText = card.id === RTPL_CARRY_FORWARD_TIME_CARD_ID ? "BASELINE" : card.count > 0 ? "CHANGED" : "NO CHANGE";
          const badgeClass = card.id === RTPL_CARRY_FORWARD_TIME_CARD_ID ? "baseline" : card.count > 0 ? "changed" : "no-change";

          return (
            <div
              key={card.id}
              className={`rtplTimeCard ${selectedRtplTimeCard?.id === card.id ? "active" : ""}`}
            >
              <div className="rtplTimeCardHeader" onClick={() => openRtplCheckpointModal(card.id)}>
                <span className="rtplTimeCardTitle">{card.label}</span>
                <span className={`rtplTimeCardBadge ${badgeClass}`}>{badgeText}</span>
              </div>

              <div className="rtplTimeCardBodEodRow" onClick={() => openRtplCheckpointModal(card.id)}>
                <div className="rtplTimeCardBodEodSpacer" />
                <div className="rtplTimeCardBodEod">
                  <div className="bodColumn">
                    <span className="bodLabel">🌅 BOD</span>
                    <strong className="bodValue">{card.cardBod}</strong>
                  </div>
                  <div className="eodColumn">
                    <span className="eodLabel">🌆 EOD</span>
                    <strong className="eodValue">{card.cardEod}</strong>
                  </div>
                </div>
              </div>

              <hr className="rtplTimeCardDivider" />

              {card.breakdown.length > 0 ? (
                <div className="rtplTimeStatusList">
                  {card.breakdown.map((entry, entryIndex) => (
                    <div
                      key={`${card.id}-${entry.status || "blank"}-${entryIndex}`}
                      role="button"
                      tabIndex={0}
                      className="rtplTimeStatusItem"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openRecordsWithFilter({
                          region:
                            selectedRtplRegion === ALL_REGIONS_FILTER
                              ? null
                              : selectedRtplRegion,
                          rtplStatus: entry.status,
                          warrantyOnly: selectedRtplCaseScope === "warranty",
                          tradeOnly: selectedRtplCaseScope === "trade",
                        });
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") {
                          return;
                        }
                        event.preventDefault();
                        event.stopPropagation();
                        openRecordsWithFilter({
                          region:
                            selectedRtplRegion === ALL_REGIONS_FILTER
                              ? null
                              : selectedRtplRegion,
                          rtplStatus: entry.status,
                          warrantyOnly: selectedRtplCaseScope === "warranty",
                          tradeOnly: selectedRtplCaseScope === "trade",
                        });
                      }}
                    >
                      <span className="statusName">{entry.status}</span>
                      <span className="statusCounts">
                        <span className="statusBodCount">{entry.bodCount}</span>
                        <span className="statusDivider">/</span>
                        <span className="statusEodCount">{entry.eodCount}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rtplTimeStatusEmpty">No RTPL movement</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FlexDashboard({
  rtplAnalyticsRows,
  rtplCaseScopeOptions,
  selectedRtplCaseScope,
  setSelectedRtplCaseScope,
  rtplRegionOptions,
  selectedRtplRegion,
  setSelectedRtplRegion,
  flexStatusMetrics,
  openRecordsWithFilter,
}: Readonly<{
  rtplAnalyticsRows: ReportRow[];
  rtplCaseScopeOptions: Array<{ value: RtplCaseScope; label: string; description: string; count: number }>;
  selectedRtplCaseScope: RtplCaseScope;
  setSelectedRtplCaseScope: Dispatch<SetStateAction<RtplCaseScope>>;
  rtplRegionOptions: Array<{ value: string; label: string; count: number }>;
  selectedRtplRegion: string;
  setSelectedRtplRegion: Dispatch<SetStateAction<string>>;
  flexStatusMetrics: RtplStatusMetric[];
  openRecordsWithFilter: (args: Readonly<{
    region?: string | null;
    rtplStatus?: string | null;
    flexStatus?: string | null;
    warrantyOnly?: boolean;
    tradeOnly?: boolean;
  }>) => void;
}>) {
  return (
    <div className="rtplAnalyticsSection">
      <div className="sectionHeader rtplAnalyticsHeader">
        <div>
          <h3>FLEX DASHBOARD</h3>
          <p>
            View Flex status load by all cases, warranty cases, or 01-Trade non-warranty cases.
          </p>
        </div>
        <span className="statusBadge neutral">
          {rtplAnalyticsRows.length} rows
        </span>
      </div>

      <div className="rtplScopeTabs" aria-label="Flex analytics case type view">
        {rtplCaseScopeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`rtplScopeTab ${selectedRtplCaseScope === option.value ? "active" : ""}`}
            onClick={() => setSelectedRtplCaseScope(option.value)}
          >
            <span>{option.label}</span>
            <small>{option.description}</small>
            <strong>{formatNumber(option.count)}</strong>
          </button>
        ))}
      </div>

      <div className="regionFilterTabs" aria-label="Flex analytics region filter">
        {rtplRegionOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`regionFilterTab ${selectedRtplRegion === option.value ? "active" : ""}`}
            onClick={() => setSelectedRtplRegion(option.value)}
          >
            <span>{option.label}</span>
            <strong>{option.count}</strong>
          </button>
        ))}
      </div>

      {flexStatusMetrics.length > 0 ? (
        <div className="rtplMetricGrid">
          {flexStatusMetrics.map((metric, metricIndex) => (
            <button
              className="rtplMetricCard"
              key={`${metric.status || "blank"}-${metricIndex}`}
              type="button"
              onClick={() =>
                openRecordsWithFilter({
                  region:
                    selectedRtplRegion === ALL_REGIONS_FILTER
                      ? null
                      : selectedRtplRegion,
                  flexStatus: metric.status,
                  warrantyOnly: selectedRtplCaseScope === "warranty",
                  tradeOnly: selectedRtplCaseScope === "trade",
                })
              }
              title={`Open ${metric.status} records`}
            >
              <span>{metric.status}</span>
              <strong>{metric.count}</strong>
            </button>
          ))}
        </div>
      ) : (
        <div className="rtplEmptyState">
          No Flex statuses for the selected region.
        </div>
      )}
    </div>
  );
}

export function RTPLAnalytics({
  rtplAnalyticsDate,
  setRtplAnalyticsDate,
  rtplAnalyticsRows,
  rtplCaseScopeOptions,
  selectedRtplCaseScope,
  setSelectedRtplCaseScope,
  rtplRegionOptions,
  selectedRtplRegion,
  setSelectedRtplRegion,
  rtplTimeCards,
  selectedRtplTimeCard,
  flexStatusMetrics,
  openRtplCheckpointModal,
  openRecordsWithFilter,
}: Readonly<{
  rtplAnalyticsDate: string;
  setRtplAnalyticsDate: Dispatch<SetStateAction<string>>;
  rtplAnalyticsRows: ReportRow[];
  rtplCaseScopeOptions: Array<{ value: RtplCaseScope; label: string; description: string; count: number }>;
  selectedRtplCaseScope: RtplCaseScope;
  setSelectedRtplCaseScope: Dispatch<SetStateAction<RtplCaseScope>>;
  rtplRegionOptions: Array<{ value: string; label: string; count: number }>;
  selectedRtplRegion: string;
  setSelectedRtplRegion: Dispatch<SetStateAction<string>>;
  rtplTimeCards: RtplTimeCard[];
  selectedRtplTimeCard: RtplTimeCard | null;
  flexStatusMetrics: RtplStatusMetric[];
  openRtplCheckpointModal: (cardId: RtplTimeCardId, status?: string | null) => void;
  openRecordsWithFilter: (args: Readonly<{
    region?: string | null;
    rtplStatus?: string | null;
    flexStatus?: string | null;
    warrantyOnly?: boolean;
    tradeOnly?: boolean;
  }>) => void;
}>) {
  return (
    <>
      <RTPLDashboard
        rtplAnalyticsDate={rtplAnalyticsDate}
        setRtplAnalyticsDate={setRtplAnalyticsDate}
        rtplAnalyticsRows={rtplAnalyticsRows}
        rtplCaseScopeOptions={rtplCaseScopeOptions}
        selectedRtplCaseScope={selectedRtplCaseScope}
        setSelectedRtplCaseScope={setSelectedRtplCaseScope}
        rtplRegionOptions={rtplRegionOptions}
        selectedRtplRegion={selectedRtplRegion}
        setSelectedRtplRegion={setSelectedRtplRegion}
        rtplTimeCards={rtplTimeCards}
        selectedRtplTimeCard={selectedRtplTimeCard}
        openRtplCheckpointModal={openRtplCheckpointModal}
        openRecordsWithFilter={openRecordsWithFilter}
      />
      <FlexDashboard
        rtplAnalyticsRows={rtplAnalyticsRows}
        rtplCaseScopeOptions={rtplCaseScopeOptions}
        selectedRtplCaseScope={selectedRtplCaseScope}
        setSelectedRtplCaseScope={setSelectedRtplCaseScope}
        rtplRegionOptions={rtplRegionOptions}
        selectedRtplRegion={selectedRtplRegion}
        setSelectedRtplRegion={setSelectedRtplRegion}
        flexStatusMetrics={flexStatusMetrics}
        openRecordsWithFilter={openRecordsWithFilter}
      />
    </>
  );
}

