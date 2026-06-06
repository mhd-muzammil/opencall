import { DAILY_CALL_PLAN_COLUMNS } from "@opencall/shared";
import { withTransaction } from "../../config/database.js";
import {
  findActiveSlaHoursByCategory,
  findAreaNameByPincode,
} from "../../repositories/businessRuleRepository.js";
import {
  backfillMissingDailyCallPlanReportRowCarryForward,
  createDailyCallPlanReport,
  findDailyCallPlanReportRowMetadataByReportId,
  findPreviousFinalReportRowsForManualCarryForward,
  insertDailyCallPlanReportRows,
} from "../../repositories/dailyCallPlanReportRepository.js";
import { findOrCreateCompletedHistorySessionForReport } from "../../repositories/historyRepository.js";
import {
  findComparableReportRowsBySessionId,
  findPreviousCompletedComparisonSession,
  replaceReportComparison,
} from "../../repositories/reportComparisonRepository.js";
import {
  findCallPlanRecordsByBatchId,
  findFlexWipRecordsByBatchId,
  findRenderwaysRecordsByBatchId,
} from "../../repositories/sourceRecordRepository.js";
import type { ComparableReportRow } from "../../types/reportComparison.js";
import type {
  DuplicateTrackingSummary,
  MatchStatus,
} from "../../types/matching.js";
import type {
  GeneratedReportComparisonMetadata,
  GeneratedDailyCallPlanReport,
  GeneratedDailyCallPlanRow,
  GenerateDailyCallPlanInput,
  ManualCarryForwardField,
  ManualCarryForwardSummary,
  ManualCarryForwardRowMetadata,
} from "../../types/reportGeneration.js";
import { MANUAL_CARRY_FORWARD_FIELDS } from "../../types/reportGeneration.js";
import { unprocessableEntity } from "../../utils/httpError.js";
import { matchSourceRecords } from "../compareService/matchingEngine.js";
import {
  dedupeRowsByTicket,
  findDuplicateTicketKeys,
  getNormalizedTicketKey,
} from "../normalization/dedupeRowsByTicket.js";
import {
  buildReportComparison,
} from "../reportComparison/compareReportsService.js";
import {
  formatDailyCallPlanRow,
  orderedDailyCallPlanRow,
} from "./dailyCallPlanFormatter.js";
import { isRequestToCancelFlexStatus } from "./flexStatusRules.js";
import {
  cleanManualValue,
  manualFieldCarryForwardService,
} from "./manualFieldCarryForwardService.js";
import { validateReportGenerationTransaction } from "./reportGenerationValidation.js";
import { calculateWipAging } from "../compareService/wipAgingCalculator.js";

function countDuplicateTickets(rows: readonly GeneratedDailyCallPlanRow[]): number {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const ticketId = String(row.output["Ticket ID"] ?? "").trim();

    if (!ticketId) {
      continue;
    }

    counts.set(ticketId, (counts.get(ticketId) ?? 0) + 1);
  }
  return Array.from(counts.values()).filter((count) => count > 1).length;
}

function countUnmatchedRows(
  rows: readonly GeneratedDailyCallPlanRow[],
): number {
  const unmatchedStatuses: ReadonlySet<MatchStatus> = new Set([
    "RENDERWAYS_MISSING",
    "FLEX_MISSING",
    "CALLPLAN_MISSING",
    "BOTH_MISSING",
  ]);

  return rows.filter((row) =>
    !row.carryForward.closedSyntheticRow &&
    unmatchedStatuses.has(row.enriched.match_status),
  ).length;
}

function initialCarryForwardMetadata(): ManualCarryForwardRowMetadata {
  return {
    carriedForwardFields: [],
    manualFieldsCompleted: false,
    manualFieldsMissing: [...MANUAL_CARRY_FORWARD_FIELDS],
    changeType: null,
    previousTicketMatched: false,
    closedSyntheticRow: false,
  };
}

const ASP_CODE_REGION_MAP: Record<string, string> = {
  ASPS01461: "CHENNAI",
  ASPS01463: "VELLORE",
  ASPS01465: "SALEM",
  ASPS01489: "KANCHIPURAM",
  ASPS01511: "HOSUR",
};

