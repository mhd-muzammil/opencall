"use client";

import { DAILY_CALL_PLAN_COLUMNS, RTPL_STATUS_OPTIONS } from "@opencall/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { ColumnFilterDropdown } from "../components/ColumnFilterDropdown";
import { AppHeader } from "../components/AppHeader";
import { HistoryDrawer } from "../components/HistoryDrawer";
import { MetricsGrid, type MetricsGridItem } from "../components/MetricsGrid";
import { StatusPill } from "../components/StatusPill";
import { UploadDrawer } from "../components/UploadDrawer";
import { useColumnFilters } from "../lib/useColumnFilters";
import {
  FILTERABLE_COLUMNS,
  type WipAgingSortDirection,
} from "../lib/columnFilter";
import {
  generateReport,
  getDatabaseHealth,
  getRuntimeHealth,
  login,
  previewMatches,
  updateReportRow,
  uploadReports,
  type DatabaseHealthResponse,
  type EditedReportRowResponse,
  type GeneratedReportResponse,
  type LoginResponse,
  type MatchPreviewResponse,
  type RuntimeHealthResponse,
  type UploadBatch,
  type UploadResponse,
  type ReportHistorySession,
  getReportHistory,
  getReportHistoryById,
  renameReportHistory,
  deleteReportHistory,
} from "../lib/apiClient";
import { LoginScreen, SessionLoadingScreen } from "../features/auth/LoginScreen";
import { downloadReportAsXlsx, downloadReportAsExcel } from "../lib/excelExport";
import {
  ALL_REGIONS_FILTER,
  buildFlexOperationalAnalytics,
  buildOverallWoOtcBreakdown,
  buildRtplOperationalAnalytics,
  filterRowsByRegion,
  isTodayCallPlanVisibleRow,
  reportWithRows,
} from "../lib/reportDashboardAnalytics";

type SourceKey = "FLEX_WIP" | "RENDERWAYS" | "CALL_PLAN";
type FileField = "flexWipReport" | "renderwaysReport" | "callPlan";
type ChangeType = "NEW" | "CLOSED" | "CARRIED" | "UPDATED";
type ReportRow = GeneratedReportResponse["rows"][number];
type PrintCaseFilter = "all" | "installation" | "fix";
type ManualCarryForwardField =
  | "rtpl_status"
  | "segment"
  | "engineer"
  | "location"
  | "case_created_time"
  | "hp_owner_status"
  | "customer_mail"
  | "rca";

const SOURCE_LABELS: Record<SourceKey, string> = {
  FLEX_WIP: "Flex WIP",
  RENDERWAYS: "Renderways",
  CALL_PLAN: "Call Plan",
};

const FILE_FIELDS: Array<{
  field: FileField;
  source: SourceKey;
  label: string;
  required: boolean;
  multiple?: boolean;
}> = [
  { field: "flexWipReport", source: "FLEX_WIP", label: "Flex WIP Report", required: true },
  { field: "renderwaysReport", source: "RENDERWAYS", label: "Renderways / RTPL Report", required: false },
  { field: "callPlan", source: "CALL_PLAN", label: "Call Plan Reports", required: false, multiple: true },
];

const MANUAL_ENTRY_REQUIRED = "Manual Entry Required";
const CISS_PRODUCT_LINE = "CISS";
const PC_SEGMENT = "PC";
const PRINT_SEGMENT = "Print";
const PRINT_INSTALLATION_WO_OTC_CODE = "05F";
const TRADE_WO_OTC_CODE_KEYWORD = "TRADE";
const LAST_HISTORY_SESSION_KEY = "opencall.lastHistorySessionId";

const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  NEW: "New",
  CLOSED: "Closed",
  UPDATED: "Updated",
  CARRIED: "Carried",
};

const CHANGE_FIELD_LABELS: Record<string, string> = {
  flex_status: "Flex Status",
  rtpl_status: "RTPL status",
  wip_aging: "WIP aging",
  wip_aging_category: "WIP Aging Category",
  tat: "TAT",
  engineer: "Engineer",
  location: "Location",
  hp_owner_status: "HP Owner Status",
};

function isTradeCase(row: GeneratedReportResponse["rows"][number]): boolean {
  return normalizeWoOtcCode(row.output["WO OTC CODE"]).includes(TRADE_WO_OTC_CODE_KEYWORD);
}

function isCissCase(row: GeneratedReportResponse["rows"][number]): boolean {
  if (isTradeCase(row)) {
    return false;
  }
  return String(row.output["Product Line Name"] ?? "")
    .trim()
    .toUpperCase()
    .includes(CISS_PRODUCT_LINE);
}

function isSegmentCase(
  row: GeneratedReportResponse["rows"][number],
  segment: string,
): boolean {
  return String(row.output.Segment ?? "").trim().toLowerCase() === segment.toLowerCase();
}

