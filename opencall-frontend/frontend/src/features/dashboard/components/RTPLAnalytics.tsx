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
import { RTPL_STATUS_OPTIONS } from "@opencall/shared";

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
  // Set up the status order mapping helper based on RTPL_STATUS_OPTIONS
  const statusOrderMap = new Map<string, number>();
  RTPL_STATUS_OPTIONS.forEach((status, index) => {
    statusOrderMap.set(status.toLowerCase(), index);
  });

  const compareStatuses = (a: string, b: string): number => {
    const idxA = statusOrderMap.has(a.toLowerCase()) ? statusOrderMap.get(a.toLowerCase())! : 9999;
    const idxB = statusOrderMap.has(b.toLowerCase()) ? statusOrderMap.get(b.toLowerCase())! : 9999;
    if (idxA !== idxB) {
      return idxA - idxB;
    }
    return a.localeCompare(b);
  };

  interface BreakdownItem {
    status: string;
    bodCount: number;
    eodCount: number;
  }

  // 1. Compute starting (BOD) status for all active rows
  const rowStatusesList = rtplAnalyticsRows.map((row) => {
    const ticketId = String(row.output["Ticket ID"] || "").trim();

    // Find all changes today for this ticket
    const ticketChanges: any[] = [];
    rtplTimeCards.forEach((c) => {
      c.details.forEach((detail) => {
        if (detail.type === "change" && detail.ticketId === ticketId) {
          ticketChanges.push(detail);
        }
      });
    });

    // Determine BOD status
    let bodStatus = "";
    if (ticketChanges.length > 0) {
      // Sort changes by changedAt ascending
      const sortedChanges = [...ticketChanges].sort((a, b) =>
        String(a.changedAt || "").localeCompare(String(b.changedAt || ""))
      );
      bodStatus = String(sortedChanges[0].fromStatus || "").trim();
    }

    if (!bodStatus || bodStatus.toLowerCase() === "manual entry required") {
      const prev = String(row.comparison?.previousRtplStatus || "").trim();
      bodStatus =
        prev && prev.toLowerCase() !== "manual entry required"
          ? prev
          : String(row.output["RTPL status"] || "").trim();
    }

    // Determine baseline EOD status (EOD of Upload Time card)
    let uploadTimeEodStatus = String(row.output["RTPL status"] || "").trim();
    if (ticketChanges.length > 0) {
      const sortedChanges = [...ticketChanges].sort((a, b) =>
        String(a.changedAt || "").localeCompare(String(b.changedAt || ""))
      );
      const earliestFrom = String(sortedChanges[0].fromStatus || "").trim();
      if (earliestFrom && earliestFrom.toLowerCase() !== "manual entry required") {
        uploadTimeEodStatus = earliestFrom;
      }
    }

    return {
      ticketId,
      bodStatus,
      uploadTimeEodStatus,
    };
  });

  // 2. Gather status counts and active statuses for each card
  const allActiveStatuses = new Set<string>();
  const cardStatusCountsList = rtplTimeCards.map((card, cardIndex) => {
    const isCarryForward = card.id === RTPL_CARRY_FORWARD_TIME_CARD_ID;

    const rowsWithStatuses = rowStatusesList.map(({ ticketId, bodStatus, uploadTimeEodStatus }) => {
      let eodStatus = uploadTimeEodStatus;

      if (!isCarryForward) {
        // Collect changes up to cardIndex
        const changesUpToCard: any[] = [];
        for (let j = 1; j <= cardIndex; j++) {
          const prevCard = rtplTimeCards[j];
          if (prevCard) {
            prevCard.details.forEach((detail) => {
              if (detail.type === "change" && detail.ticketId === ticketId) {
                changesUpToCard.push(detail);
              }
            });
          }
        }

        if (changesUpToCard.length > 0) {
          const sortedChanges = [...changesUpToCard].sort((a, b) =>
            String(a.changedAt || "").localeCompare(String(b.changedAt || ""))
          );
          const latestTo = String(sortedChanges[sortedChanges.length - 1].toStatus || "").trim();
          if (latestTo) {
            eodStatus = latestTo;
          }
        }
      }

      return {
        bodStatus,
        eodStatus,
      };
    });

    const cardBod = rowsWithStatuses.filter((r) => r.bodStatus).length;
    const cardEod = rowsWithStatuses.filter((r) => r.eodStatus).length;

    const statusCounts = new Map<string, { bod: number; eod: number }>();
    rowsWithStatuses.forEach(({ bodStatus, eodStatus }) => {
      if (bodStatus) {
        const counts = statusCounts.get(bodStatus) || { bod: 0, eod: 0 };
        counts.bod++;
        statusCounts.set(bodStatus, counts);
        allActiveStatuses.add(bodStatus);
      }
      if (eodStatus) {
        const counts = statusCounts.get(eodStatus) || { bod: 0, eod: 0 };
        counts.eod++;
        statusCounts.set(eodStatus, counts);
        allActiveStatuses.add(eodStatus);
      }
    });

    return {
      card,
      cardBod,
      cardEod,
      statusCounts,
    };
  });

  // 3. Sort all active statuses using the order from RTPL_STATUS_OPTIONS
  const sortedActiveStatuses = Array.from(allActiveStatuses).sort(compareStatuses);

  // 4. Build the final checkpointCards with identical status list ordered consistently
  const checkpointCards = cardStatusCountsList.map(({ card, cardBod, cardEod, statusCounts }) => {
    let breakdown: BreakdownItem[] = [];

    // Only display status items if the card actually has data (bod or eod > 0)
    if (cardBod > 0 || cardEod > 0) {
      breakdown = sortedActiveStatuses.map((status) => {
        const counts = statusCounts.get(status) || { bod: 0, eod: 0 };
        return {
          status,
          bodCount: counts.bod,
          eodCount: counts.eod,
        };
      });
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