function getOtcSortWeight(code: string): number {
  const normalized = code.trim().toUpperCase();
  if (normalized.includes("TRADE")) {
    return 6;
  }
  if (normalized.startsWith("05F") || normalized.startsWith("O5F")) {
    return 1;
  }
  if (normalized.startsWith("05K") || normalized.startsWith("O5K")) {
    return 2;
  }
  if (normalized.startsWith("02N") || normalized.startsWith("O2N")) {
    return 3;
  }
  if (normalized.startsWith("00C") || normalized.startsWith("OOC")) {
    return 4;
  }
  return 5;
}

function computeRegionBreakdown(
  rows: readonly GeneratedDailyCallPlanRow[],
): import("../../types/reportGeneration.js").RegionBreakdownEntry[] {
  const regionMap = new Map<string, { count: number; closedCount: number; woOtcCodes: Map<string, number> }>();

  for (const row of rows) {
    let aspCode = (row.enriched.work_location || "").trim().toUpperCase();
    if (!aspCode) {
      aspCode = "UNKNOWN";
    }

    let woCode = (row.enriched.wo_otc_code || "").trim();
    if (!woCode) {
      woCode = "Unspecified";
    }

    let regionData = regionMap.get(aspCode);
    if (!regionData) {
      regionData = { count: 0, closedCount: 0, woOtcCodes: new Map() };
      regionMap.set(aspCode, regionData);
    }

    if (row.carryForward.closedSyntheticRow) {
      regionData.closedCount++;
      continue;
    }

    regionData.count++;
    regionData.woOtcCodes.set(woCode, (regionData.woOtcCodes.get(woCode) ?? 0) + 1);
  }

  const breakdown = Array.from(regionMap.entries()).map(([aspCode, data]) => {
    const woOtcCodeBreakdown = Array.from(data.woOtcCodes.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => {
        const weightA = getOtcSortWeight(a.code);
        const weightB = getOtcSortWeight(b.code);
        if (weightA !== weightB) {
          return weightA - weightB;
        }
        return a.code.localeCompare(b.code);
      });

    return {
      aspCode,
      regionName: ASP_CODE_REGION_MAP[aspCode] ?? "Unknown Region",
      count: data.count,
      closedCount: data.closedCount,
      woOtcCodeBreakdown,
    };
  });

  // Sort descending by count, then alphabetically by region name
  breakdown.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.regionName.localeCompare(b.regionName);
  });

  return breakdown;
}

function toComparableReportRow(
  row: GeneratedDailyCallPlanRow,
): ComparableReportRow {
  return {
    rowNumber: row.serialNo,
    ticketId: row.enriched.ticket_id,
    flexStatus: row.enriched.flex_status,
    rtplStatus: row.enriched.rtpl_status,
    wipAging: row.enriched.wip_aging,
    wipAgingCategory: row.enriched.wip_aging_category,
    tat: row.enriched.tat,
    engineer: row.enriched.engineer,
    location: row.enriched.location,
  };
}

function skippedComparisonMetadata(
  currentSessionId: string,
): GeneratedReportComparisonMetadata {
  return {
    skipped: true,
    reason: "NO_PREVIOUS_REPORT",
    currentSessionId,
    previousSessionId: null,
    summary: null,
    duplicateTicketIds: {
      current: [],
      previous: [],
    },
  };
}

function applyComparisonToGeneratedRows(
  rows: GeneratedDailyCallPlanRow[],
  comparison: ReturnType<typeof buildReportComparison>,
): void {
  const insightByRowNumber = new Map(
    comparison.rowDiffs
      .filter((diff) => diff.currentRow)
      .map((diff) => [diff.currentRow!.rowNumber, diff.insight]),
  );

  for (const row of rows) {
    row.comparison = insightByRowNumber.get(row.serialNo) ?? row.comparison;
  }
}

function activeRowsForComparison(
  rows: readonly GeneratedDailyCallPlanRow[],
): GeneratedDailyCallPlanRow[] {
  return rows.filter((row) => !row.carryForward.closedSyntheticRow);
}

function isTodayCallPlanRow(row: GeneratedDailyCallPlanRow): boolean {
  return !isRequestToCancelFlexStatus(row.enriched.flex_status);
}