function parseWipAgingValue(value: unknown): number | null {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function sortRowsByWipAging(
  rows: readonly ReportRow[],
  direction: WipAgingSortDirection | null,
): ReportRow[] {
  if (!direction) {
    return [...rows];
  }

  return [...rows].sort((a, b) => {
    const aValue = parseWipAgingValue(a.output["WIP aging"]);
    const bValue = parseWipAgingValue(b.output["WIP aging"]);

    if (aValue !== null && bValue !== null) {
      return direction === "lowToHigh" ? aValue - bValue : bValue - aValue;
    }

    if (aValue !== null) return -1;
    if (bValue !== null) return 1;

    return a.serialNo - b.serialNo;
  });
}

function normalizeWoOtcCode(value: string | number | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[–—−]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ");
}

function getWoOtcCodePrefix(value: string | number | null | undefined): string {
  return normalizeWoOtcCode(value).match(/^[A-Z0-9]+/)?.[0] ?? "";
}

function isPrintInstallationCase(row: GeneratedReportResponse["rows"][number]): boolean {
  return getWoOtcCodePrefix(row.output["WO OTC CODE"]) === PRINT_INSTALLATION_WO_OTC_CODE;
}

function isPrintCase(row: GeneratedReportResponse["rows"][number]): boolean {
  return isSegmentCase(row, PRINT_SEGMENT) || isPrintInstallationCase(row);
}

function isPrintFixCase(row: GeneratedReportResponse["rows"][number]): boolean {
  return isPrintCase(row) && !isPrintInstallationCase(row);
}

function isRcaCase(row: GeneratedReportResponse["rows"][number]): boolean {
  const rca = String(row.output.RCA ?? "").trim();

  return rca.length > 0 && rca !== MANUAL_ENTRY_REQUIRED;
}

const MANUAL_FIELD_BY_COLUMN: Partial<Record<string, ManualCarryForwardField>> = {
  "RTPL status": "rtpl_status",
  Segment: "segment",
  Engineer: "engineer",
  Location: "location",
  "Case Created Time": "case_created_time",
  "HP Owner Status": "hp_owner_status",
  "Customer Mail": "customer_mail",
  RCA: "rca",
};

const MANUAL_FIELD_LABELS: Record<ManualCarryForwardField, string> = {
  rtpl_status: "RTPL status",
  segment: "Segment",
  engineer: "Engineer",
  location: "Location",
  case_created_time: "Case Created Time",
  hp_owner_status: "HP Owner Status",
  customer_mail: "Customer Mail",
  rca: "RCA",
};

const EDITABLE_COLUMN_API_FIELD: Partial<Record<string, string>> = {
  "RTPL status": "rtpl_status",
  Segment: "segment",
  Engineer: "engineer",
  Location: "location",
  "Case Created Time": "case_created_time",
  "HP Owner Status": "hp_owner_status",
  "Customer Mail": "customer_mail",
  RCA: "rca",
};

type ReportRowPatchValues = Parameters<typeof updateReportRow>[0]["values"];

const EDITED_RESPONSE_COLUMN: Partial<
  Record<string, keyof Pick<
    EditedReportRowResponse,
    | "rtplStatus"
    | "segment"
    | "engineer"
    | "location"
    | "caseCreatedTime"
    | "hpOwnerStatus"
    | "customerMail"
    | "rca"
  >>
> = {
  "RTPL status": "rtplStatus",
  Segment: "segment",
  Engineer: "engineer",
  Location: "location",
  "Case Created Time": "caseCreatedTime",
  "HP Owner Status": "hpOwnerStatus",
  "Customer Mail": "customerMail",
  RCA: "rca",
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDisplayDateTime(value: string | number | null | undefined): string | number {
  if (value === null || value === undefined || value === "") {
    return MANUAL_ENTRY_REQUIRED;
  }

  if (typeof value === "number") {
    return value;
  }

  const normalizedValue = value.includes(" ") && /[+-]\d{2}:?\d{2}$/.test(value)
    ? value.replace(" ", "T")
    : value;
  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const partValue = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hour = pad2(Number(partValue("hour")));
  const dayPeriod = partValue("dayPeriod").toUpperCase();

  return `${partValue("day")}-${partValue("month")}-${partValue("year")} ${hour}:${partValue("minute")}:${partValue("second")} ${dayPeriod}`;
}

function parseEditableDateTime(value: string): number {
  const displayDateTime = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(value.trim());

  if (displayDateTime) {
    const [, day, month, year, hour, minute, second = "0", meridiem] = displayDateTime;
    let normalizedHour = Number(hour);
    const normalizedMeridiem = String(meridiem).toUpperCase();

    if (normalizedMeridiem === "AM" && normalizedHour === 12) {
      normalizedHour = 0;
    } else if (normalizedMeridiem === "PM" && normalizedHour < 12) {
      normalizedHour += 12;
    }

    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      normalizedHour,
      Number(minute),
      Number(second),
    ).getTime();
  }

  return Date.parse(value);
}

function batchIdBySource(
  batches: readonly UploadBatch[],
  sourceType: SourceKey,
): string {
  return batches.find((batch) => batch.sourceType === sourceType)?.id ?? "";
}

function Metric({
  label,
  value,
  onClick,
  isActive,
}: Readonly<{
  label: string;
  value: string | number;
  onClick?: () => void;
  isActive?: boolean;
}>) {
  const displayValue = typeof value === "number" ? formatNumber(value) : value;

  return (
    <div
      className="metric"
      onClick={onClick}
      style={
        onClick
          ? {
              cursor: "pointer",
              borderColor: isActive ? "var(--accent)" : undefined,
              background: isActive ? "var(--surface-subtle)" : undefined,
            }
          : undefined
      }
      role={onClick ? "button" : undefined}
    >
      <span>{label}</span>
      <strong>{displayValue}</strong>
    </div>
  );
}

function OverviewStat({
  label,
  value,
  detail,
  tone = "accent",
  onClick,
  isActive,
}: Readonly<{
  label: string;
  value: number;
  detail: string;
  tone?: "accent" | "blue" | "warn" | "danger";
  onClick?: () => void;
  isActive?: boolean;
}>) {
  return (
    <div
      className={`overviewStat ${tone} ${isActive ? "active" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
      <small>{detail}</small>
    </div>
  );
}

function formatComparisonValue(value: string | null): string {
  return value === null || value.trim() === "" ? "blank" : value;
}

function formatFieldList(fields: readonly string[]): string {
  if (fields.length === 0) {
    return "None";
  }

  return fields
    .map((field) => MANUAL_FIELD_LABELS[field as ManualCarryForwardField] ?? field)
    .join(", ");
}

function countManualRequiredCells(rows: readonly ReportRow[]): number {
  return rows.reduce((count, row) => {
    const outputMissingCount = Object.values(row.output).filter(
      (value) => value === MANUAL_ENTRY_REQUIRED,
    ).length;
    return count + Math.max(outputMissingCount, row.carryForward.manualFieldsMissing.length);
  }, 0);
}

function normalizeRecordSearchValue(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function rowMatchesRecordSearch(row: ReportRow, query: string): boolean {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) {
    return true;
  }

  const searchableText = [
    row.serialNo,
    row.comparison?.changeType,
    ...DAILY_CALL_PLAN_COLUMNS.flatMap((column) => [
      column,
      row.output[column],
    ]),
    ...row.carryForward.carriedForwardFields,
    ...row.carryForward.manualFieldsMissing,
  ]
    .map(normalizeRecordSearchValue)
    .join(" ");

  return terms.every((term) => searchableText.includes(term));
}

function ChangeTypeBadge({
  comparison,
}: Readonly<{
  comparison: GeneratedReportResponse["rows"][number]["comparison"];
}>) {
  const changeType = comparison?.changeType;

  if (!changeType) {
    return <span className="changeBadge none">Not compared</span>;
  }

  const entries = Object.entries(comparison.changedFields);

  return (
    <span className="changeTooltipWrap" tabIndex={0}>
      <span className={`changeBadge ${changeType.toLowerCase()}`}>
        {CHANGE_TYPE_LABELS[changeType]}
      </span>
      <span className="changeTooltip" role="tooltip">
        <strong>{comparison.changeSummary ?? CHANGE_TYPE_LABELS[changeType]}</strong>
        {entries.length > 0 ? (
          <span className="changeTooltipList">
            {entries.map(([field, change]) => (
              <span key={field}>
                <b>{CHANGE_FIELD_LABELS[field] ?? field}</b>
                <span>
                  {formatComparisonValue(change.from)} → {formatComparisonValue(change.to)}
                </span>
              </span>
            ))}
          </span>
        ) : (
          <span className="changeTooltipMuted">
            {changeType === "NEW"
              ? "No previous row"
              : changeType === "CLOSED"
                ? "Not present in current report table"
                : "No field changes"}
          </span>
        )}
        {comparison.previousFlexStatus || comparison.previousRtplStatus || comparison.previousWipAging ? (
          <span className="changeTooltipPrevious">
            Prev Flex: {formatComparisonValue(comparison.previousFlexStatus)}
            {" · "}
            Prev RTPL: {formatComparisonValue(comparison.previousRtplStatus)}
            {" · "}
            Prev WIP: {formatComparisonValue(comparison.previousWipAging)}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function CarryForwardBadge({
  carryForward,
}: Readonly<{
  carryForward: GeneratedReportResponse["rows"][number]["carryForward"];
}>) {
  if (carryForward.closedSyntheticRow) {
    return (
      <span
        className="opsBadge closed"
        title="Closed work order carried from the previous final report"
      >
        Closed
      </span>
    );
  }

  if (carryForward.carriedForwardFields.length > 0) {
    return (
      <span
        className="opsBadge carried"
        title={`Value carried from previous day: ${formatFieldList(carryForward.carriedForwardFields)}`}
      >
        Carried
      </span>
    );
  }

  if (carryForward.changeType === "NEW_WORK_ORDER") {
    return (
      <span
        className="opsBadge new"
        title="New work order; manual fields must be completed today"
      >
        New WO
      </span>
    );
  }

  if (carryForward.manualFieldsMissing.length > 0) {
    return (
      <span
        className="opsBadge manual"
        title={`Manual entry required: ${formatFieldList(carryForward.manualFieldsMissing)}`}
      >
        Manual
      </span>
    );
  }

  return (
    <span className="opsBadge complete" title="Manual fields are complete">
      Complete
    </span>
  );
}

function CarryForwardSummaryPanel({
  report,
}: Readonly<{
  report: GeneratedReportResponse;
}>) {
  return (
    <div className="carryForwardPanel">
      <div className="comparisonPanelHeader">
        <div>
          <h3>Manual Field Carry-Forward</h3>
          <p>Uses the previous final human-edited report for this region.</p>
        </div>
        <StatusPill tone={report.carryForward.totalFieldsCarried > 0 ? "good" : "neutral"}>
          {report.carryForward.totalFieldsCarried > 0 ? "Applied" : "No carried fields"}
        </StatusPill>
      </div>
      <div className="comparisonMetricGrid">
        <Metric label="Fields Carried" value={report.carryForward.totalFieldsCarried} />
        <Metric label="Rows Auto Completed" value={report.carryForward.rowsAutoCompleted} />
        <Metric label="Rows Still Manual" value={report.carryForward.rowsStillManual} />
        <Metric
          label="Closed Rows"
          value={report.rows.filter((row) => row.carryForward.closedSyntheticRow).length}
        />
      </div>
    </div>
  );
}

function ComparisonSummaryPanel({
  report,
}: Readonly<{
  report: GeneratedReportResponse;
}>) {
  if (report.comparison.skipped || !report.comparison.summary) {
    return (
      <div className="comparisonPanel skipped">
        <div>
          <h3>Day-over-Day Comparison</h3>
          <p>No previous-day final report was available for this region.</p>
        </div>
        <StatusPill tone="neutral">Skipped</StatusPill>
      </div>
    );
  }

  const summary = report.comparison.summary;

  return (
    <div className="comparisonPanel">
      <div className="comparisonPanelHeader">
        <div>
          <h3>Day-over-Day Comparison</h3>
          <p>Compared with session {report.comparison.previousSessionId}</p>
        </div>
        <StatusPill tone="good">Compared</StatusPill>
      </div>
      <div className="comparisonMetricGrid">
        <Metric label="New" value={summary.new_count} />
        <Metric label="Closed" value={summary.closed_count} />
        <Metric label="Updated" value={summary.updated_count} />
        <Metric label="Carried" value={summary.carried_count} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [regionId, setRegionId] = useState("");
  const [files, setFiles] = useState<Partial<Record<FileField, File[]>>>({});
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [preview, setPreview] = useState<MatchPreviewResponse | null>(null);
  const [report, setReport] = useState<GeneratedReportResponse | null>(null);
  const [editingSerialNo, setEditingSerialNo] = useState<number | null>(null);
  const [savingSerialNo, setSavingSerialNo] = useState<number | null>(null);
   const [draftOutput, setDraftOutput] = useState<Record<string, string | number>>({});
   const draftOutputRef = useRef(draftOutput);
   const hasAutoRestoredHistoryRef = useRef(false);
   draftOutputRef.current = draftOutput;
  const [reportDate, setReportDate] = useState(todayIsoDate());
  const [dbHealth, setDbHealth] = useState<DatabaseHealthResponse | null>(null);
  const [runtimeHealth, setRuntimeHealth] =
    useState<RuntimeHealthResponse | null>(null);
  const [isSessionLoaded, setIsSessionLoaded] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedPreviewCategory, setSelectedPreviewCategory] = useState<string | null>(null);

  const [historySessions, setHistorySessions] = useState<ReportHistorySession[]>([]);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  const [isUploadDrawerOpen, setIsUploadDrawerOpen] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedWoOtcCode, setSelectedWoOtcCode] = useState<string | null>(null);
  const [selectedRtplRegion, setSelectedRtplRegion] = useState<string>(ALL_REGIONS_FILTER);
  const [showCissOnly, setShowCissOnly] = useState(false);
  const [showRcaOnly, setShowRcaOnly] = useState(false);
  const [showTradeOnly, setShowTradeOnly] = useState(false);
  const [showClosedOnly, setShowClosedOnly] = useState(false);
  const [printCaseFilter, setPrintCaseFilter] = useState<PrintCaseFilter | null>(null);
  const [wipAgingSort, setWipAgingSort] = useState<WipAgingSortDirection | null>(null);
  const [recordsSearchQuery, setRecordsSearchQuery] = useState("");
  const [workspaceView, setWorkspaceView] = useState<"overview" | "records">("overview");

  useEffect(() => {
    setSelectedRegion(null);
    setSelectedWoOtcCode(null);
    setSelectedRtplRegion(ALL_REGIONS_FILTER);
    setShowCissOnly(false);
    setShowRcaOnly(false);
    setShowTradeOnly(false);
    setShowClosedOnly(false);
    setPrintCaseFilter(null);
    setWipAgingSort(null);
    setRecordsSearchQuery("");
  }, [report?.reportId]);

  const activeRows = useMemo(() => {
    if (!report) return [];
    return report.rows.filter(isTodayCallPlanVisibleRow);
  }, [report]);

  const cissRows = useMemo(() => {
    return activeRows.filter(isCissCase);
  }, [activeRows]);

  const pcRows = useMemo(() => {
    if (!report) return [];
    return activeRows.filter((row) => isSegmentCase(row, PC_SEGMENT));
  }, [activeRows, report]);

  const printRows = useMemo(() => {
    return activeRows.filter(isPrintCase);
  }, [activeRows]);

  const printInstallationRows = useMemo(() => {
    return activeRows.filter(isPrintInstallationCase);
  }, [activeRows]);

  const printFixRows = useMemo(() => {
    return activeRows.filter(isPrintFixCase);
  }, [activeRows]);

  const rcaRows = useMemo(() => {
    return activeRows.filter(isRcaCase);
  }, [activeRows]);

  const tradeRows = useMemo(() => {
    return activeRows.filter(isTradeCase);
  }, [activeRows]);

  const activeRegionBreakdown = useMemo(() => {
    if (!report) return [];

    const regionMetadata = new Map(
      report.regionBreakdown.map((entry) => [
        entry.aspCode,
        {
          aspCode: entry.aspCode,
          regionName: entry.regionName,
          closedCount: entry.closedCount,
        },
      ]),
    );
    const regionCounts = new Map<string, { count: number; woOtcCodes: Map<string, number> }>();

    for (const row of activeRows) {
      const aspCode = String(row.output["Work Location"] || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
      const woOtcCode = String(row.output["WO OTC CODE"] || "Unspecified").trim() || "Unspecified";
      const current =
        regionCounts.get(aspCode) ?? { count: 0, woOtcCodes: new Map<string, number>() };

      current.count += 1;
      current.woOtcCodes.set(woOtcCode, (current.woOtcCodes.get(woOtcCode) ?? 0) + 1);
      regionCounts.set(aspCode, current);
    }

    return Array.from(regionCounts.entries())
      .map(([aspCode, entry]) => {
        const metadata = regionMetadata.get(aspCode);

        return {
          aspCode,
          regionName: metadata?.regionName ?? "Unknown Region",
          count: entry.count,
          closedCount: metadata?.closedCount ?? 0,
          woOtcCodeBreakdown: Array.from(entry.woOtcCodes.entries())
            .map(([code, count]) => ({ code, count }))
            .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
        };
      })
      .sort((a, b) => b.count - a.count || a.regionName.localeCompare(b.regionName));
  }, [activeRows, report]);

  const caseTypeRegionBreakdown = useMemo(() => {
    if (!report) return [];

    return activeRegionBreakdown.map((entry) => {
      const rows = filterRowsByRegion(activeRows, entry.aspCode);
      const regionPrintRows = rows.filter(isPrintCase);
      const regionPrintInstallationRows = regionPrintRows.filter(isPrintInstallationCase);

      return {
        aspCode: entry.aspCode,
        regionName: entry.regionName,
        ciss: rows.filter(isCissCase).length,
        pc: rows.filter((row) => isSegmentCase(row, PC_SEGMENT)).length,
        print: regionPrintRows.length,
        printInstallation: regionPrintInstallationRows.length,
        printFix: regionPrintRows.length - regionPrintInstallationRows.length,
        rca: rows.filter(isRcaCase).length,
        trade: rows.filter(isTradeCase).length,
      };
    });
  }, [activeRegionBreakdown, activeRows, report]);


  const closedRows = useMemo(() => {
    if (!report) return [];
    return report.rows.filter((row) => row.carryForward.closedSyntheticRow);
  }, [report]);

  const tableBaseRows = useMemo(() => {
    if (!report) return [];
    if (showClosedOnly) return closedRows;
    if (showCissOnly) return cissRows;
    if (showRcaOnly) return rcaRows;
    if (showTradeOnly) return tradeRows;
    if (printCaseFilter === "all") return printRows;
    if (printCaseFilter === "installation") return printInstallationRows;
    if (printCaseFilter === "fix") return printFixRows;
    return activeRows;
  }, [
    activeRows,
    cissRows,
    closedRows,
    printCaseFilter,
    printFixRows,
    printInstallationRows,
    printRows,
    rcaRows,
    showCissOnly,
    showClosedOnly,
    showRcaOnly,
    showTradeOnly,
    tradeRows,
  ]);

  const regionFilteredRows = useMemo(() => {
    if (!report) return [];
    
    return tableBaseRows.filter((row) => {
      const matchRegion = selectedRegion === "ALL" || !selectedRegion || row.output["Work Location"] === selectedRegion;
      const matchCode = !selectedWoOtcCode || row.output["WO OTC CODE"] === selectedWoOtcCode;
      return matchRegion && matchCode;
    });
  }, [report, selectedRegion, selectedWoOtcCode, tableBaseRows]);

  // Column-filter hook: operates on rows already filtered by region/WO OTC
  const colFilters = useColumnFilters(regionFilteredRows);

  // Reset column filters when the report changes
  const reportId = report?.reportId;
  useEffect(() => {
    colFilters.resetAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  // Final visible rows: region-filtered → column-filtered
  const columnFilteredRows = useMemo(
    () => colFilters.filteredRows(regionFilteredRows),
    [colFilters, regionFilteredRows],
  );

  const filteredRows = useMemo(
    () =>
      sortRowsByWipAging(
        columnFilteredRows.filter((row) => rowMatchesRecordSearch(row, recordsSearchQuery)),
        wipAgingSort,
      ),
    [columnFilteredRows, recordsSearchQuery, wipAgingSort],
  );

  const scopedClosedRows = useMemo(
    () =>
      closedRows.filter((row) => {
        const matchRegion =
          selectedRegion === "ALL" ||
          !selectedRegion ||
          row.output["Work Location"] === selectedRegion;
        const matchCode = !selectedWoOtcCode || row.output["WO OTC CODE"] === selectedWoOtcCode;
        return matchRegion && matchCode;
      }),
    [closedRows, selectedRegion, selectedWoOtcCode],
  );

  const scopedManualCellCount = useMemo(
    () => countManualRequiredCells(filteredRows),
    [filteredRows],
  );

  const overallWoOtcBreakdown = useMemo(() => {
    if (!report) return [];
    return buildOverallWoOtcBreakdown(activeRegionBreakdown);
  }, [activeRegionBreakdown, report]);

  const overallClosedCount = useMemo(() => {
    if (!report) return 0;
    return report.regionBreakdown.reduce(
      (total, entry) => total + (entry.closedCount ?? 0),
      0,
    );
  }, [report]);

  const closedRegionBreakdown = useMemo(() => {
    if (!report) return [];

    return report.regionBreakdown
      .map((entry) => ({
        aspCode: entry.aspCode,
        regionName: entry.regionName,
        closedCount: entry.closedCount ?? 0,
        activeCount: entry.count,
      }))
      .filter((entry) => entry.closedCount > 0)
      .sort((a, b) => b.closedCount - a.closedCount);
  }, [report]);

  const rtplRegionOptions = useMemo(() => {
    if (!report) return [];

    return [
      { value: ALL_REGIONS_FILTER, label: "All", count: activeRows.length },
      ...activeRegionBreakdown.map((entry) => ({
        value: entry.aspCode,
        label: entry.regionName,
        count: entry.count,
      })),
    ];
  }, [activeRegionBreakdown, activeRows.length, report]);

  const rtplAnalyticsRows = useMemo(() => {
    if (!report) return [];
    return filterRowsByRegion(activeRows, selectedRtplRegion);
  }, [activeRows, report, selectedRtplRegion]);

  const rtplStatusMetrics = useMemo(
    () => buildRtplOperationalAnalytics(rtplAnalyticsRows),
    [rtplAnalyticsRows],
  );

  const flexStatusMetrics = useMemo(
    () => buildFlexOperationalAnalytics(rtplAnalyticsRows),
    [rtplAnalyticsRows],
  );

  const selectedRecords = useMemo(() => {
    if (!preview || !selectedPreviewCategory) return null;
    const { enrichedRows } = preview;
    switch (selectedPreviewCategory) {
      case "Renderways":
        return enrichedRows;
      case "Flex matched":
        return enrichedRows.filter(
          (r) => r.match_status === "MATCHED" || r.match_status === "CALLPLAN_MISSING",
        );
      case "Call Plan matched":
        return enrichedRows.filter(
          (r) => r.match_status === "MATCHED" || r.match_status === "FLEX_MISSING",
        );
      case "Flex missing":
        return enrichedRows.filter(
          (r) => r.match_status === "FLEX_MISSING" || r.match_status === "BOTH_MISSING",
        );
      case "Call Plan missing":
        return enrichedRows.filter(
          (r) => r.match_status === "CALLPLAN_MISSING" || r.match_status === "BOTH_MISSING",
        );
      default:
        return null;
    }
  }, [preview, selectedPreviewCategory]);

  const batchIds = useMemo(() => {
    const batches = upload?.batches ?? [];

    return {
      flexUploadBatchId: batchIdBySource(batches, "FLEX_WIP"),
      renderwaysUploadBatchId: batchIdBySource(batches, "RENDERWAYS"),
      callPlanUploadBatchId: batchIdBySource(batches, "CALL_PLAN"),
    };
  }, [upload]);

  async function refreshHealth() {
    const [database, runtime] = await Promise.allSettled([
      getDatabaseHealth(),
      getRuntimeHealth(),
    ]);

    if (database.status === "fulfilled") {
      setDbHealth(database.value);
    }

    if (runtime.status === "fulfilled") {
      setRuntimeHealth(runtime.value);
    }
  }

  useEffect(() => {
    const token = window.localStorage.getItem("opencall.token");
    const user = window.localStorage.getItem("opencall.user");

    if (token && user) {
      try {
        setSession({
          token,
          user: JSON.parse(user) as LoginResponse["user"],
        });
      } catch {
        window.localStorage.removeItem("opencall.token");
        window.localStorage.removeItem("opencall.user");
      }
    }

    setIsSessionLoaded(true);
    void refreshHealth();
  }, []);

  useEffect(() => {
    if (session) {
      getReportHistory(session.token).then((sessions) => {
        setHistorySessions(sessions);

        if (!hasAutoRestoredHistoryRef.current && !report && !upload) {
          hasAutoRestoredHistoryRef.current = true;
          const lastHistorySessionId = window.localStorage.getItem(LAST_HISTORY_SESSION_KEY);
          const savedSession = sessions.find(
            (historySession) =>
              historySession.id === lastHistorySessionId &&
              historySession.status === "COMPLETED" &&
              historySession.reportId,
          );
          const latestCompletedSession = sessions.find(
            (historySession) =>
              historySession.status === "COMPLETED" && Boolean(historySession.reportId),
          );
          const sessionToRestore = savedSession ?? latestCompletedSession;

          if (sessionToRestore) {
            void handleHistoryOpen(sessionToRestore);
          }
        }
      }).catch((error) => {
        if (error instanceof Error && (error.message.includes("expired") || error.message.includes("Invalid bearer") || error.message.includes("unauthorized") || error.message.includes("failed 401"))) {
          handleLogout();
          setMessage("Session expired, please login again.");
        } else {
          console.error(error);
        }
      });
    } else {
      setHistorySessions([]);
      hasAutoRestoredHistoryRef.current = false;
    }
  }, [session]);

  async function runAction(action: () => Promise<void>) {
    setIsBusy(true);
    setMessage(null);

    try {
      await action();
    } catch (error) {
      if (error instanceof Error && (error.message.includes("expired") || error.message.includes("Invalid bearer") || error.message.includes("unauthorized") || error.message.includes("failed 401"))) {
        handleLogout();
        setMessage("Session expired, please login again.");
      } else {
        setMessage(error instanceof Error ? error.message : "Operation failed");
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const loginUsername = username.trim();
    if (!loginUsername || !password) {
      setMessage("Enter your username and password to continue.");
      return;
    }

    await runAction(async () => {
      const nextSession = await login(loginUsername, password);
      window.localStorage.setItem("opencall.token", nextSession.token);
      window.localStorage.setItem("opencall.user", JSON.stringify(nextSession.user));
      setSession(nextSession);
      setRegionId(nextSession.user.regionId ?? "");
      setUsername("");
      setPassword("");
    });
  }

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) {
      setMessage("Login required");
      return;
    }

    const flexWipReport = files.flexWipReport?.[0];
    const renderwaysReport = files.renderwaysReport?.[0];
    const callPlan = files.callPlan ?? [];

    if (!flexWipReport) {
      setMessage("Flex WIP Report is required before processing");
      return;
    }

    await runAction(async () => {
      const result = await uploadReports({
        token: session.token,
        regionId,
        flexWipReport,
        ...(renderwaysReport ? { renderwaysReport } : {}),
        ...(callPlan.length > 0 ? { callPlan } : {}),
      });
      setUpload(result);
      setPreview(null);
      setReport(null);
      setEditingSerialNo(null);
      setSavingSerialNo(null);
      setDraftOutput({});
      setWorkspaceView("overview");
      setIsUploadDrawerOpen(false);
      
      // Refresh history to get the draft
      getReportHistory(session.token).then(setHistorySessions).catch(console.error);
    });
  }

  async function handlePreview() {
    if (!session) {
      setMessage("Login required");
      return;
    }

    await runAction(async () => {
      setPreview(
        await previewMatches({
          token: session.token,
          regionId,
          ...batchIds,
        }),
      );
      setSelectedPreviewCategory(null);
    });
  }

  async function handleGenerate() {
    if (!session) {
      setMessage("Login required");
      return;
    }

    await runAction(async () => {
      const generated = await generateReport({
        token: session.token,
        regionId,
        reportDate,
        ...batchIds,
      });
      setReport(generated);
      window.localStorage.setItem(LAST_HISTORY_SESSION_KEY, generated.sessionId);
      setWorkspaceView("overview");
      setEditingSerialNo(null);
      setSavingSerialNo(null);
      setDraftOutput({});
      
      // Refresh history to see completed status
      getReportHistory(session.token).then(setHistorySessions).catch(console.error);
    });
  }

  function handleLogout() {
    window.localStorage.removeItem("opencall.token");
    window.localStorage.removeItem("opencall.user");
    setSession(null);
    setUpload(null);
    setPreview(null);
    setReport(null);
    setEditingSerialNo(null);
    setSavingSerialNo(null);
    setDraftOutput({});
    setSelectedPreviewCategory(null);
    setWorkspaceView("overview");
    hasAutoRestoredHistoryRef.current = false;
  }

  async function handleHistoryOpen(historySession: ReportHistorySession) {
    if (!session) return;
    await runAction(async () => {
      const detail = await getReportHistoryById(session.token, historySession.id);
      
      // Create mock batch objects so frontend can use batchIds
      const mockBatches: UploadBatch[] = [];
      if (detail.flexUploadBatchId) {
        mockBatches.push({ id: detail.flexUploadBatchId, sourceType: "FLEX_WIP", originalFileName: "", status: "PROCESSED", rowCount: 0, errorCount: 0, createdAt: detail.createdAt });
      }
      if (detail.renderwaysUploadBatchId) {
        mockBatches.push({ id: detail.renderwaysUploadBatchId, sourceType: "RENDERWAYS", originalFileName: "", status: "PROCESSED", rowCount: 0, errorCount: 0, createdAt: detail.createdAt });
      }
      if (detail.callPlanUploadBatchId) {
        mockBatches.push({ id: detail.callPlanUploadBatchId, sourceType: "CALL_PLAN", originalFileName: "", status: "PROCESSED", rowCount: 0, errorCount: 0, createdAt: detail.createdAt });
      }
      
      // We restore the state. If it's DRAFT, we only have the batches.
      // We can trigger a preview automatically.
      setUpload({ batches: mockBatches, validations: [], parseSummaries: [] });
      setPreview(null);
      setReport(null);
      setEditingSerialNo(null);
      setSavingSerialNo(null);
      setDraftOutput({});
      setFiles({});
      if (detail.regionId) setRegionId(detail.regionId);
      if (detail.reportDate) setReportDate(detail.reportDate);
      window.localStorage.setItem(LAST_HISTORY_SESSION_KEY, detail.id);
      
      // Fetch preview and report if applicable
      const prev = await previewMatches({
        token: session.token,
        regionId: detail.regionId || regionId,
        flexUploadBatchId: detail.flexUploadBatchId!,
        ...(detail.renderwaysUploadBatchId ? { renderwaysUploadBatchId: detail.renderwaysUploadBatchId } : {}),
        ...(detail.callPlanUploadBatchId ? { callPlanUploadBatchId: detail.callPlanUploadBatchId } : {}),
      });
      setPreview(prev);

      // If it's completed, we could ideally fetch the report.
      // But since we don't have a getReport API, we'll just re-generate it to restore view
      if (detail.status === "COMPLETED") {
         const historyReportDate = detail.reportDate ?? detail.createdAt.slice(0, 10);
         const rep = await generateReport({
           token: session.token,
           regionId: detail.regionId || regionId,
           reportDate: historyReportDate,
           flexUploadBatchId: detail.flexUploadBatchId!,
           ...(detail.renderwaysUploadBatchId ? { renderwaysUploadBatchId: detail.renderwaysUploadBatchId } : {}),
           ...(detail.callPlanUploadBatchId ? { callPlanUploadBatchId: detail.callPlanUploadBatchId } : {}),
         });
         setReport(rep);
         window.localStorage.setItem(LAST_HISTORY_SESSION_KEY, rep.sessionId);
      }
      
      setIsHistoryPanelOpen(false);
    });
  }

  async function handleHistoryRename(historySession: ReportHistorySession, newTitle: string) {
    if (!session) return;
    await renameReportHistory(session.token, historySession.id, newTitle).catch(console.error);
    getReportHistory(session.token).then(setHistorySessions).catch(console.error);
  }



  async function handleHistoryDelete(historySession: ReportHistorySession) {
    if (!session) return;
    if (!window.confirm("Are you sure you want to delete this session?")) return;
    await deleteReportHistory(session.token, historySession.id).catch(console.error);
    getReportHistory(session.token).then(setHistorySessions).catch(console.error);
  }

  const canUseBatches = Boolean(batchIds.flexUploadBatchId);
  const incompleteCellCount = useMemo(() => {
    return report ? countManualRequiredCells(report.rows) : 0;
  }, [report]);

  function startEditing(row: GeneratedReportResponse["rows"][number]) {
    setEditingSerialNo(row.serialNo);
    setDraftOutput({ ...row.output });
  }

  function cancelEditing() {
    setEditingSerialNo(null);
    setDraftOutput({});
  }

  function patchValue(column: string): string | null {
    const value = String(draftOutputRef.current[column] ?? "").trim();
    return value && value !== MANUAL_ENTRY_REQUIRED ? value : null;
  }

  function buildReportRowPatchValues(
    row: GeneratedReportResponse["rows"][number],
  ): ReportRowPatchValues {
    const values: ReportRowPatchValues = {};

    for (const [column, apiField] of Object.entries(EDITABLE_COLUMN_API_FIELD)) {
      if (!apiField) {
        continue;
      }

      const draftValue = patchValue(column);
      const currentValue = String(row.output[column] ?? "").trim();
      const normalizedCurrent =
        currentValue && currentValue !== MANUAL_ENTRY_REQUIRED ? currentValue : null;

      if (draftValue === null || draftValue === normalizedCurrent) {
        continue;
      }

      if (apiField === "case_created_time") {
        const timestamp = parseEditableDateTime(draftValue);

        if (Number.isNaN(timestamp)) {
          throw new Error("Case Created Time must be a valid date/time.");
        }

        values[apiField as keyof ReportRowPatchValues] = new Date(timestamp).toISOString();
        continue;
      }

      values[apiField as keyof ReportRowPatchValues] = draftValue;
    }

    return values;
  }

  function outputFromPersistedRow(
    output: Record<string, string | number>,
    persisted: EditedReportRowResponse,
  ): Record<string, string | number> {
    const nextOutput = { ...output };

    for (const [column, responseField] of Object.entries(EDITED_RESPONSE_COLUMN)) {
      if (!responseField) {
        continue;
      }

      const value = persisted[responseField];
      const displayValue = column === "Case Created Time"
        ? formatDisplayDateTime(value)
        : value;
      nextOutput[column] =
        typeof displayValue === "string" && displayValue.trim().length > 0
          ? displayValue
          : MANUAL_ENTRY_REQUIRED;
    }

    return nextOutput;
  }

  async function saveEditing(serialNo: number) {
    if (!session) {
      setMessage("Login required");
      return;
    }

    const currentReport = report;
    const row = currentReport?.rows.find((candidate) => candidate.serialNo === serialNo);

    if (!currentReport || !row) {
      return;
    }

    if (!row.id) {
      setMessage("Save failed: this row has not been persisted yet. Regenerate the report and try again.");
      return;
    }

    setSavingSerialNo(serialNo);
    setMessage(null);

    try {
      const values = buildReportRowPatchValues(row);

      if (Object.keys(values).length === 0) {
        cancelEditing();
        return;
      }

      const persisted = await updateReportRow({
        token: session.token,
        rowId: row.id,
        values,
      });
      const editedApiFields = new Set(Object.keys(values));

      setReport((latestReport) => {
        if (!latestReport) {
          return latestReport;
        }

        return {
          ...latestReport,
          rows: latestReport.rows.map((latestRow) =>
            latestRow.serialNo === serialNo
              ? {
                  ...latestRow,
                  output: outputFromPersistedRow(
                    { ...draftOutputRef.current, "S.no": latestRow.serialNo },
                    persisted,
                  ),
                  carryForward: {
                    ...latestRow.carryForward,
                    carriedForwardFields:
                      persisted.carriedForwardFields ??
                      latestRow.carryForward.carriedForwardFields.filter((field) => {
                        const column = Object.entries(MANUAL_FIELD_BY_COLUMN).find(
                          ([, manualField]) => manualField === field,
                        )?.[0];
                        const apiField = column ? EDITABLE_COLUMN_API_FIELD[column] : null;
                        return apiField ? !editedApiFields.has(apiField) : true;
                      }),
                    manualFieldsCompleted: persisted.manualFieldsCompleted,
                    manualFieldsMissing: persisted.manualFieldsMissing,
                  },
                  updatedAt: persisted.updatedAt,
                  updatedBy: persisted.updatedBy,
                  rowEditable: persisted.rowEditable,
                  carryForwardSource: persisted.carryForwardSource,
                }
              : latestRow,
          ),
        };
      });
      cancelEditing();
      setMessage("Row saved.");
    } catch (error) {
      setReport(currentReport);
      setMessage(error instanceof Error ? `Save failed: ${error.message}` : "Save failed");
    } finally {
      setSavingSerialNo(null);
    }
  }

  function exportReport(download: (report: GeneratedReportResponse) => void) {
    if (!report) {
      return;
    }

    const scopedRows = (rows: readonly ReportRow[]): ReportRow[] =>
      rows.filter((row) => {
        const matchRegion =
          selectedRegion === "ALL" ||
          !selectedRegion ||
          row.output["Work Location"] === selectedRegion;
        const matchCode = !selectedWoOtcCode || row.output["WO OTC CODE"] === selectedWoOtcCode;
        return matchRegion && matchCode;
      });
    const applyActiveTableFilters = (rows: readonly ReportRow[]): ReportRow[] => {
      const nextRows = colFilters.activeFilterCount > 0
        ? colFilters.filteredRows(rows)
        : [...rows];
      return nextRows.filter((row) => rowMatchesRecordSearch(row, recordsSearchQuery));
    };

    const hasExistingExportFilter = Boolean(selectedRegion || selectedWoOtcCode);
    const hasColumnFilter = colFilters.activeFilterCount > 0;
    const hasRecordsSearchFilter = recordsSearchQuery.trim().length > 0;
    const hasCissFilter = showCissOnly;
    const hasRcaFilter = showRcaOnly;
    const hasTradeFilter = showTradeOnly;
    const hasClosedFilter = showClosedOnly;
    const hasPrintFilter = printCaseFilter !== null;
    const isRtplRegionFiltered = selectedRtplRegion !== ALL_REGIONS_FILTER;

    let exportRows: ReportRow[] | null = null;

    if (hasClosedFilter) {
      const scopedClosedRows = scopedRows(closedRows);
      exportRows = applyActiveTableFilters(scopedClosedRows);
    } else if (hasCissFilter) {
      const scopedCissRows = scopedRows(cissRows);
      exportRows = applyActiveTableFilters(scopedCissRows);
    } else if (hasRcaFilter) {
      const scopedRcaRows = scopedRows(rcaRows);
      exportRows = applyActiveTableFilters(scopedRcaRows);
    } else if (hasTradeFilter) {
      const scopedTradeRows = scopedRows(tradeRows);
      exportRows = applyActiveTableFilters(scopedTradeRows);
    } else if (hasPrintFilter) {
      const printScopedRows =
        printCaseFilter === "installation"
          ? printInstallationRows
          : printCaseFilter === "fix"
            ? printFixRows
            : printRows;
      const scopedPrintRows = scopedRows(printScopedRows);
      exportRows = applyActiveTableFilters(scopedPrintRows);
    } else if (isRtplRegionFiltered && !hasExistingExportFilter && !hasColumnFilter && !hasRecordsSearchFilter) {
      exportRows = rtplAnalyticsRows;
    } else if (hasExistingExportFilter || hasColumnFilter || hasRecordsSearchFilter) {
      exportRows = filteredRows;
    }

    const rowsToExport = exportRows ?? report.rows;

    if (rowsToExport.length === 0) {
      setMessage("Export skipped: the active filters do not contain any records.");
      return;
    }

    const exportIncompleteCellCount = countManualRequiredCells(rowsToExport);

    if (
      exportIncompleteCellCount > 0 &&
      !window.confirm(
        `${exportIncompleteCellCount} field(s) still require manual entry in this export. Export anyway?`,
      )
    ) {
      setMessage("Export paused: complete highlighted manual-entry fields first.");
      return;
    }

    download(exportRows ? reportWithRows(report, rowsToExport) : report);
  }

  function openRecordsWithFilter({
    region,
    woOtcCode,
    rtplStatus,
    flexStatus,
    segment,
    printCase = null,
    cissOnly = false,
    rcaOnly = false,
    tradeOnly = false,
    closedOnly = false,
  }: Readonly<{
    region?: string | null;
    woOtcCode?: string | null;
    rtplStatus?: string | null;
    flexStatus?: string | null;
    segment?: string | null;
    printCase?: PrintCaseFilter | null;
    cissOnly?: boolean;
    rcaOnly?: boolean;
    tradeOnly?: boolean;
    closedOnly?: boolean;
  }>) {
    setSelectedRegion(region ?? null);
    setSelectedWoOtcCode(woOtcCode ?? null);
    setShowCissOnly(cissOnly);
    setShowRcaOnly(rcaOnly);
    setShowTradeOnly(tradeOnly);
    setShowClosedOnly(closedOnly);
    setPrintCaseFilter(printCase);
    setSelectedRtplRegion(region && region !== "ALL" ? region : ALL_REGIONS_FILTER);
    colFilters.resetAll();
    if (rtplStatus) {
      colFilters.setColumnFilter("RTPL status", new Set([rtplStatus]));
    }
    if (flexStatus) {
      colFilters.setColumnFilter("Flex Status", new Set([flexStatus]));
    }
    if (segment) {
      colFilters.setColumnFilter("Segment", new Set([segment]));
    }
    setWorkspaceView("records");
  }

  const selectedRtplStatusFilter = (() => {
    const values = colFilters.filters["RTPL status"];

    if (!values || values.size === 0) {
      return null;
    }

    if (values.size === 1) {
      return Array.from(values)[0];
    }

    return `${values.size} RTPL statuses`;
  })();

  const selectedFlexStatusFilter = (() => {
    const values = colFilters.filters["Flex Status"];

    if (!values || values.size === 0) {
      return null;
    }

    if (values.size === 1) {
      return Array.from(values)[0];
    }

    return `${values.size} Flex statuses`;
  })();

  const selectedSegmentFilter = (() => {
    const values = colFilters.filters.Segment;

    if (!values || values.size === 0) {
      return null;
    }

    if (values.size === 1) {
      return `${Array.from(values)[0]} cases`;
    }

    return `${values.size} segments`;
  })();

  const selectedPrintCaseFilter =
    printCaseFilter === "installation"
      ? "Print installation"
      : printCaseFilter === "fix"
        ? "Print fix"
        : printCaseFilter === "all"
          ? "Print cases"
          : null;

  const recordsFilterLabel = [
    showClosedOnly ? "Closed calls" : null,
    showCissOnly ? "CISS cases" : null,
    showRcaOnly ? "RCA cases" : null,
    showTradeOnly ? "Trade cases" : null,
    selectedPrintCaseFilter,
    selectedRegion && selectedRegion !== "ALL" ? selectedRegion : null,
    selectedWoOtcCode ? selectedWoOtcCode : null,
    selectedSegmentFilter,
    selectedRtplStatusFilter,
    selectedFlexStatusFilter,
  ].filter(Boolean).join(" / ");

  const overviewMetrics: MetricsGridItem[] = report
    ? [
        {
          label: "Today Calls",
          value: activeRows.length,
          detail: "Open active records",
          onClick: () => openRecordsWithFilter({ region: null }),
        },
        {
          label: "Closed Calls",
          value: closedRows.length,
          detail: "Open closed records",
          tone: "danger",
          onClick: () => openRecordsWithFilter({ closedOnly: true }),
          isActive: showClosedOnly,
        },
        {
          label: "Duplicates",
          value: report.duplicateTicketCount,
          detail: "Needs review",
          tone: "warn",
        },
        {
          label: "Manual Required",
          value: incompleteCellCount,
          detail: incompleteCellCount > 0 ? "Open records to edit" : "All manual fields clear",
          tone: incompleteCellCount > 0 ? "danger" : "accent",
          onClick: () => openRecordsWithFilter({ region: null }),
        },
      ]
    : [];

  if (!isSessionLoaded) {
    return <SessionLoadingScreen />;
  }

  if (!session) {
    return (
      <LoginScreen
        username={username}
        password={password}
        isBusy={isBusy}
        message={message}
        dbHealth={dbHealth}
        runtimeHealth={runtimeHealth}
        onUsernameChange={setUsername}
        onPasswordChange={setPassword}
        onSubmit={(event) => void handleLogin(event)}
      />
    );
  }

  return (
    <main className="appShell">
      <AppHeader
        workspaceView={workspaceView}
        hasReport={Boolean(report)}
        hasBatches={canUseBatches}
        isBusy={isBusy}
        dbHealth={dbHealth}
        runtimeHealth={runtimeHealth}
        session={session}
        onWorkspaceViewChange={setWorkspaceView}
        onRefreshHealth={() => void refreshHealth()}
        onOpenUpload={() => setIsUploadDrawerOpen(true)}
        onOpenHistory={() => setIsHistoryPanelOpen(true)}
        onGenerateReport={() => void handleGenerate()}
        onExportXlsx={() => exportReport(downloadReportAsXlsx)}
        onExportCsv={() => exportReport(downloadReportAsExcel)}
        onLogout={handleLogout}
      />

      <UploadDrawer
        isOpen={isUploadDrawerOpen}
        isBusy={isBusy}
        files={files}
        fileFields={FILE_FIELDS}
        onClose={() => setIsUploadDrawerOpen(false)}
        onSubmit={(event) => void handleUpload(event)}
        onFileChange={(field, selectedFiles) => {
          setFiles((current) => ({
            ...current,
            [field]: selectedFiles,
          }));
        }}
      />

      <HistoryDrawer
        isOpen={isHistoryPanelOpen}
        sessions={historySessions}
        onClose={() => setIsHistoryPanelOpen(false)}
        onOpen={handleHistoryOpen}
        onRename={handleHistoryRename}
        onDelete={handleHistoryDelete}
      />

      {message ? <div className="alert">{message}</div> : null}

      <section className={`workspace ${workspaceView === "records" ? "recordsMode" : "overviewMode"}`}>
        <section className="mainGrid">
          {report ? (
            <section className="panel reportPanel">
              <div className="overviewReportContent">
              <div className="sectionHeader">
                <div>
                  <h2>Generated Report</h2>
                  <p>{report.reportId}</p>
                </div>
                <MetricsGrid items={overviewMetrics} />
              </div>
              <div className="caseTypeSection">
                <div className="sectionHeader">
                  <div>
                    <h3>Case Type Overview</h3>
                    <p>Warranty priority: Installation first, then CISS (excludes 01-Trade), Fix, PC, Trade, and RCA.</p>
                  </div>
                </div>
                <div className="caseTypeGrid">
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
                      <span>Fix Cases</span>
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
              {incompleteCellCount > 0 ? (
                <p className="hint">
                  Click any highlighted "Manual Entry Required" cell or the row Edit button to enter manual data.
                </p>
              ) : null}
              <div className="regionBreakdownSection">
                <div className="sectionHeader">
                  <h3>Region-wise Breakdown</h3>
                  {selectedRegion && (
                    <button 
                      className="secondaryButton" 
                      onClick={() => {
                        setSelectedRegion(null);
                        setSelectedWoOtcCode(null);
                        setShowClosedOnly(false);
                        setShowCissOnly(false);
                        setShowRcaOnly(false);
                        setShowTradeOnly(false);
                        setPrintCaseFilter(null);
                        colFilters.resetAll();
                      }}
                      style={{ minHeight: '32px', padding: '0 12px', fontSize: '12px' }}
                    >
                      Show All Regions
                    </button>
                  )}
                </div>
                <div className="regionGrid">
                  <div 
                    className={`regionMetric ${selectedRegion === "ALL" && !selectedWoOtcCode ? "active" : ""}`}
                    onClick={() => openRecordsWithFilter({ region: "ALL" })}
                    style={{ cursor: "pointer", border: "2px solid var(--accent)", background: "var(--accent-tint)" }}
                  >
                    <div className="regionMetricHeader">
                        <div className="regionMetricValue">{activeRows.length}</div>
                      <div className="regionMetricLabel">ALL REGIONS</div>
                      <div className="regionMetricSubtext">GLOBAL</div>
                    </div>
                    
                    {overallWoOtcBreakdown.length > 0 && (
                      <div className="regionWoOtcList">
                        {overallWoOtcBreakdown.map(woCode => (
                          <div 
                            key={woCode.code}
                            className={`regionWoOtcItem ${(selectedRegion === "ALL" || !selectedRegion) && selectedWoOtcCode === woCode.code ? "active" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openRecordsWithFilter({ region: "ALL", woOtcCode: woCode.code });
                            }}
                          >
                            <span className="regionWoOtcCode">{woCode.code}</span>
                            <span className="regionWoOtcCount">{woCode.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {activeRegionBreakdown.filter((entry) => entry.count > 0).map((entry) => (
                    <div 
                      key={entry.aspCode} 
                      className={`regionMetric ${selectedRegion === entry.aspCode && !selectedWoOtcCode ? "active" : ""}`}
                      onClick={() => openRecordsWithFilter({ region: entry.aspCode })}
                      style={{ cursor: "pointer" }}
                    >
                      <div className="regionMetricHeader">
                        <div className="regionMetricValue">{entry.count}</div>
                        <div className="regionMetricLabel">{entry.regionName}</div>
                        <div className="regionMetricSubtext">{entry.aspCode}</div>
                      </div>

                      {entry.woOtcCodeBreakdown && entry.woOtcCodeBreakdown.length > 0 && (
                        <div className="regionWoOtcList">
                          {entry.woOtcCodeBreakdown.map(woCode => (
                            <div 
                              key={woCode.code}
                              className={`regionWoOtcItem ${selectedRegion === entry.aspCode && selectedWoOtcCode === woCode.code ? "active" : ""}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                openRecordsWithFilter({ region: entry.aspCode, woOtcCode: woCode.code });
                              }}
                            >
                              <span className="regionWoOtcCode">{woCode.code}</span>
                              <span className="regionWoOtcCount">{woCode.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {overallClosedCount > 0 ? (
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
              ) : null}

              <div className="rtplAnalyticsSection">
                <div className="sectionHeader rtplAnalyticsHeader">
                  <div>
                    <h3>RTPL Operational Analytics</h3>
                  </div>
                  <span className="statusBadge neutral">
                    {rtplAnalyticsRows.length} rows
                  </span>
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

                {rtplStatusMetrics.length > 0 ? (
                  <div className="rtplMetricGrid">
                    {rtplStatusMetrics.map((metric) => (
                      <button
                        className="rtplMetricCard"
                        key={metric.status}
                        type="button"
                        onClick={() =>
                          openRecordsWithFilter({
                            region:
                              selectedRtplRegion === ALL_REGIONS_FILTER
                                ? null
                                : selectedRtplRegion,
                            rtplStatus: metric.status,
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
                    No RTPL statuses for the selected region.
                  </div>
                )}
              </div>

              <div className="rtplAnalyticsSection">
                <div className="sectionHeader rtplAnalyticsHeader">
                  <div>
                    <h3>Flex Operational Analytics</h3>
                  </div>
                  <span className="statusBadge neutral">
                    {rtplAnalyticsRows.length} rows
                  </span>
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
                    {flexStatusMetrics.map((metric) => (
                      <button
                        className="rtplMetricCard"
                        key={metric.status}
                        type="button"
                        onClick={() =>
                          openRecordsWithFilter({
                            region:
                              selectedRtplRegion === ALL_REGIONS_FILTER
                                ? null
                                : selectedRtplRegion,
                            flexStatus: metric.status,
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

              <ComparisonSummaryPanel report={report} />
              <CarryForwardSummaryPanel report={report} />


              <div className="recordsCta">
                <div>
                  <h3>Records Workspace</h3>
                  <p>Open the full Excel-style table on its own screen for filtering, editing, and export.</p>
                </div>
                <button type="button" onClick={() => setWorkspaceView("records")}>
                  Open Records
                </button>
              </div>
              </div>

              <div className="recordsArea">
                <div className="recordsHero">
                <div>
                  <p className="eyebrow">OpenCall</p>
                  <h2>Records Workspace</h2>
                  <p>
                    {formatNumber(filteredRows.length)} of {formatNumber(regionFilteredRows.length)} records shown
                    {recordsFilterLabel ? ` for ${recordsFilterLabel}` : ""}
                  </p>
                </div>
                <div className="recordsHeroStats">
                    <OverviewStat label="Visible" value={filteredRows.length} detail="After filters" />
                    <OverviewStat label="Total" value={regionFilteredRows.length} detail="Current scope" tone="blue" />
                    <OverviewStat
                      label="Closed"
                      value={scopedClosedRows.length}
                      detail="Closed calls"
                      tone="danger"
                      onClick={() => openRecordsWithFilter({ closedOnly: true })}
                      isActive={showClosedOnly}
                    />
                    <OverviewStat label="Manual" value={scopedManualCellCount} detail="Fields to complete" tone={scopedManualCellCount > 0 ? "danger" : "accent"} />
                  </div>
                </div>
              <div className="downloadActions">
                <div className="downloadActionGroup">
                  <button
                    className="downloadBtn excelBtn"
                    onClick={() => exportReport(downloadReportAsXlsx)}
                  >
                    Download Excel (.xlsx)
                  </button>
                  <button
                    className="downloadBtn csvBtn"
                    onClick={() => exportReport(downloadReportAsExcel)}
                  >
                    Download CSV
                  </button>
                </div>
                <button
                  type="button"
                  className="secondaryButton backToDashboardButton"
                  onClick={() => setWorkspaceView("overview")}
                >
                  Back to Dashboard
                </button>
              </div>
              <div className="recordsSearchBar">
                <input
                  id="records-search"
                  type="search"
                  value={recordsSearchQuery}
                  aria-label="Search records"
                  placeholder="Search WO, case ID, trade..."
                  onChange={(event) => setRecordsSearchQuery(event.target.value)}
                />
              </div>
              {colFilters.activeFilterCount > 0 && (
                <div className="colFilterSummary">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M1 2h14l-5.5 6.5V14l-3-1.5V8.5L1 2z" fill="currentColor" />
                  </svg>
                  <span>
                    {colFilters.activeFilterCount} column filter{colFilters.activeFilterCount > 1 ? "s" : ""} active
                    {" · "}
                    {filteredRows.length} of {regionFilteredRows.length} rows shown
                  </span>
                  <button type="button" onClick={colFilters.resetAll}>Clear All Filters</button>
                </div>
              )}
              {recordsSearchQuery && (
                <div className="colFilterSummary">
                  <span>
                    Search "{recordsSearchQuery}" active
                    {" - "}
                    {filteredRows.length} of {columnFilteredRows.length} rows shown
                  </span>
                  <button
                    type="button"
                    onClick={() => setRecordsSearchQuery("")}
                  >
                    Clear Search
                  </button>
                </div>
              )}
              {(selectedRegion || selectedWoOtcCode) && (
                <div className="colFilterSummary">
                  <span>
                    {recordsFilterLabel || "Region filter"} active
                    {" Â· "}
                    {filteredRows.length} of {regionFilteredRows.length} rows shown
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRegion(null);
                      setSelectedWoOtcCode(null);
                    }}
                  >
                    Show All Regions
                  </button>
                </div>
              )}
              {showCissOnly && (
                <div className="colFilterSummary">
                  <span>
                    CISS Cases active
                    {" · "}
                    {filteredRows.length} of {regionFilteredRows.length} rows shown
                  </span>
                  <button type="button" onClick={() => setShowCissOnly(false)}>Show All Cases</button>
                </div>
              )}
              {showRcaOnly && (
                <div className="colFilterSummary">
                  <span>
                    RCA Cases active
                    {" Â· "}
                    {filteredRows.length} of {regionFilteredRows.length} rows shown
                  </span>
                  <button type="button" onClick={() => setShowRcaOnly(false)}>Show All Cases</button>
                </div>
              )}
              {showTradeOnly && (
                <div className="colFilterSummary">
                  <span>
                    Trade Cases active
                    {" Â· "}
                    {filteredRows.length} of {regionFilteredRows.length} rows shown
                  </span>
                  <button type="button" onClick={() => setShowTradeOnly(false)}>Show All Cases</button>
                </div>
              )}
              {printCaseFilter && (
                <div className="colFilterSummary">
                  <span>
                    {selectedPrintCaseFilter} active
                    {" Â· "}
                    {filteredRows.length} of {regionFilteredRows.length} rows shown
                  </span>
                  <button type="button" onClick={() => setPrintCaseFilter(null)}>Show All Cases</button>
                </div>
              )}
              {showClosedOnly && (
                <div className="colFilterSummary">
                  <span>
                    Closed Calls active
                    {" Â· "}
                    {filteredRows.length} of {regionFilteredRows.length} rows shown
                  </span>
                  <button type="button" onClick={() => setShowClosedOnly(false)}>Show All Calls</button>
                </div>
              )}
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Change</th>
                      <th>Ops</th>
                      {DAILY_CALL_PLAN_COLUMNS.map((column) => {
                        const isFilterable = colFilters.isFilterable(column);
                        const isFiltered = colFilters.isColumnFiltered(column);
                        const uniqueVals = colFilters.uniqueValuesMap.get(column) ?? [];

                        return (
                          <th key={column}>
                            {column}
                            {isFilterable && (
                              <ColumnFilterDropdown
                                column={column}
                                isOpen={colFilters.openColumn === column}
                                uniqueValues={uniqueVals}
                                selectedValues={colFilters.filters[column]}
                                isFiltered={isFiltered}
                                wipAgingSort={wipAgingSort}
                                onToggleValue={colFilters.toggleValue}
                                onSelectAll={colFilters.selectAll}
                                onClearAll={colFilters.clearAll}
                                onApply={colFilters.setColumnFilter}
                                onWipAgingSortChange={setWipAgingSort}
                                onOpen={colFilters.openFilterDropdown}
                                onClose={colFilters.closeFilterDropdown}
                              />
                            )}
                          </th>
                        );
                      })}
                      <th className="stickyActionColumn">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, visibleIndex) => {
                      const isEditing = editingSerialNo === row.serialNo;
                      const visibleSerialNo = visibleIndex + 1;

                      return (
                        <tr
                          key={row.serialNo}
                          className={
                            Object.values(row.output).includes(MANUAL_ENTRY_REQUIRED) ||
                            row.carryForward.manualFieldsMissing.length > 0
                              ? "incompleteRow"
                              : undefined
                          }
                        >
                          <td className="changeCell">
                            <ChangeTypeBadge comparison={row.comparison} />
                          </td>
                          <td className="opsCell">
                            <CarryForwardBadge carryForward={row.carryForward} />
                            {row.carryForward.manualFieldsMissing.length > 0 ? (
                              <span
                                className="manualCount"
                                title={`Manual entry required: ${formatFieldList(row.carryForward.manualFieldsMissing)}`}
                              >
                                {row.carryForward.manualFieldsMissing.length}
                              </span>
                            ) : null}
                          </td>
                          {DAILY_CALL_PLAN_COLUMNS.map((column) => {
                            const value =
                              column === "S.no"
                                ? visibleSerialNo
                                : isEditing
                                  ? draftOutput[column]
                                  : row.output[column];
                            const isManualRequired = value === MANUAL_ENTRY_REQUIRED;
                            const isReadOnly = column === "S.no" || column === "Ticket ID";
                            const manualField = MANUAL_FIELD_BY_COLUMN[column];
                            const isCarriedForward =
                              manualField
                                ? row.carryForward.carriedForwardFields.includes(manualField)
                                : false;
                            const needsManualEntry =
                              manualField
                                ? row.carryForward.manualFieldsMissing.includes(manualField)
                                : false;

                            return (
                              <td
                                key={column}
                                className={[
                                  isManualRequired || needsManualEntry ? "missingCell" : "",
                                  isCarriedForward ? "carriedForwardCell" : "",
                                ].filter(Boolean).join(" ") || undefined}
                                onClick={
                                  !isEditing && isManualRequired && !isReadOnly
                                    ? () => startEditing(row)
                                    : undefined
                                }
                                style={
                                  !isEditing && isManualRequired && !isReadOnly
                                    ? { cursor: "pointer" }
                                    : undefined
                                }
                                title={
                                  !isEditing && isManualRequired && !isReadOnly
                                    ? "Click to edit manual entry"
                                    : isCarriedForward
                                      ? "Value carried from previous day"
                                      : undefined
                                }
                              >
                                {isEditing && !isReadOnly ? (
                                  column === "RTPL status" ? (
                                    <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                                         <select
                                           className="cellInput"
                                           value={
                                             draftOutput[column]
                                               ? RTPL_STATUS_OPTIONS.some((opt) => opt === String(draftOutput[column]))
                                                 ? String(draftOutput[column])
                                                 : "Custom"
                                               : ""
                                           }
                                           onChange={(event) => {
                                             const selected = event.target.value;
                                             if (selected === "Custom") {
                                               setDraftOutput((current) => ({
                                                 ...current,
                                                 [column]: "",
                                               }));
                                             } else {
                                               setDraftOutput((current) => ({
                                                 ...current,
                                                 [column]: selected || "",
                                               }));
                                             }
                                           }}
                                         >
                                        <option value="">{MANUAL_ENTRY_REQUIRED}</option>
                                        {RTPL_STATUS_OPTIONS.map((option) => (
                                          <option key={option} value={option}>
                                            {option}
                                          </option>
                                        ))}
                                        <option value="Custom">Custom</option>
                                      </select>
                                       {(draftOutput[column] === "" || !RTPL_STATUS_OPTIONS.some((opt) => opt === String(draftOutput[column]))) && (
                                        <input
                                          className="cellInput"
                                          style={{ flex: 1 }}
                                          value={String(draftOutput[column] ?? "")}
                                          onChange={(event) =>
                                            setDraftOutput((current) => ({
                                              ...current,
                                              [column]: event.target.value,
                                            }))
                                          }
                                          placeholder="Enter custom status"
                                        />
                                      )}
                                    </div>
                                  ) : (
                                    <input
                                      className="cellInput"
                                      value={String(value ?? "")}
                                      onChange={(event) =>
                                        setDraftOutput((current) => ({
                                          ...current,
                                          [column]: event.target.value,
                                        }))
                                      }
                                    />
                                  )
                                ) : (
                                  <span className="cellValueWrap">
                                    <span>{String(value ?? "")}</span>
                                    {isCarriedForward ? (
                                      <span className="cellCarryFlag">Carried</span>
                                    ) : null}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="stickyActionColumn">
                            {isEditing ? (
                              <div className="rowActions">
                                <button
                                  type="button"
                                  disabled={savingSerialNo === row.serialNo}
                                  onClick={() => void saveEditing(row.serialNo)}
                                >
                                  {savingSerialNo === row.serialNo ? "Saving..." : "Save"}
                                </button>
                                <button
                                  type="button"
                                  className="secondaryButton"
                                  disabled={savingSerialNo === row.serialNo}
                                  onClick={cancelEditing}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="secondaryButton"
                                onClick={() => startEditing(row)}
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </div>
            </section>
          ) : null}

          {upload ? (
            <section className="panel">
              <div className="sectionHeader">
                <h2>Upload Batches</h2>
                <button type="button" disabled={isBusy || !canUseBatches} onClick={() => void handlePreview()}>
                  Preview Matches
                </button>
              </div>
              <div className="batchGrid">
                {upload.batches.map((batch) => {
                  const validation = upload.validations.find((v) => v.sourceType === batch.sourceType);
                  const hasMissingColumns = validation && !validation.isValid && validation.missingColumns.length > 0;
                  return (
                    <div className="batchCard" key={batch.id}>
                      <span>{SOURCE_LABELS[batch.sourceType]}</span>
                      <strong>{batch.rowCount} rows</strong>
                      <code>{batch.id}</code>
                      <StatusPill tone={batch.errorCount === 0 && !hasMissingColumns ? "good" : "warn"}>
                        {batch.status}
                      </StatusPill>
                      {hasMissingColumns && (
                        <div style={{ color: "var(--danger)", fontSize: "11px", fontWeight: "bold", marginTop: "4px" }}>
                          Missing columns: {validation.missingColumns.join(", ")}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {preview ? (
            <section className="panel">
              <div className="sectionHeader">
                <h2>Match Preview</h2>
                <button type="button" disabled={isBusy || !canUseBatches} onClick={() => void handleGenerate()}>
                  Generate Report
                </button>
              </div>
              <div className="metricGrid">
                <Metric
                  label="Flex WIP rows"
                  value={preview.totalFlexRows ?? 0}
                  onClick={() =>
                    setSelectedPreviewCategory(
                      selectedPreviewCategory === "Renderways" ? null : "Renderways"
                    )
                  }
                  isActive={selectedPreviewCategory === "Renderways"}
                />
                <Metric
                  label="Flex matched"
                  value={preview.flexMatchedRows}
                  onClick={() =>
                    setSelectedPreviewCategory(
                      selectedPreviewCategory === "Flex matched" ? null : "Flex matched"
                    )
                  }
                  isActive={selectedPreviewCategory === "Flex matched"}
                />
                <Metric
                  label="Call Plan matched"
                  value={preview.callPlanMatchedRows}
                  onClick={() =>
                    setSelectedPreviewCategory(
                      selectedPreviewCategory === "Call Plan matched" ? null : "Call Plan matched"
                    )
                  }
                  isActive={selectedPreviewCategory === "Call Plan matched"}
                />
                <Metric
                  label="Flex missing"
                  value={preview.unmatchedFlexRows}
                  onClick={() =>
                    setSelectedPreviewCategory(
                      selectedPreviewCategory === "Flex missing" ? null : "Flex missing"
                    )
                  }
                  isActive={selectedPreviewCategory === "Flex missing"}
                />
                <Metric
                  label="Call Plan missing"
                  value={preview.unmatchedCallPlanRows}
                  onClick={() =>
                    setSelectedPreviewCategory(
                      selectedPreviewCategory === "Call Plan missing" ? null : "Call Plan missing"
                    )
                  }
                  isActive={selectedPreviewCategory === "Call Plan missing"}
                />
              </div>
              {selectedPreviewCategory && selectedRecords && selectedRecords.length > 0 && (
                <div style={{ marginTop: "16px", minWidth: 0 }}>
                  <h3 style={{ fontSize: "15px", marginBottom: "12px" }}>
                    {selectedPreviewCategory} Records
                  </h3>
                  <div className="tableWrap" style={{ maxHeight: "400px" }}>
                    <table>
                      <thead>
                        <tr>
                          {Object.keys(selectedRecords[0] ?? {}).map((key) => (
                            <th key={key}>{key}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRecords.map((row, i) => (
                          <tr key={i}>
                            {Object.values(row).map((val, j) => (
                              <td key={j}>{String(val ?? "")}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          ) : null}
        </section>
      </section>
    </main>
  );
}
