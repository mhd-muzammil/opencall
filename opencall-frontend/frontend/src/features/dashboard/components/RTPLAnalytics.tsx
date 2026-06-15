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
        {rtplTimeCards.map((card) => (
          <div
            key={card.id}
            className={`rtplTimeCard ${selectedRtplTimeCard?.id === card.id ? "active" : ""}`}
          >
            <button
              type="button"
              className="rtplTimeCardMain"
              onClick={() => openRtplCheckpointModal(card.id)}
            >
              <span>{card.label}</span>
              <small>{formatNumber(card.count)} WO</small>
            </button>
            {card.statusBreakdown.length > 0 ? (
              <div className="rtplTimeStatusList">
                {card.statusBreakdown.map((entry, entryIndex) => (
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
                    <span>{entry.status}</span>
                    <strong>{formatNumber(entry.count)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rtplTimeStatusEmpty">No RTPL movement</div>
            )}
          </div>
        ))}
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