function caseCreatedTimeRank(value: string | null): number {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

function reserialiseRows(
  rows: readonly GeneratedDailyCallPlanRow[],
): GeneratedDailyCallPlanRow[] {
  return rows.map((row, index) => {
    const serialNo = index + 1;

    return {
      ...row,
      serialNo,
      output: orderedDailyCallPlanRow({
        ...formatDailyCallPlanRow(serialNo, row.enriched),
        ...row.output,
        "S.no": serialNo,
      }),
    };
  });
}

function summarizeCarryForward(
  rows: readonly GeneratedDailyCallPlanRow[],
): ManualCarryForwardSummary {
  return rows.reduce(
    (summary, row) => {
      summary.totalFieldsCarried += row.carryForward.carriedForwardFields.length;

      if (row.carryForward.manualFieldsMissing.length > 0) {
        summary.rowsStillManual += 1;
      } else if (row.carryForward.carriedForwardFields.length > 0) {
        summary.rowsAutoCompleted += 1;
      }

      return summary;
    },
    {
      totalFieldsCarried: 0,
      rowsAutoCompleted: 0,
      rowsStillManual: 0,
    },
  );
}

function getRenderwaysWipAging(row: GeneratedDailyCallPlanRow): string | null {
  const value = row.match.renderways?.wipAging;

  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  return value;
}

function countMissingRtplRows(rows: readonly GeneratedDailyCallPlanRow[]): number {
  return rows.filter(
    (row) =>
      !row.carryForward.closedSyntheticRow &&
      !cleanManualValue(row.enriched.rtpl_status),
  ).length;
}

function manualFieldValue(
  row: GeneratedDailyCallPlanRow,
  field: ManualCarryForwardField,
): string | null {
  const value = row.enriched[field];
  return value === null || value === undefined ? null : String(value);
}

function setManualFieldValue(
  row: GeneratedDailyCallPlanRow,
  field: ManualCarryForwardField,
  value: string | null,
): void {
  switch (field) {
    case "rtpl_status":
      row.enriched.rtpl_status = value ?? "";
      return;
    case "segment":
      row.enriched.segment = value ?? "";
      return;
    case "engineer":
      row.enriched.engineer = value;
      return;
    case "location":
      row.enriched.location = value;
      return;
    case "case_created_time":
      row.enriched.case_created_time = value;
      return;
    case "hp_owner_status":
      row.enriched.hp_owner_status = value;
      return;
    case "customer_mail":
      row.enriched.customer_mail = value;
      return;
    case "rca":
      row.enriched.rca = value;
      return;
    case "remarks":
      row.enriched.remarks = value;
      return;
    case "manual_notes":
      row.enriched.manual_notes = value;
      return;
  }
}

function persistedManualFieldValue(
  persisted: Awaited<
    ReturnType<typeof findDailyCallPlanReportRowMetadataByReportId>
  >[number],
  field: ManualCarryForwardField,
): string | null {
  switch (field) {
    case "rtpl_status":
      return persisted.rtplStatus;
    case "segment":
      return persisted.segment;
    case "engineer":
      return persisted.engineer;
    case "location":
      return persisted.location;
    case "case_created_time":
      return persisted.caseCreatedTime;
    case "hp_owner_status":
      return persisted.hpOwnerStatus;
    case "customer_mail":
      return persisted.customerMail;
    case "rca":
      return persisted.rca;
    case "remarks":
      return persisted.remarks;
    case "manual_notes":
      return persisted.manualNotes;
  }
}

function applyPreviousComparisonRtplFallback(
  row: GeneratedDailyCallPlanRow,
  carriedForwardFields: Set<ManualCarryForwardField>,
): boolean {
  if (cleanManualValue(row.enriched.rtpl_status)) {
    return false;
  }

  const previousRtplStatus = cleanManualValue(row.comparison?.previousRtplStatus);
  if (!previousRtplStatus) {
    return false;
  }

  row.enriched.rtpl_status = previousRtplStatus;
  carriedForwardFields.add("rtpl_status");
  row.carryForward.previousTicketMatched = true;
  row.carryForward.changeType ??= "CARRIED";
  return true;
}

function refreshCarryForwardMetadata(row: GeneratedDailyCallPlanRow): void {
  row.carryForward.manualFieldsMissing = MANUAL_CARRY_FORWARD_FIELDS.filter(
    (field) => !cleanManualValue(row.enriched[field]),
  );
  row.carryForward.manualFieldsCompleted =
    row.carryForward.manualFieldsMissing.length === 0;
}

function applyComparisonRtplFallbackToRows(
  rows: GeneratedDailyCallPlanRow[],
): number {
  let fallbackCount = 0;

  for (const row of rows) {
    const carriedForwardFields = new Set<ManualCarryForwardField>(
      row.carryForward.carriedForwardFields,
    );

    if (!applyPreviousComparisonRtplFallback(row, carriedForwardFields)) {
      continue;
    }

    row.carryForward.carriedForwardFields = [...carriedForwardFields];
    refreshCarryForwardMetadata(row);
    row.match.enrichedRow = row.enriched;
    row.output = orderedDailyCallPlanRow(
      formatDailyCallPlanRow(row.serialNo, row.enriched),
    );
    fallbackCount += 1;
  }

  return fallbackCount;
}

async function applyPersistedRowMetadata(
  client: Parameters<typeof findDailyCallPlanReportRowMetadataByReportId>[0],
  reportId: string,
  rows: GeneratedDailyCallPlanRow[],
): Promise<void> {
  const metadata = await findDailyCallPlanReportRowMetadataByReportId(
    client,
    reportId,
  );
  const metadataByTicket = new Map(
    metadata.map((row) => [getNormalizedTicketKey(row.ticketId), row]),
  );

  for (const row of rows) {
    const ticketKey = getNormalizedTicketKey(row.enriched.ticket_id);
    const persisted = metadataByTicket.get(ticketKey);

    if (!persisted) {
      continue;
    }

    row.id = persisted.id;
    row.updatedAt = persisted.updatedAt;
    row.updatedBy = persisted.updatedBy;
    row.enriched.wip_aging = persisted.wipAging;
    const carriedForwardFields = new Set<ManualCarryForwardField>(
      persisted.carriedForwardFields,
    );
    const repairedFields: ManualCarryForwardField[] = [];

    for (const field of [
      ...MANUAL_CARRY_FORWARD_FIELDS,
      "remarks",
      "manual_notes",
    ] as const) {
      const persistedValue = persistedManualFieldValue(persisted, field);
      const generatedValue = manualFieldValue(row, field);

      if (cleanManualValue(persistedValue)) {
        setManualFieldValue(row, field, persistedValue);
        continue;
      }

      if (cleanManualValue(generatedValue)) {
        setManualFieldValue(row, field, generatedValue);
        if (row.carryForward.carriedForwardFields.includes(field)) {
          repairedFields.push(field);
          carriedForwardFields.add(field);
        }
        continue;
      }

      setManualFieldValue(row, field, persistedValue);
      carriedForwardFields.delete(field);
    }

    if (applyPreviousComparisonRtplFallback(row, carriedForwardFields)) {
      repairedFields.push("rtpl_status");
    }

    row.match.enrichedRow = row.enriched;
    row.carryForward.carriedForwardFields = [...carriedForwardFields];
    refreshCarryForwardMetadata(row);
    row.output = orderedDailyCallPlanRow(
      formatDailyCallPlanRow(row.serialNo, row.enriched),
    );

    if (repairedFields.length > 0) {
      await backfillMissingDailyCallPlanReportRowCarryForward(client, {
        rowId: persisted.id,
        rtplStatus: row.enriched.rtpl_status,
        segment: row.enriched.segment,
        engineer: row.enriched.engineer,
        location: row.enriched.location,
        caseCreatedTime: row.enriched.case_created_time,
        hpOwnerStatus: row.enriched.hp_owner_status,
        customerMail: row.enriched.customer_mail,
        rca: row.enriched.rca,
        remarks: row.enriched.remarks,
        manualNotes: row.enriched.manual_notes,
        carriedForwardFields: row.carryForward.carriedForwardFields,
        manualFieldsCompleted: row.carryForward.manualFieldsCompleted,
        manualFieldsMissing: row.carryForward.manualFieldsMissing,
      });
    }
  }
}

function metadataFromComparison(
  comparison: ReturnType<typeof buildReportComparison>,
): GeneratedReportComparisonMetadata {
  return {
    skipped: false,
    reason: null,
    currentSessionId: comparison.currentSessionId,
    previousSessionId: comparison.previousSessionId,
    summary: comparison.summary,
    duplicateTicketIds: comparison.duplicateTicketIds,
  };
}

function assertNoResidualDuplicates(
  label: string,
  rows: Parameters<typeof dedupeRowsByTicket>[0],
): void {
  const duplicateTicketKeys = findDuplicateTicketKeys(rows);

  if (duplicateTicketKeys.length > 0) {
    throw unprocessableEntity(`Duplicate ticket IDs remain after ${label} dedupe`, {
      duplicateTicketKeys,
    });
  }
}

export async function generateDailyCallPlanReport(
  input: GenerateDailyCallPlanInput,
): Promise<GeneratedDailyCallPlanReport> {
  return withTransaction(async (client) => {
    const existingReportId = await validateReportGenerationTransaction(client, input);

    const flexWip = await findFlexWipRecordsByBatchId(
      client,
      input.flexUploadBatchId,
    );
    const renderways = input.renderwaysUploadBatchId
      ? await findRenderwaysRecordsByBatchId(
          client,
          input.renderwaysUploadBatchId,
        )
      : [];
    const callPlan = input.callPlanUploadBatchId
      ? await findCallPlanRecordsByBatchId(
          client,
          input.callPlanUploadBatchId,
        )
      : [];

    if (flexWip.length === 0) {
      throw unprocessableEntity("Flex WIP batch has no persisted rows", {
        flexRows: flexWip.length,
      });
    }

    const dedupedFlexWip = dedupeRowsByTicket(flexWip);
    const dedupedRenderways = dedupeRowsByTicket(renderways);
    const dedupedCallPlan = dedupeRowsByTicket(callPlan);

    assertNoResidualDuplicates("Flex WIP", dedupedFlexWip.dedupedRows);
    assertNoResidualDuplicates("Renderways", dedupedRenderways.dedupedRows);
    assertNoResidualDuplicates("Call Plan", dedupedCallPlan.dedupedRows);

    const duplicateTracking: DuplicateTrackingSummary = {
      flexWip: dedupedFlexWip.duplicateCount,
      renderways: dedupedRenderways.duplicateCount,
      callPlan: dedupedCallPlan.duplicateCount,
      total:
        dedupedFlexWip.duplicateCount +
        dedupedRenderways.duplicateCount +
        dedupedCallPlan.duplicateCount,
    };

    if (duplicateTracking.total > 0) {
      console.info("[dailyCallPlanGenerator] Removed duplicate rows before matching", duplicateTracking);
    }

    const slaHoursByWipAgingCategory = await findActiveSlaHoursByCategory(client);
    const areaNameByPincode = await findAreaNameByPincode(
      client,
      input.regionId,
    );
    const matches = matchSourceRecords({
      flexWip: dedupedFlexWip.dedupedRows,
      renderways: dedupedRenderways.dedupedRows,
      callPlan: dedupedCallPlan.dedupedRows,
      slaHoursByWipAgingCategory,
      areaNameByPincode,
    });
    const matchedMatches = matches.filter((match) => match.flexWip !== null);
    
    matchedMatches.sort((a, b) => {
      const createdDelta =
        caseCreatedTimeRank(a.enrichedRow.case_created_time) -
        caseCreatedTimeRank(b.enrichedRow.case_created_time);

      if (createdDelta !== 0) {
        return createdDelta;
      }

      return a.enrichedRow.ticket_id.localeCompare(b.enrichedRow.ticket_id);
    });

    const generatedRows = matchedMatches.map<GeneratedDailyCallPlanRow>((match, index) => {
      const serialNo = index + 1;

      return {
        id: null,
        serialNo,
        enriched: match.enrichedRow,
        match,
        comparison: null,
        carryForward: initialCarryForwardMetadata(),
        updatedAt: null,
        updatedBy: null,
        rowEditable: true,
        carryForwardSource: "PREVIOUS_FINAL_REPORT",
        output: orderedDailyCallPlanRow(
          formatDailyCallPlanRow(serialNo, match.enrichedRow),
        ),
      };
    });
    const previousFinalRows =
      await findPreviousFinalReportRowsForManualCarryForward(client, {
        reportDate: input.reportDate,
        regionId: input.regionId,
      });
    const carryForwardResult = manualFieldCarryForwardService.apply({
      currentRows: generatedRows,
      previousFinalRows,
    });
    const rows = reserialiseRows(carryForwardResult.rows.filter(isTodayCallPlanRow));
    console.info("[dailyCallPlanGenerator] RTPL carry-forward input", {
      reportDate: input.reportDate,
      regionId: input.regionId,
      previousFinalRows: previousFinalRows.length,
      generatedRows: generatedRows.length,
      rowsAfterCarryForward: rows.length,
      totalFieldsCarried: carryForwardResult.summary.totalFieldsCarried,
      missingRtplAfterCarryForward: countMissingRtplRows(rows),
    });
    const carryForwardSummary = summarizeCarryForward(rows);
    const duplicateTicketCount = countDuplicateTickets(rows);
    const unmatchedTicketCount = countUnmatchedRows(rows);
    
    let reportId = existingReportId;
    if (!reportId) {
      reportId = await createDailyCallPlanReport(client, input, {
        totalRows: rows.length,
        duplicateTicketCount,
        unmatchedTicketCount,
      });
    }

    const historySession = await findOrCreateCompletedHistorySessionForReport(
      client,
      {
        userId: input.generatedBy,
        title: `Report Session ${input.reportDate}`,
        regionId: input.regionId,
        flexUploadBatchId: input.flexUploadBatchId,
        renderwaysUploadBatchId: input.renderwaysUploadBatchId ?? null,
        callPlanUploadBatchId: input.callPlanUploadBatchId ?? null,
        dailyCallPlanReportId: reportId,
        totalRows: rows.length,
      },
    );
    let comparison: GeneratedReportComparisonMetadata;

    const previousSession = await findPreviousCompletedComparisonSession(
      client,
      historySession.id,
    );

    if (!previousSession) {
      comparison = skippedComparisonMetadata(historySession.id);
    } else {
      const previousRows = await findComparableReportRowsBySessionId(
        client,
        previousSession.id,
      );
      const reportComparison = buildReportComparison({
        currentSessionId: historySession.id,
        previousSessionId: previousSession.id,
        currentRows: activeRowsForComparison(rows).map(toComparableReportRow),
        previousRows,
      });

      applyComparisonToGeneratedRows(rows, reportComparison);
      const comparisonRtplFallbackCount = applyComparisonRtplFallbackToRows(rows);
      console.info("[dailyCallPlanGenerator] RTPL comparison fallback", {
        reportDate: input.reportDate,
        regionId: input.regionId,
        previousSessionId: previousSession.id,
        comparisonRtplFallbackCount,
        missingRtplAfterComparisonFallback: countMissingRtplRows(rows),
      });
      if (!existingReportId) {
        await replaceReportComparison(client, {
          currentSessionId: reportComparison.currentSessionId,
          previousSessionId: reportComparison.previousSessionId,
          summary: reportComparison.summary,
          rowDiffs: reportComparison.rowDiffs.map((diff) => ({
            ticketId: diff.ticketId,
            changeType: diff.changeType,
            changedFields: diff.changedFields,
          })),
        });
      }
      comparison = metadataFromComparison(reportComparison);
    }

    // Prefer Renderways WIP Aging when uploaded; otherwise calculate from case_created_time.
    const reportNow = new Date();
    const updateAging = () => {
      for (const row of rows) {
        const renderwaysWipAging = getRenderwaysWipAging(row);

        if (renderwaysWipAging !== null) {
          row.enriched.wip_aging = renderwaysWipAging;
          row.output["WIP aging"] = renderwaysWipAging;
          continue;
        }

        const computed = calculateWipAging(row.enriched.case_created_time, reportNow);
        if (computed !== null) {
          row.enriched.wip_aging = computed;
          row.output["WIP aging"] = computed;
        }
      }
    };

    if (!existingReportId) {
      updateAging();
      await insertDailyCallPlanReportRows(client, reportId, rows);
    } else {
      await applyPersistedRowMetadata(client, reportId, rows);
      console.info("[dailyCallPlanGenerator] RTPL persisted metadata applied", {
        reportDate: input.reportDate,
        regionId: input.regionId,
        reportId,
        missingRtplAfterPersistedMetadata: countMissingRtplRows(rows),
      });
      // Recalculate again after applying metadata to ensure aging is up-to-date
      // and accounts for any manually updated case_created_time.
      updateAging();
    }

    return {
      reportId: reportId as string,
      sessionId: historySession.id,
      reportDate: input.reportDate,
      columns: DAILY_CALL_PLAN_COLUMNS,
      totalRows: rows.length,
      duplicateTicketCount,
      unmatchedTicketCount,
      duplicateTracking,
      carryForward: carryForwardSummary,
      comparison,
      regionBreakdown: computeRegionBreakdown(rows),
      rows,
    };
  });
}
