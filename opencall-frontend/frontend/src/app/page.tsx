"use client";

import { DAILY_CALL_PLAN_COLUMNS, RTPL_STATUS_OPTIONS, RTPL_STATUS_GROUPS } from "@opencall/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { ColumnFilterDropdown } from "../components/ColumnFilterDropdown";
import { AppHeader } from "../components/AppHeader";
import { HistoryDrawer } from "../components/HistoryDrawer";
import { MetricsGrid, type MetricsGridItem } from "../components/MetricsGrid";
import { StatusPill } from "../components/StatusPill";
import { UploadDrawer } from "../components/UploadDrawer";
import { RTPLStatusDropdown } from "../components/RTPLStatusDropdown";
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
  getRtplStatusChanges,
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
  type RtplStatusChange,
  getReportHistory,
  getReportHistoryById,
  renameReportHistory,
  deleteReportHistory,
  deleteReportRow,
  getEngineersDropdown,
  isApiAuthError,
} from "../lib/apiClient";
import type { DropdownEngineer } from "../lib/api/types";
import { LoginScreen, SessionLoadingScreen } from "../features/auth/LoginScreen";
import { downloadReportAsXlsx, downloadReportAsExcel, downloadRegionSummaryExcel, downloadEngineerProductivityExcel } from "../lib/excelExport";
import {
  ALL_REGIONS_FILTER,
  buildFlexOperationalAnalytics,
  buildOverallWoOtcBreakdown,
  buildRtplTimeCards,
  filterRowsByRegion,
  isTodayCallPlanVisibleRow,
  reportWithRows,
  RTPL_CARRY_FORWARD_TIME_CARD_ID,
  type RtplTimeCardId,
} from "../lib/reportDashboardAnalytics";

type SourceKey = "FLEX_WIP" | "RENDERWAYS" | "CALL_PLAN";
type FileField = "flexWipReport" | "renderwaysReport" | "callPlan";
type ChangeType = "NEW" | "CLOSED" | "CARRIED" | "UPDATED";
type ReportRow = GeneratedReportResponse["rows"][number];
type PrintCaseFilter = "all" | "installation" | "fix";
type RtplCaseScope = "overall" | "warranty" | "trade";
type ManualCarryForwardField =
  | "rtpl_status"
  | "segment"
  | "engineer"
  | "location"
  | "case_created_time"
  | "status_aging"
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
  { field: "flexWipReport", source: "FLEX_WIP", label: "FieldEZ Report", required: true },
  { field: "renderwaysReport", source: "RENDERWAYS", label: "Flex Mail Report", required: false },
  { field: "callPlan", source: "CALL_PLAN", label: "Call Plan Reports", required: false, multiple: true },
];

const MANUAL_ENTRY_REQUIRED = "Manual Entry Required";
const CISS_PRODUCT_LINE = "CISS";
const PC_SEGMENT = "PC";
const PRINT_SEGMENT = "Print";
const PRINT_INSTALLATION_WO_OTC_CODE = "05F";
const TRADE_WO_OTC_CODE_KEYWORD = "TRADE";
const LAST_HISTORY_SESSION_KEY = "opencall.lastHistorySessionId";
const RTPL_MODAL_DETAIL_LIMIT = 12;
const RTPL_STATUS_CHANGE_LIMIT = 200;

const RTPL_CASE_SCOPE_OPTIONS: Array<{
  value: RtplCaseScope;
  label: string;
  description: string;
}> = [
  { value: "overall", label: "Overall", description: "All active cases" },
  { value: "warranty", label: "Warranty", description: "Excludes 01-Trade" },
  { value: "trade", label: "Trade", description: "01-Trade / non-warranty" },
];

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

function tableColumnClassName(column: string): string {
  return `reportColumn reportColumn-${column
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
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

function isConsumerCase(row: GeneratedReportResponse["rows"][number]): boolean {
  const segment = String(row.output.Segment ?? "").trim().toLowerCase();
  const prodLine = String(row.output["Product Line Name"] ?? "").trim().toLowerCase();
  const account = String(row.output["Account Name"] ?? "").trim().toLowerCase();
  const custName = String(row.output["Customer Name"] ?? "").trim().toLowerCase();

  // 1. Direct explicit checks
  if (segment.includes("consumer") || prodLine.includes("consumer")) {
    return true;
  }
  if (segment.includes("commercial") || prodLine.includes("commercial") || segment.includes("enterprise") || prodLine.includes("enterprise")) {
    return false;
  }

  // 2. High-fidelity corporate/business account checks
  const corporateKeywords = ["pvt", "ltd", "corp", "inc", "bank", "technologies", "solutions", "limited", "enterprise", "tcs", "wipro", "infosys", "cognizant", "hcl"];
  if (corporateKeywords.some(keyword => account.includes(keyword))) {
    return false;
  }

  // 3. Retail/Individual checks
  if (account === "individual" || account === "consumer" || account.includes("retail")) {
    return true;
  }

  // 4. Fallbacks for individuals (e.g. empty account or same as customer name)
  if (account === "" || account === custName) {
    return true;
  }

  return false;
}

function isWarrantyCase(row: GeneratedReportResponse["rows"][number]): boolean {
  return !isTradeCase(row);
}

const MANUAL_FIELD_BY_COLUMN: Partial<Record<string, ManualCarryForwardField>> = {
  "RTPL status": "rtpl_status",
  Segment: "segment",
  Engineer: "engineer",
  Location: "location",
  "Case Created Time": "case_created_time",
  "Status Aging": "status_aging",
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
  status_aging: "Status Aging",
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
  "Status Aging": "status_aging",
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
    | "statusAging"
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
  "Status Aging": "statusAging",
  "HP Owner Status": "hpOwnerStatus",
  "Customer Mail": "customerMail",
  RCA: "rca",
};

function todayIsoDate(): string {
  return dateIsoInIst(new Date());
}

function dateIsoInIst(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const partValue = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${partValue("year")}-${partValue("month")}-${partValue("day")}`;
}

function formatDisplayDateOnly(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  const day = date.getDate();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[date.getMonth()];
  
  let suffix = "th";
  if (day === 1 || day === 21 || day === 31) suffix = "st";
  else if (day === 2 || day === 22) suffix = "nd";
  else if (day === 3 || day === 23) suffix = "rd";
  
  return `${day}${suffix} ${month}`;
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

function formatRtplStatusValue(value: string | null | undefined): string {
  const cleanValue = value?.trim();
  return cleanValue ? cleanValue : "blank";
}

function formatRtplChangeTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
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
  const [rtplStatusChanges, setRtplStatusChanges] = useState<RtplStatusChange[]>([]);
  const [editingSerialNo, setEditingSerialNo] = useState<number | null>(null);
  const [savingSerialNo, setSavingSerialNo] = useState<number | null>(null);
   const [draftOutput, setDraftOutput] = useState<Record<string, string | number>>({});
   const [isEditModalOpen, setIsEditModalOpen] = useState(false);
   const draftOutputRef = useRef(draftOutput);
   const hasAutoRestoredHistoryRef = useRef(false);
   const recordsTableWrapRef = useRef<HTMLDivElement | null>(null);
   const [engineersList, setEngineersList] = useState<DropdownEngineer[]>([]);
   draftOutputRef.current = draftOutput;
  const [reportDate, setReportDate] = useState(todayIsoDate());
  const [rtplAnalyticsDate, setRtplAnalyticsDate] = useState(todayIsoDate());
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
  const [selectedRtplCaseScope, setSelectedRtplCaseScope] = useState<RtplCaseScope>("overall");
  const [selectedRtplTimeCardId, setSelectedRtplTimeCardId] = useState<RtplTimeCardId>(
    RTPL_CARRY_FORWARD_TIME_CARD_ID,
  );
  const [selectedRtplModalStatus, setSelectedRtplModalStatus] = useState<string | null>(null);
  const [isRtplTimeModalOpen, setIsRtplTimeModalOpen] = useState(false);
  const [showCissOnly, setShowCissOnly] = useState(false);
  const [showRcaOnly, setShowRcaOnly] = useState(false);
  const [showTradeOnly, setShowTradeOnly] = useState(false);
  const [showClosedOnly, setShowClosedOnly] = useState(false);
  const [showConsumerOnly, setShowConsumerOnly] = useState(false);
  const [showCommercialOnly, setShowCommercialOnly] = useState(false);
  const [showWarrantyOnly, setShowWarrantyOnly] = useState(false);
  const [showNonWarrantyOnly, setShowNonWarrantyOnly] = useState(false);
  const [isKpiModalOpen, setIsKpiModalOpen] = useState(false);
  const [isChennaiKpiModalOpen, setIsChennaiKpiModalOpen] = useState(false);
  const [isProductivityModalOpen, setIsProductivityModalOpen] = useState(false);
  const [productivityFilterType, setProductivityFilterType] = useState("Today");
  const [selectedProductivityValue, setSelectedProductivityValue] = useState("");
  const [printCaseFilter, setPrintCaseFilter] = useState<PrintCaseFilter | null>(null);
  const [wipAgingSort, setWipAgingSort] = useState<WipAgingSortDirection | null>(null);
  const [recordsSearchQuery, setRecordsSearchQuery] = useState("");
  const [workspaceView, setWorkspaceView] = useState<"overview" | "records">("overview");
  const [isRecordsSummaryHidden, setIsRecordsSummaryHidden] = useState(false);
  const [showDayOverDayComparison, setShowDayOverDayComparison] = useState(false);
  const [showMatchPreviewSection, setShowMatchPreviewSection] = useState(false);
  const [showManualCarryForward, setShowManualCarryForward] = useState(false);

  useEffect(() => {
    if (workspaceView !== "records") {
      setIsRecordsSummaryHidden(false);
      return;
    }

    const handleWindowScroll = () => {
      const tableScrolled = (recordsTableWrapRef.current?.scrollTop ?? 0) > 0;
      setIsRecordsSummaryHidden(window.scrollY > 24 || tableScrolled);
    };

    handleWindowScroll();
    window.addEventListener("scroll", handleWindowScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleWindowScroll);
    };
  }, [workspaceView]);

  useEffect(() => {
    setSelectedRegion(null);
    setSelectedWoOtcCode(null);
    setSelectedRtplRegion(ALL_REGIONS_FILTER);
    setSelectedRtplCaseScope("overall");
    setSelectedRtplTimeCardId(RTPL_CARRY_FORWARD_TIME_CARD_ID);
    setSelectedRtplModalStatus(null);
    setIsRtplTimeModalOpen(false);
    setShowCissOnly(false);
    setShowRcaOnly(false);
    setShowTradeOnly(false);
    setShowClosedOnly(false);
    setShowConsumerOnly(false);
    setShowCommercialOnly(false);
    setShowWarrantyOnly(false);
    setShowNonWarrantyOnly(false);
    setIsKpiModalOpen(false);
    setIsChennaiKpiModalOpen(false);
    setIsProductivityModalOpen(false);
    setProductivityFilterType("Today");
    setSelectedProductivityValue("");
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
    const regionCounts = new Map<
      string,
      {
        count: number;
        consumerCount: number;
        commercialCount: number;
        warrantyCount: number;
        nonWarrantyCount: number;
        woOtcCodes: Map<string, number>;
      }
    >();

    for (const row of activeRows) {
      const aspCode = String(row.output["Work Location"] || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
      const woOtcCode = String(row.output["WO OTC CODE"] || "Unspecified").trim() || "Unspecified";
      const current =
        regionCounts.get(aspCode) ?? {
          count: 0,
          consumerCount: 0,
          commercialCount: 0,
          warrantyCount: 0,
          nonWarrantyCount: 0,
          woOtcCodes: new Map<string, number>(),
        };

      current.count += 1;
      if (isConsumerCase(row)) {
        current.consumerCount += 1;
      } else {
        current.commercialCount += 1;
      }
      if (isWarrantyCase(row)) {
        current.warrantyCount += 1;
      } else {
        current.nonWarrantyCount += 1;
      }
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
          consumerCount: entry.consumerCount,
          commercialCount: entry.commercialCount,
          warrantyCount: entry.warrantyCount,
          nonWarrantyCount: entry.nonWarrantyCount,
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
        consumer: rows.filter(isConsumerCase).length,
        commercial: rows.filter((row) => !isConsumerCase(row)).length,
        warranty: rows.filter(isWarrantyCase).length,
        nonWarranty: rows.filter(isTradeCase).length,
      };
    });
  }, [activeRegionBreakdown, activeRows, report]);


  const closedRows = useMemo(() => {
    if (!report) return [];
    return report.rows.filter((row) => row.carryForward.closedSyntheticRow);
  }, [report]);

  const consumerRows = useMemo(() => {
    return activeRows.filter(isConsumerCase);
  }, [activeRows]);

  const commercialRows = useMemo(() => {
    return activeRows.filter((row) => !isConsumerCase(row));
  }, [activeRows]);

  const warrantyRows = useMemo(() => {
    return activeRows.filter(isWarrantyCase);
  }, [activeRows]);

  const nonWarrantyRows = useMemo(() => {
    return activeRows.filter(isTradeCase);
  }, [activeRows]);

  const tableBaseRows = useMemo(() => {
    if (!report) return [];
    if (showClosedOnly) return closedRows;
    if (showConsumerOnly) return consumerRows;
    if (showCommercialOnly) return commercialRows;
    if (showWarrantyOnly) return warrantyRows;
    if (showNonWarrantyOnly) return nonWarrantyRows;
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
    consumerRows,
    commercialRows,
    warrantyRows,
    nonWarrantyRows,
    printCaseFilter,
    printFixRows,
    printInstallationRows,
    printRows,
    rcaRows,
    showCissOnly,
    showClosedOnly,
    showConsumerOnly,
    showCommercialOnly,
    showWarrantyOnly,
    showNonWarrantyOnly,
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

  const activeRegionName = useMemo(() => {
    if (!report || !selectedRegion || selectedRegion === "ALL") return "";
    const entry = report.regionBreakdown.find((r) => r.aspCode === selectedRegion);
    return entry?.regionName ?? selectedRegion;
  }, [report, selectedRegion]);

  const regionKpiMetrics = useMemo(() => {
    if (!report || !selectedRegion || selectedRegion === "ALL") return null;
    
    const rows = regionFilteredRows;
    const active = rows.filter((r) => !r.carryForward.closedSyntheticRow);
    const closed = rows.filter((r) => r.carryForward.closedSyntheticRow);
    
    const getUniqueEngineers = (items: typeof rows) => {
      const list = items
        .map((r) => String(r.output.Engineer ?? "").trim())
        .filter((name) => name && name !== "Manual Entry Required");
      return Array.from(new Set(list));
    };
    const uniqueEngineers = getUniqueEngineers(active);
    const engineerCount = uniqueEngineers.length;
    
    const countStatus = (statusList: string[]) => {
      return active.filter((r) => {
        const s = String(r.output["RTPL status"] ?? "").trim().toLowerCase();
        return statusList.some((item) => s === item.toLowerCase());
      }).length;
    };
    
    const countStatusContains = (keyword: string) => {
      return active.filter((r) => {
        const s = String(r.output["RTPL status"] ?? "").trim().toLowerCase();
        return s.includes(keyword.toLowerCase());
      }).length;
    };
    
    const isTradeRow = (r: typeof rows[number]) => {
      const code = String(r.output["WO OTC CODE"] ?? "").trim().toUpperCase();
      return code.includes("TRADE") || code.startsWith("01");
    };
    
    const actionable = countStatus(["Actionable"]);
    const planned = countStatus(["Engg Assigned"]);
    const enggOnsite = countStatus(["Engg Assigned"]) + countStatusContains("onsite");
    const toBeSchedule = countStatus(["To be Scheduled", "Engg Assignment Pending"]);
    const cxReschedule = countStatus(["CX Pending"]) + countStatusContains("reschedule") + countStatusContains("cx");
    const sscPending = countStatus(["SSC Pending → Part Pending"]);
    const elevateTech = countStatus(["Elevation HP Pending", "Elevation Part Pending"]);
    const underObservation = countStatus(["CRT Pending", "CT Validation Pending"]) + countStatusContains("observation");
    const toBeYank = countStatus(["Need to Yank", "Yank"]);
    const addPartOrdered = countStatus(["Additional Part", "Part Order Pending"]);
    const toBeCancel = countStatus(["Need to Cancel", "Need to Cancel Mail"]);
    const newCalls = active.filter((r) => r.comparison?.changeType === "NEW").length;
    const tradeOpenCalls = active.filter(isTradeRow).length;
    
    const closedCancelled = closed.filter((r) => {
      const s = String(r.output["RTPL status"] ?? "").trim().toLowerCase();
      return s.includes("cancel");
    }).length;
    
    return {
      engineerCount,
      enggPresents: engineerCount,
      openCalls: active.length,
      actionable,
      planned,
      closedCalls: closed.length,
      enggOnsite,
      toBeSchedule,
      cxReschedule,
      sscPending,
      elevateTech,
      underObservation,
      toBeYank,
      closedCancelled,
      addPartOrdered,
      toBeCancel,
      newCalls,
      tradeOpenCalls,
    };
  }, [report, selectedRegion, regionFilteredRows]);

  const chennaiKpiMetrics = useMemo(() => {
    if (!report || !selectedRegion || selectedRegion === "ALL") return null;
    
    const rows = regionFilteredRows;
    const active = rows.filter((r) => !r.carryForward.closedSyntheticRow);
    const closed = rows.filter((r) => r.carryForward.closedSyntheticRow);
    
    const getUniqueEngineers = (items: typeof rows) => {
      const list = items
        .map((r) => String(r.output.Engineer ?? "").trim())
        .filter((name) => name && name !== "Manual Entry Required");
      return Array.from(new Set(list));
    };
    const uniqueEngineers = getUniqueEngineers(active);
    const enggCount = uniqueEngineers.length;
    
    const parseWipAgingValue = (value: unknown): number | null => {
      const parsed = Number(String(value ?? "").trim());
      return Number.isFinite(parsed) ? parsed : null;
    };
    
    const countStatus = (statusList: string[]) => {
      return active.filter((r) => {
        const s = String(r.output["RTPL status"] ?? "").trim().toLowerCase();
        return statusList.some((item) => s === item.toLowerCase());
      }).length;
    };
    
    // Calculations:
    const openCalls = active.length;
    const actionable = countStatus(["Actionable"]);
    const planned = countStatus(["Engg Assigned"]);
    const callAllocation = enggCount > 0 ? (planned / enggCount).toFixed(1) : "0.0";
    
    const printOpenGe2 = active.filter(r => isPrintCase(r) && (parseWipAgingValue(r.output["WIP aging"]) ?? 0) >= 2).length;
    const printActionableGe2 = active.filter(r => isPrintCase(r) && String(r.output["RTPL status"] ?? "").trim().toLowerCase() === "actionable" && (parseWipAgingValue(r.output["WIP aging"]) ?? 0) >= 2).length;
    const printScheduledGe2 = active.filter(r => isPrintCase(r) && String(r.output["RTPL status"] ?? "").trim().toLowerCase() === "engg assigned" && (parseWipAgingValue(r.output["WIP aging"]) ?? 0) >= 2).length;
    
    const openCallsGt10 = active.filter(r => (parseWipAgingValue(r.output["WIP aging"]) ?? 0) > 10).length;
    const actionableGt10 = active.filter(r => String(r.output["RTPL status"] ?? "").trim().toLowerCase() === "actionable" && (parseWipAgingValue(r.output["WIP aging"]) ?? 0) > 10).length;
    const scheduledGt10 = active.filter(r => String(r.output["RTPL status"] ?? "").trim().toLowerCase() === "engg assigned" && (parseWipAgingValue(r.output["WIP aging"]) ?? 0) > 10).length;
    
    const mpsGt1 = active.filter(r => String(r.output["RTPL status"] ?? "").trim().toLowerCase().includes("mps") && (parseWipAgingValue(r.output["WIP aging"]) ?? 0) > 1).length;
    const eodCloser = closed.length;
    const newCalls = active.filter(r => r.comparison?.changeType === "NEW").length;
    
    const csoDaysInventory = eodCloser > 0 ? (openCalls / eodCloser).toFixed(1) : "#DIV/0!";
    const engAvlInField = enggCount;
    const enggProductivity = enggCount > 0 ? (eodCloser / enggCount).toFixed(1) : "0.0";
    
    const missedToSchedule = active.filter(r => String(r.output["RTPL status"] ?? "").trim().toLowerCase().includes("missed") || String(r.output["RTPL status"] ?? "").trim().toLowerCase().includes("non avl")).length;
    const missedByEng = active.filter(r => String(r.output["RTPL status"] ?? "").trim().toLowerCase().includes("high call")).length;
    const gTotalMissed = missedToSchedule + missedByEng;
    const pctMissed = openCalls > 0 ? Math.round((gTotalMissed / openCalls) * 100) : 0;
    const closureAdherence = (eodCloser + gTotalMissed) > 0 ? Math.round((eodCloser / (eodCloser + gTotalMissed)) * 100) : 0;
    
    // NAF right table columns
    const flexBackend = active.filter(r => {
      const s = String(r.output["RTPL status"] ?? "").trim().toLowerCase();
      return s.includes("flex backend") || s.includes("backend");
    }).length;
    const ssc = active.filter(r => String(r.output["RTPL status"] ?? "").trim().toLowerCase().includes("ssc")).length;
    const hpBackend = active.filter(r => String(r.output["RTPL status"] ?? "").trim().toLowerCase().includes("hp backend")).length;
    const obsCustomer = active.filter(r => String(r.output["RTPL status"] ?? "").trim().toLowerCase().includes("obs") || String(r.output["RTPL status"] ?? "").trim().toLowerCase().includes("customer")).length;
    const cuPending = active.filter(r => String(r.output["RTPL status"] ?? "").trim().toLowerCase().includes("cu pending")).length;
    const physicalClosed = active.filter(r => String(r.output["RTPL status"] ?? "").trim().toLowerCase().includes("physical closed") || String(r.output["RTPL status"] ?? "").trim().toLowerCase().includes("physically closed")).length;
    
    const totalNaf = flexBackend + ssc + hpBackend + obsCustomer + cuPending + physicalClosed;
    const sscPct = totalNaf > 0 ? Math.round((ssc / totalNaf) * 100) : 0;
    
    return {
      openCalls,
      actionable,
      planned,
      callAllocation,
      printOpenGe2,
      printActionableGe2,
      printScheduledGe2,
      openCallsGt10,
      actionableGt10,
      scheduledGt10,
      mpsGt1,
      eodCloser,
      newCalls,
      csoDaysInventory,
      enggCount,
      engAvlInField,
      enggProductivity,
      missedToSchedule,
      missedByEng,
      gTotalMissed,
      pctMissed,
      closureAdherence,
      
      // Right Table NAF
      flexBackend,
      ssc,
      hpBackend,
      obsCustomer,
      cuPending,
      physicalClosed,
      totalNaf,
      sscPct,
    };
  }, [report, selectedRegion, regionFilteredRows]);

  const engineerProductivityMetrics = useMemo(() => {
    if (!report) return { list: [], totalAttended: 0, monthsList: [], datesList: [], todayStr: "" };

    // 1. Filter rows by selectedRegion
    let regionRows = report.rows;
    if (selectedRegion && selectedRegion !== "ALL") {
      regionRows = report.rows.filter(r => r.output["Work Location"] === selectedRegion);
    }

    // 2. Identify all unique months and dates in these rows
    const monthsSet = new Set<string>();
    const datesSet = new Set<string>();
    
    const getFormattedReportDate = (reportDateStr: string): string => {
      const parts = reportDateStr.split("-");
      if (parts.length === 3 && parts[0] && parts[1] && parts[2] && parts[0].length === 4) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return reportDateStr;
    };

    const todayStr = report.reportDate ? getFormattedReportDate(report.reportDate) : "";

    for (const r of regionRows) {
      const createdTime = String(r.output["Case Created Time"] ?? "").trim();
      if (createdTime && createdTime !== MANUAL_ENTRY_REQUIRED) {
        const match = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(createdTime);
        if (match) {
          const day = match[1] ?? "";
          const monthCode = match[2] ?? "";
          const year = match[3] ?? "";
          
          const monthIndex = parseInt(monthCode, 10) - 1;
          const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
          const monthName = monthNames[monthIndex] ?? "Unknown";
          
          monthsSet.add(`${monthName} ${year}`);
          datesSet.add(`${day}-${monthCode}-${year}`);
        }
      }
    }

    const monthsList = Array.from(monthsSet).sort((a, b) => a.localeCompare(b));
    const datesList = Array.from(datesSet).sort((a, b) => {
      const parseDMY = (s: string) => {
        const p = s.split("-");
        const day = parseInt(p[0] ?? "0", 10);
        const month = parseInt(p[1] ?? "0", 10) - 1;
        const year = parseInt(p[2] ?? "0", 10);
        return new Date(year, month, day).getTime();
      };
      return parseDMY(a) - parseDMY(b);
    });

    // 3. Filter rows based on type
    let filteredRowsForProd = regionRows;
    if (productivityFilterType === "Today" && todayStr) {
      filteredRowsForProd = regionRows.filter(r => {
        const createdTime = String(r.output["Case Created Time"] ?? "").trim();
        if (createdTime && createdTime !== MANUAL_ENTRY_REQUIRED) {
          const match = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(createdTime);
          if (match) {
            const rowDate = `${match[1]}-${match[2]}-${match[3]}`;
            return rowDate === todayStr;
          }
        }
        return false;
      });
    } else if (productivityFilterType === "Specific Date" && selectedProductivityValue) {
      filteredRowsForProd = regionRows.filter(r => {
        const createdTime = String(r.output["Case Created Time"] ?? "").trim();
        if (createdTime && createdTime !== MANUAL_ENTRY_REQUIRED) {
          const match = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(createdTime);
          if (match) {
            const rowDate = `${match[1]}-${match[2]}-${match[3]}`;
            return rowDate === selectedProductivityValue;
          }
        }
        return false;
      });
    } else if (productivityFilterType === "Specific Month" && selectedProductivityValue) {
      filteredRowsForProd = regionRows.filter(r => {
        const createdTime = String(r.output["Case Created Time"] ?? "").trim();
        if (createdTime && createdTime !== MANUAL_ENTRY_REQUIRED) {
          const match = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(createdTime);
          if (match) {
            const monthCode = match[2] ?? "";
            const year = match[3] ?? "";
            const monthIndex = parseInt(monthCode, 10) - 1;
            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            const rowMonth = `${monthNames[monthIndex]} ${year}`;
            return rowMonth === selectedProductivityValue;
          }
        }
        return false;
      });
    }

    // 4. Group by unique engineers
    const active = filteredRowsForProd.filter((r) => !r.carryForward.closedSyntheticRow);
    const closed = filteredRowsForProd.filter((r) => r.carryForward.closedSyntheticRow);

    const getUniqueEngineers = (items: typeof filteredRowsForProd) => {
      const list = items
        .map((r) => String(r.output.Engineer ?? "").trim())
        .filter((name) => name && name !== "Manual Entry Required");
      return Array.from(new Set(list));
    };

    const allEngNames = getUniqueEngineers(filteredRowsForProd);
    
    const list = allEngNames.map((engName) => {
      const engActive = active.filter(r => String(r.output.Engineer ?? "").trim() === engName);
      const engClosed = closed.filter(r => String(r.output.Engineer ?? "").trim() === engName);
      
      const countStatus = (items: typeof engActive, keywords: string[]) => {
        return items.filter(r => {
          const s = String(r.output["RTPL status"] ?? "").trim().toLowerCase();
          return keywords.some(kw => s.includes(kw.toLowerCase()));
        }).length;
      };

      const closedCount = engClosed.length + countStatus(engActive, ["closed"]);
      const partOrderedCount = countStatus(engActive, ["part", "additional part", "part order pending"]);
      const underObservationCount = countStatus(engActive, ["observation", "crt pending", "ct validation"]);
      const cxRescheduleCount = countStatus(engActive, ["cx", "reschedule", "cust pending", "customer pending"]);

      const attendedCount = closedCount + partOrderedCount + underObservationCount;
      const assignedCount = attendedCount + cxRescheduleCount;

      return {
        name: engName,
        assigned: assignedCount,
        attended: attendedCount,
        closed: closedCount,
        partOrdered: partOrderedCount,
        underObservation: underObservationCount,
        cxReschedule: cxRescheduleCount,
      };
    }).sort((a, b) => b.attended - a.attended || a.name.localeCompare(b.name));

    const totalAttended = list.reduce((sum, item) => sum + item.attended, 0);

    return { list, totalAttended, monthsList, datesList, todayStr };
  }, [report, selectedRegion, productivityFilterType, selectedProductivityValue]);

  useEffect(() => {
    if (productivityFilterType === "Specific Date") {
      if (!selectedProductivityValue || !engineerProductivityMetrics.datesList.includes(selectedProductivityValue)) {
        setSelectedProductivityValue(engineerProductivityMetrics.datesList[0] || "");
      }
    } else if (productivityFilterType === "Specific Month") {
      if (!selectedProductivityValue || !engineerProductivityMetrics.monthsList.includes(selectedProductivityValue)) {
        setSelectedProductivityValue(engineerProductivityMetrics.monthsList[0] || "");
      }
    } else {
      setSelectedProductivityValue("");
    }
  }, [productivityFilterType, engineerProductivityMetrics.datesList, engineerProductivityMetrics.monthsList, selectedProductivityValue]);

  const productivityDateLabel = useMemo(() => {
    if (productivityFilterType === "Today") {
      return `Today (${engineerProductivityMetrics.todayStr || ""})`;
    }
    if (productivityFilterType === "Specific Date") {
      return selectedProductivityValue || "Specific Date";
    }
    if (productivityFilterType === "Specific Month") {
      return selectedProductivityValue || "Specific Month";
    }
    return "All Dates";
  }, [productivityFilterType, engineerProductivityMetrics.todayStr, selectedProductivityValue]);

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

  const rtplRowsForSelectedScope = useMemo(() => {
    switch (selectedRtplCaseScope) {
      case "warranty":
        return activeRows.filter(isWarrantyCase);
      case "trade":
        return activeRows.filter(isTradeCase);
      case "overall":
      default:
        return activeRows;
    }
  }, [activeRows, selectedRtplCaseScope]);

  const rtplRowsForSelectedRegion = useMemo(
    () => filterRowsByRegion(activeRows, selectedRtplRegion),
    [activeRows, selectedRtplRegion],
  );

  const rtplCaseScopeOptions = useMemo(
    () =>
      RTPL_CASE_SCOPE_OPTIONS.map((option) => {
        const count =
          option.value === "warranty"
            ? rtplRowsForSelectedRegion.filter(isWarrantyCase).length
            : option.value === "trade"
              ? rtplRowsForSelectedRegion.filter(isTradeCase).length
              : rtplRowsForSelectedRegion.length;

        return { ...option, count };
      }),
    [rtplRowsForSelectedRegion],
  );

  const rtplRegionOptions = useMemo(() => {
    if (!report) return [];

    return [
      { value: ALL_REGIONS_FILTER, label: "All", count: rtplRowsForSelectedScope.length },
      ...activeRegionBreakdown.map((entry) => {
        const scopedCount = rtplRowsForSelectedScope.filter(
          (row) => row.output["Work Location"] === entry.aspCode,
        ).length;

        return {
          value: entry.aspCode,
          label: entry.regionName,
          count: scopedCount,
        };
      }),
    ];
  }, [activeRegionBreakdown, report, rtplRowsForSelectedScope]);

  const rtplAnalyticsRows = useMemo(() => {
    if (!report) return [];
    return filterRowsByRegion(rtplRowsForSelectedScope, selectedRtplRegion);
  }, [report, rtplRowsForSelectedScope, selectedRtplRegion]);

  const flexStatusMetrics = useMemo(
    () => buildFlexOperationalAnalytics(rtplAnalyticsRows),
    [rtplAnalyticsRows],
  );

  const visibleRtplStatusChanges = useMemo(() => {
    const scopedTicketIds = new Set(
      rtplAnalyticsRows
        .map((row) => String(row.output["Ticket ID"] ?? "").trim())
        .filter(Boolean),
    );

    return rtplStatusChanges.filter((change) => {
      const matchesRegion =
        selectedRtplRegion === ALL_REGIONS_FILTER ||
        change.workLocation?.trim().toUpperCase() === selectedRtplRegion;
      const matchesScope =
        selectedRtplCaseScope === "overall" ||
        scopedTicketIds.has(change.ticketId.trim());

      return matchesRegion && matchesScope;
    });
  }, [rtplAnalyticsRows, rtplStatusChanges, selectedRtplCaseScope, selectedRtplRegion]);

  const rtplTimeCards = useMemo(
    () => buildRtplTimeCards(rtplAnalyticsRows, visibleRtplStatusChanges),
    [rtplAnalyticsRows, visibleRtplStatusChanges],
  );

  const selectedRtplTimeCard = useMemo(
    () =>
      rtplTimeCards.find((card) => card.id === selectedRtplTimeCardId) ??
      rtplTimeCards[0] ??
      null,
    [rtplTimeCards, selectedRtplTimeCardId],
  );

  const selectedRtplModalDetails = selectedRtplTimeCard
    ? selectedRtplModalStatus
      ? selectedRtplTimeCard.details.filter((detail) => {
          const detailStatus =
            detail.type === "carry-forward" ? detail.status : formatRtplStatusValue(detail.toStatus);
          return detailStatus.trim().toLowerCase() === selectedRtplModalStatus.trim().toLowerCase();
        })
      : selectedRtplTimeCard.details
    : [];
  const visibleRtplTimeDetails = selectedRtplModalDetails.slice(0, RTPL_MODAL_DETAIL_LIMIT);
  const hiddenRtplTimeDetailCount = selectedRtplTimeCard
    ? Math.max(selectedRtplModalDetails.length - visibleRtplTimeDetails.length, 0)
    : 0;

  function openRtplCheckpointModal(
    cardId: RtplTimeCardId,
    status: string | null = null,
  ): void {
    setSelectedRtplTimeCardId(cardId);
    setSelectedRtplModalStatus(status);
    setIsRtplTimeModalOpen(true);
  }

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

  function handleSessionExpired() {
    handleLogout();
    setMessage("Session expired, please login again.");
  }

  function isCurrentSessionAuthError(error: unknown): boolean {
    return Boolean(session) && isApiAuthError(error);
  }

  function handleBackgroundError(error: unknown) {
    if (isCurrentSessionAuthError(error)) {
      handleSessionExpired();
      return;
    }

    setMessage(error instanceof Error ? error.message : "Operation failed");
  }

  useEffect(() => {
    if (!session || !report?.reportId) {
      setRtplStatusChanges([]);
      return;
    }

    let cancelled = false;

    getRtplStatusChanges({
      token: session.token,
      reportId: report.reportId,
      changeDate: rtplAnalyticsDate,
      limit: RTPL_STATUS_CHANGE_LIMIT,
    })
      .then((changes) => {
        if (!cancelled) {
          setRtplStatusChanges(changes);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          handleBackgroundError(error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [report?.reportId, rtplAnalyticsDate, session]);

  async function refreshHistory() {
    if (!session) return;

    try {
      setHistorySessions(await getReportHistory(session.token));
    } catch (error) {
      handleBackgroundError(error);
    }
  }

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
      }).catch(handleBackgroundError);
      getEngineersDropdown(session.token)
        .then((res) => setEngineersList(res.engineers))
        .catch(handleBackgroundError);
    } else {
      setHistorySessions([]);
      setEngineersList([]);
      hasAutoRestoredHistoryRef.current = false;
    }
  }, [session]);

  async function runAction(action: () => Promise<void>) {
    setIsBusy(true);
    setMessage(null);

    try {
      await action();
    } catch (error) {
      if (isCurrentSessionAuthError(error)) {
        handleSessionExpired();
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
      if (nextSession.user.mustChangePassword) {
        window.location.href = "/me/password";
      }
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
      setReportDate(todayIsoDate());
      setRtplAnalyticsDate(todayIsoDate());
      setWorkspaceView("overview");
      setIsUploadDrawerOpen(false);
      
      // Refresh history to get the draft
      await refreshHistory();
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
      await refreshHistory();
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
      const isRegionAdmin = session.user.role === "REGION_ADMIN";
      const effectiveRegionId = isRegionAdmin
        ? session.user.regionId ?? ""
        : detail.regionId || regionId;
      if (!isRegionAdmin && detail.regionId) setRegionId(detail.regionId);
      if (detail.reportDate) setReportDate(detail.reportDate);
      window.localStorage.setItem(LAST_HISTORY_SESSION_KEY, detail.id);

      // Fetch preview and report if applicable
      const prev = await previewMatches({
        token: session.token,
        regionId: effectiveRegionId,
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
           regionId: effectiveRegionId,
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
    await runAction(async () => {
      await renameReportHistory(session.token, historySession.id, newTitle);
      await refreshHistory();
    });
  }



  async function handleHistoryDelete(historySession: ReportHistorySession) {
    if (!session) return;
    if (!window.confirm("Are you sure you want to delete this session?")) return;
    await runAction(async () => {
      await deleteReportHistory(session.token, historySession.id);
      await refreshHistory();
    });
  }

  const canUseBatches = Boolean(batchIds.flexUploadBatchId);
  const incompleteCellCount = useMemo(() => {
    return report ? countManualRequiredCells(report.rows) : 0;
  }, [report]);

  function startEditing(row: GeneratedReportResponse["rows"][number]) {
    setEditingSerialNo(row.serialNo);
    setDraftOutput({ ...row.output });
  }

  function startModalEditing(row: GeneratedReportResponse["rows"][number]) {
    startEditing(row);
    setIsEditModalOpen(true);
  }

  function cancelEditing() {
    setEditingSerialNo(null);
    setDraftOutput({});
    setIsEditModalOpen(false);
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
      if (persisted.rtplStatusChange) {
        const change = persisted.rtplStatusChange;
        const changeKey = change.id ?? `${change.rowId}:${change.changedAt}`;

        if (dateIsoInIst(change.changedAt) === rtplAnalyticsDate) {
          setRtplStatusChanges((currentChanges) => [
            change,
            ...currentChanges.filter(
              (existingChange) =>
                (existingChange.id ?? `${existingChange.rowId}:${existingChange.changedAt}`) !==
                changeKey,
            ),
          ].slice(0, RTPL_STATUS_CHANGE_LIMIT));
        }
        setMessage(
          `RTPL status changed for WO ${change.ticketId || row.output["Ticket ID"] || serialNo}: ${formatRtplStatusValue(change.fromStatus)} -> ${formatRtplStatusValue(change.toStatus)} at ${formatRtplChangeTime(change.changedAt)}.`,
        );
      } else {
        setMessage("Row saved.");
      }
    } catch (error) {
      setReport(currentReport);
      setMessage(error instanceof Error ? `Save failed: ${error.message}` : "Save failed");
    } finally {
      setSavingSerialNo(null);
    }
  }

  async function handleDeleteRow(serialNo: number) {
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
      setMessage("Delete failed: this row has not been persisted yet.");
      return;
    }

    if (!window.confirm("Are you sure you want to delete this case? It will be removed from tomorrow's report generation.")) {
      return;
    }

    setSavingSerialNo(serialNo);
    setMessage(null);

    try {
      await deleteReportRow(session.token, row.id);

      setReport((latestReport) => {
        if (!latestReport) {
          return latestReport;
        }

        return {
          ...latestReport,
          rows: latestReport.rows.filter((latestRow) => latestRow.serialNo !== serialNo),
        };
      });
      cancelEditing();
      setMessage("Row deleted successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? `Delete failed: ${error.message}` : "Delete failed");
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
    const hasConsumerFilter = showConsumerOnly;
    const hasCommercialFilter = showCommercialOnly;
    const hasWarrantyFilter = showWarrantyOnly;
    const hasNonWarrantyFilter = showNonWarrantyOnly;
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
    } else if (hasConsumerFilter) {
      const scopedConsumerRows = scopedRows(consumerRows);
      exportRows = applyActiveTableFilters(scopedConsumerRows);
    } else if (hasCommercialFilter) {
      const scopedCommercialRows = scopedRows(commercialRows);
      exportRows = applyActiveTableFilters(scopedCommercialRows);
    } else if (hasWarrantyFilter) {
      const scopedWarrantyRows = scopedRows(warrantyRows);
      exportRows = applyActiveTableFilters(scopedWarrantyRows);
    } else if (hasNonWarrantyFilter) {
      const scopedNonWarrantyRows = scopedRows(nonWarrantyRows);
      exportRows = applyActiveTableFilters(scopedNonWarrantyRows);
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
    consumerOnly = false,
    commercialOnly = false,
    warrantyOnly = false,
    nonWarrantyOnly = false,
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
    consumerOnly?: boolean;
    commercialOnly?: boolean;
    warrantyOnly?: boolean;
    nonWarrantyOnly?: boolean;
  }>) {
    setSelectedRegion(region ?? null);
    setSelectedWoOtcCode(woOtcCode ?? null);
    setShowCissOnly(cissOnly);
    setShowRcaOnly(rcaOnly);
    setShowTradeOnly(tradeOnly);
    setShowClosedOnly(closedOnly);
    setShowConsumerOnly(consumerOnly);
    setShowCommercialOnly(commercialOnly);
    setShowWarrantyOnly(warrantyOnly);
    setShowNonWarrantyOnly(nonWarrantyOnly);
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
    showConsumerOnly ? "Consumer cases" : null,
    showCommercialOnly ? "Commercial cases" : null,
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
                    className={`regionMetric ${selectedRegion === "ALL" && !selectedWoOtcCode && !showConsumerOnly && !showCommercialOnly && !showWarrantyOnly && !showNonWarrantyOnly ? "active" : ""}`}
                    onClick={() => openRecordsWithFilter({ region: "ALL" })}
                    style={{ cursor: "pointer", border: "2px solid var(--accent)", background: "var(--accent-tint)" }}
                  >
                    <div className="regionMetricHeader">
                        <div className="regionMetricValue">{activeRows.length}</div>
                      <div className="regionMetricLabel">ALL REGIONS</div>
                      <div className="regionMetricSubtext">OVERALL</div>
                    </div>

                    <div className="regionSegmentMetrics">
                      <button
                        type="button"
                        className={`regionSegmentMetric ${selectedRegion === "ALL" && showConsumerOnly ? "active" : ""}`}
                        style={{
                          padding: "4px 6px",
                          gap: "4px",
                          ...(selectedRegion === "ALL" && showConsumerOnly ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" } : {})
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openRecordsWithFilter({ region: "ALL", consumerOnly: true });
                        }}
                      >
                        <span style={{ fontSize: "10px", textTransform: "none", fontWeight: "700" }}>Consumer</span>
                        <strong
                          style={{
                            minWidth: "20px",
                            padding: "2px 6px",
                            fontSize: "11px",
                            ...(selectedRegion === "ALL" && showConsumerOnly ? { background: "#ffffff", color: "var(--accent)" } : {})
                          }}
                        >
                          {consumerRows.length}
                        </strong>
                      </button>
                      <button
                        type="button"
                        className={`regionSegmentMetric ${selectedRegion === "ALL" && showCommercialOnly ? "active" : ""}`}
                        style={{
                          padding: "4px 6px",
                          gap: "4px",
                          ...(selectedRegion === "ALL" && showCommercialOnly ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" } : {})
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openRecordsWithFilter({ region: "ALL", commercialOnly: true });
                        }}
                      >
                        <span style={{ fontSize: "10px", textTransform: "none", fontWeight: "700" }}>Commercial</span>
                        <strong
                          style={{
                            minWidth: "20px",
                            padding: "2px 6px",
                            fontSize: "11px",
                            ...(selectedRegion === "ALL" && showCommercialOnly ? { background: "#ffffff", color: "var(--accent)" } : {})
                          }}
                        >
                          {commercialRows.length}
                        </strong>
                      </button>
                    </div>

                    <div className="regionSegmentMetrics" style={{ marginTop: "8px" }}>
                      <button
                        type="button"
                        className={`regionSegmentMetric ${selectedRegion === "ALL" && showWarrantyOnly ? "active" : ""}`}
                        style={{
                          padding: "4px 6px",
                          gap: "4px",
                          ...(selectedRegion === "ALL" && showWarrantyOnly ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" } : {})
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openRecordsWithFilter({ region: "ALL", warrantyOnly: true });
                        }}
                      >
                        <span style={{ fontSize: "9px", textTransform: "none", fontWeight: "700" }}>Warranty</span>
                        <strong
                          style={{
                            minWidth: "20px",
                            padding: "2px 6px",
                            fontSize: "11px",
                            ...(selectedRegion === "ALL" && showWarrantyOnly ? { background: "#ffffff", color: "var(--accent)" } : {})
                          }}
                        >
                          {warrantyRows.length}
                        </strong>
                      </button>
                      <button
                        type="button"
                        className={`regionSegmentMetric ${selectedRegion === "ALL" && showNonWarrantyOnly ? "active" : ""}`}
                        style={{
                          padding: "4px 6px",
                          gap: "4px",
                          ...(selectedRegion === "ALL" && showNonWarrantyOnly ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" } : {})
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openRecordsWithFilter({ region: "ALL", nonWarrantyOnly: true });
                        }}
                      >
                        <span style={{ fontSize: "9px", textTransform: "none", fontWeight: "700" }}>Non-Warranty</span>
                        <strong
                          style={{
                            minWidth: "20px",
                            padding: "2px 6px",
                            fontSize: "11px",
                            ...(selectedRegion === "ALL" && showNonWarrantyOnly ? { background: "#ffffff", color: "var(--accent)" } : {})
                          }}
                        >
                          {nonWarrantyRows.length}
                        </strong>
                      </button>
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
                      className={`regionMetric ${selectedRegion === entry.aspCode && !selectedWoOtcCode && !showConsumerOnly && !showCommercialOnly && !showWarrantyOnly && !showNonWarrantyOnly ? "active" : ""}`}
                      onClick={() => openRecordsWithFilter({ region: entry.aspCode })}
                      style={{ cursor: "pointer" }}
                    >
                      <div className="regionMetricHeader">
                        <div className="regionMetricValue">{entry.count}</div>
                        <div className="regionMetricLabel">{entry.regionName}</div>
                        <div className="regionMetricSubtext">{entry.aspCode}</div>
                      </div>

                      <div className="regionSegmentMetrics">
                        <button
                          type="button"
                          className={`regionSegmentMetric ${selectedRegion === entry.aspCode && showConsumerOnly ? "active" : ""}`}
                          style={{
                            padding: "4px 6px",
                            gap: "4px",
                            ...(selectedRegion === entry.aspCode && showConsumerOnly ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" } : {})
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openRecordsWithFilter({ region: entry.aspCode, consumerOnly: true });
                          }}
                        >
                          <span style={{ fontSize: "10px", textTransform: "none", fontWeight: "700" }}>Consumer</span>
                          <strong
                            style={{
                              minWidth: "20px",
                              padding: "2px 6px",
                              fontSize: "11px",
                              ...(selectedRegion === entry.aspCode && showConsumerOnly ? { background: "#ffffff", color: "var(--accent)" } : {})
                            }}
                          >
                            {entry.consumerCount}
                          </strong>
                        </button>
                        <button
                          type="button"
                          className={`regionSegmentMetric ${selectedRegion === entry.aspCode && showCommercialOnly ? "active" : ""}`}
                          style={{
                            padding: "4px 6px",
                            gap: "4px",
                            ...(selectedRegion === entry.aspCode && showCommercialOnly ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" } : {})
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openRecordsWithFilter({ region: entry.aspCode, commercialOnly: true });
                          }}
                        >
                          <span style={{ fontSize: "10px", textTransform: "none", fontWeight: "700" }}>Commercial</span>
                          <strong
                            style={{
                              minWidth: "20px",
                              padding: "2px 6px",
                              fontSize: "11px",
                              ...(selectedRegion === entry.aspCode && showCommercialOnly ? { background: "#ffffff", color: "var(--accent)" } : {})
                            }}
                          >
                            {entry.commercialCount}
                          </strong>
                        </button>
                      </div>

                      <div className="regionSegmentMetrics" style={{ marginTop: "8px" }}>
                        <button
                          type="button"
                          className={`regionSegmentMetric ${selectedRegion === entry.aspCode && showWarrantyOnly ? "active" : ""}`}
                          style={{
                            padding: "4px 6px",
                            gap: "4px",
                            ...(selectedRegion === entry.aspCode && showWarrantyOnly ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" } : {})
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openRecordsWithFilter({ region: entry.aspCode, warrantyOnly: true });
                          }}
                        >
                          <span style={{ fontSize: "9px", textTransform: "none", fontWeight: "700" }}>Warranty</span>
                          <strong
                            style={{
                              minWidth: "20px",
                              padding: "2px 6px",
                              fontSize: "11px",
                              ...(selectedRegion === entry.aspCode && showWarrantyOnly ? { background: "#ffffff", color: "var(--accent)" } : {})
                            }}
                          >
                            {entry.warrantyCount}
                          </strong>
                        </button>
                        <button
                          type="button"
                          className={`regionSegmentMetric ${selectedRegion === entry.aspCode && showNonWarrantyOnly ? "active" : ""}`}
                          style={{
                            padding: "4px 6px",
                            gap: "4px",
                            ...(selectedRegion === entry.aspCode && showNonWarrantyOnly ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" } : {})
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openRecordsWithFilter({ region: entry.aspCode, nonWarrantyOnly: true });
                          }}
                        >
                          <span style={{ fontSize: "9px", textTransform: "none", fontWeight: "700" }}>Non-Warranty</span>
                          <strong
                            style={{
                              minWidth: "20px",
                              padding: "2px 6px",
                              fontSize: "11px",
                              ...(selectedRegion === entry.aspCode && showNonWarrantyOnly ? { background: "#ffffff", color: "var(--accent)" } : {})
                            }}
                          >
                            {entry.nonWarrantyCount}
                          </strong>
                        </button>
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



              <div className="rtplAnalyticsSection">
                <div className="sectionHeader rtplAnalyticsHeader">
                  <div>
                    <h3>RTPL Operational Analytics</h3>
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
                          {card.statusBreakdown.map((entry) => (
                            <div
                              key={entry.status}
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

              <div className="rtplAnalyticsSection">
                <div className="sectionHeader rtplAnalyticsHeader">
                  <div>
                    <h3>Flex Operational Analytics</h3>
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

              {showDayOverDayComparison && (
                <ComparisonSummaryPanel report={report} />
              )}
              {showManualCarryForward && (
                <CarryForwardSummaryPanel report={report} />
              )}

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

              <div className={`recordsArea ${isRecordsSummaryHidden ? "summaryHidden" : ""}`}>
                {!isRecordsSummaryHidden ? (
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
                ) : null}
              <div className="downloadActions recordsToolbar">
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
                  {selectedRegion && selectedRegion !== "ALL" && regionKpiMetrics && (
                    <>
                      <button
                        type="button"
                        className="downloadBtn excelBtn"
                        style={{ background: "linear-gradient(135deg, #0284c7, #0369a1)", borderColor: "#0284c7", color: "#ffffff" }}
                        onClick={() => setIsKpiModalOpen(true)}
                      >
                        📊 VIEW TN REPORT
                      </button>
                      <button
                        type="button"
                        className="downloadBtn excelBtn"
                        style={{ background: "linear-gradient(135deg, #0ea5e9, #0284c7)", borderColor: "#0ea5e9", color: "#ffffff" }}
                        onClick={() => setIsChennaiKpiModalOpen(true)}
                      >
                        📊 VIEW EOD&BOD REPORT DASHBOARD
                      </button>
                    </>
                  )}
                  {(session?.user?.role === "SUPER_ADMIN" || (selectedRegion && selectedRegion !== "ALL" && regionKpiMetrics)) && (
                    <button
                      type="button"
                      className="downloadBtn excelBtn"
                      style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", borderColor: "#f97316", color: "#ffffff" }}
                      onClick={() => setIsProductivityModalOpen(true)}
                    >
                      📊 VIEW ENGINEER PRODUCTIVITY
                    </button>
                  )}
                </div>
                <div className="recordsToolbarRight">
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
                  <button
                    type="button"
                    className="secondaryButton backToDashboardButton"
                    onClick={() => setWorkspaceView("overview")}
                  >
                    Back to Dashboard
                  </button>
                </div>
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

              <div
                className="tableWrap"
                ref={recordsTableWrapRef}
                onScroll={(event) => {
                  const hasTableScroll = event.currentTarget.scrollTop > 0;
                  setIsRecordsSummaryHidden(hasTableScroll || window.scrollY > 24);
                }}
              >
                <table>
                  <thead>
                    <tr>
                      {DAILY_CALL_PLAN_COLUMNS.map((column) => {
                        const isFilterable = colFilters.isFilterable(column);
                        const isFiltered = colFilters.isColumnFiltered(column);
                        const uniqueVals = colFilters.uniqueValuesMap.get(column) ?? [];

                        return (
                          <th key={column} className={tableColumnClassName(column)}>
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
                      <th>Change</th>
                      <th>Ops</th>
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
                                  tableColumnClassName(column),
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
                                        <RTPLStatusDropdown
                                          value={String(draftOutput[column] ?? "")}
                                          manualEntryRequiredLabel="Entry"
                                          onChange={(selected) => {
                                            if (selected === "Custom") {
                                              setDraftOutput((current) => ({
                                                ...current,
                                                [column]: "",
                                              }));
                                            } else {
                                              setDraftOutput((current) => ({
                                                ...current,
                                                [column]: selected,
                                              }));
                                            }
                                          }}
                                        />
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
                                  ) : column === "Engineer" ? (
                                    <select
                                      className="cellInput"
                                      value={String(draftOutput[column] ?? "")}
                                      onChange={(event) =>
                                        setDraftOutput((current) => ({
                                          ...current,
                                          [column]: event.target.value,
                                        }))
                                      }
                                    >
                                      <option value="">Entry</option>
                                      {engineersList.map(e => (
                                        <option key={e.id} value={e.engineerName}>{e.engineerName}</option>
                                      ))}
                                      {draftOutput[column] && draftOutput[column] !== MANUAL_ENTRY_REQUIRED && !engineersList.some(e => e.engineerName === String(draftOutput[column])) && (
                                        <option value={String(draftOutput[column])}>{String(draftOutput[column])} (Inactive/Not in list)</option>
                                      )}
                                    </select>
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
                                    {column === "Ticket ID" ? (
                                      <button
                                        type="button"
                                        className="ticketIdLink"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          startModalEditing(row);
                                        }}
                                        title="Click to view/edit order form"
                                      >
                                        {String(value ?? "")}
                                      </button>
                                    ) : (
                                      <span>{value === MANUAL_ENTRY_REQUIRED ? "Entry" : String(value ?? "")}</span>
                                    )}
                                    {isCarriedForward ? (
                                      <span className="cellCarryFlag">Carried</span>
                                    ) : null}
                                  </span>
                                )}
                              </td>
                            );
                          })}
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

          {preview && showMatchPreviewSection ? (
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
          {workspaceView === "overview" && (
            <div className="viewControlsPanel" style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "20px",
              padding: "12px 18px",
              background: "rgba(255, 255, 255, 0.85)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(15, 23, 42, 0.03)",
              backdropFilter: "blur(8px)",
              width: "fit-content",
              marginTop: "24px",
              justifySelf: "center"
            }}>
              <span style={{ fontSize: "11px", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Layout Controls
              </span>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "12px", fontWeight: 600, color: "var(--text)", userSelect: "none" }}>
                <input 
                  type="checkbox" 
                  checked={showDayOverDayComparison} 
                  onChange={(e) => setShowDayOverDayComparison(e.target.checked)}
                  style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "var(--accent)", margin: 0 }}
                />
                Show Day-over-Day Comparison
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "12px", fontWeight: 600, color: "var(--text)", userSelect: "none" }}>
                <input 
                  type="checkbox" 
                  checked={showMatchPreviewSection} 
                  onChange={(e) => setShowMatchPreviewSection(e.target.checked)}
                  style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "var(--accent)", margin: 0 }}
                />
                Show Match Preview
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "12px", fontWeight: 600, color: "var(--text)", userSelect: "none" }}>
                <input 
                  type="checkbox" 
                  checked={showManualCarryForward} 
                  onChange={(e) => setShowManualCarryForward(e.target.checked)}
                  style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "var(--accent)", margin: 0 }}
                />
                Show Manual Field Carry-Forward
              </label>
            </div>
          )}
        </section>
      </section>

      {/* 1. Salem Region KPI Summary Popup Modal */}
      {isKpiModalOpen && selectedRegion && selectedRegion !== "ALL" && regionKpiMetrics && (
        <div className="drawerOverlay" style={{ zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15, 23, 42, 0.45)" }} onClick={() => setIsKpiModalOpen(false)}>
          <div 
            style={{ 
              background: "#ffffff", 
              borderRadius: "12px", 
              width: "min(640px, 95vw)", 
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.15)", 
              padding: "24px", 
              display: "grid", 
              gap: "18px", 
              position: "relative",
              border: "1px solid var(--border)"
            }} 
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "12px" }}>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "700" }}>📊 {activeRegionName} KPI Performance Summary</h2>
              <button 
                type="button" 
                className="secondaryButton" 
                style={{ minHeight: "32px", padding: "0 12px", borderRadius: "6px", fontSize: "13px" }} 
                onClick={() => setIsKpiModalOpen(false)}
              >
                Close
              </button>
            </div>

            <div style={{ maxHeight: "60vh", overflowY: "auto", paddingRight: "4px" }}>
              <table className="kpiSummaryTable" style={{ width: "100%", borderCollapse: "collapse", minWidth: "480px" }}>
                <thead>
                  <tr style={{ background: "#0284c7", color: "#ffffff", fontWeight: "bold" }}>
                    <td colSpan={2} style={{ padding: "10px", border: "1px solid #cbd5e1", fontSize: "13px" }}>{report?.reportDate || todayIsoDate()}</td>
                    <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "right", fontSize: "13px" }}>{activeRegionName}</td>
                  </tr>
                  <tr style={{ background: "#fef08a", color: "#854d0e", fontWeight: "bold" }}>
                    <td style={{ width: "80px", padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>S.No</td>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1", fontSize: "12px" }}>Description</td>
                    <td style={{ width: "120px", padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>Count</td>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { id: 1, desc: "Engineer Count", val: regionKpiMetrics.engineerCount },
                    { id: 2, desc: "No.of Engg Presents", val: regionKpiMetrics.enggPresents },
                    { id: 3, desc: "Open Calls", val: regionKpiMetrics.openCalls },
                    { id: 4, desc: "Actionable Calls", val: regionKpiMetrics.actionable },
                    { id: 5, desc: "Planned Calls", val: regionKpiMetrics.planned },
                    { id: 6, desc: "Closed Calls", val: regionKpiMetrics.closedCalls, alert: true },
                    { id: 7, desc: "Engg onsite", val: regionKpiMetrics.enggOnsite },
                    { id: 8, desc: "To be schedule", val: regionKpiMetrics.toBeSchedule },
                    { id: 9, desc: "CX Reschedule Calls", val: regionKpiMetrics.cxReschedule },
                    { id: 10, desc: "SSC Pending Calls", val: regionKpiMetrics.sscPending },
                    { id: 11, desc: "Elevate/Tech Support Calls", val: regionKpiMetrics.elevateTech },
                    { id: 12, desc: "Under observation Calls", val: regionKpiMetrics.underObservation },
                    { id: 13, desc: "To be Yank", val: regionKpiMetrics.toBeYank },
                    { id: 14, desc: "Closed cancelled", val: regionKpiMetrics.closedCancelled },
                    { id: 15, desc: "Add.Part ordered", val: regionKpiMetrics.addPartOrdered, alert: true },
                    { id: 16, desc: "To be Cancel", val: regionKpiMetrics.toBeCancel },
                    { id: 17, desc: "New calls", val: regionKpiMetrics.newCalls, alert: true },
                    { id: 18, desc: "Trade Open Calls", val: regionKpiMetrics.tradeOpenCalls },
                  ].map((m) => (
                    <tr key={m.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "6px", border: "1px solid #cbd5e1", textAlign: "center", background: "#f8fafc", fontWeight: "600", color: "#334155" }}>{m.id}</td>
                      <td style={{ padding: "6px", border: "1px solid #cbd5e1", color: "#334155" }}>{m.desc}</td>
                      <td style={{ padding: "6px", border: "1px solid #cbd5e1", textAlign: "center", background: m.alert ? "#fef08a" : "transparent", color: m.alert ? "#854d0e" : "#0f172a", fontWeight: "bold" }}>{m.val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
              <button
                type="button"
                className="secondaryButton"
                onClick={() => setIsKpiModalOpen(false)}
              >
                Close
              </button>
              <button
                type="button"
                style={{ background: "linear-gradient(135deg, #0284c7, #0369a1)", borderColor: "#0284c7", display: "inline-flex", alignItems: "center", gap: "6px", color: "#ffffff" }}
                onClick={() => {
                  downloadRegionSummaryExcel(activeRegionName, report?.reportDate || todayIsoDate(), regionFilteredRows, false);
                }}
              >
                📥 Download Summary Excel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Chennai Region Dashboard Summary Popup Modal */}
      {isChennaiKpiModalOpen && selectedRegion && selectedRegion !== "ALL" && chennaiKpiMetrics && (
        <div className="drawerOverlay" style={{ zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15, 23, 42, 0.45)" }} onClick={() => setIsChennaiKpiModalOpen(false)}>
          <div 
            style={{ 
              background: "#ffffff", 
              borderRadius: "12px", 
              width: "min(1000px, 98vw)", 
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.15)", 
              padding: "24px", 
              display: "grid", 
              gap: "18px", 
              position: "relative",
              border: "1px solid var(--border)"
            }} 
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "12px" }}>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "700" }}>📊 {activeRegionName} Dashboard Summary</h2>
              <button 
                type="button" 
                className="secondaryButton" 
                style={{ minHeight: "32px", padding: "0 12px", borderRadius: "6px", fontSize: "13px" }} 
                onClick={() => setIsChennaiKpiModalOpen(false)}
              >
                Close
              </button>
            </div>

            <div style={{ maxHeight: "60vh", overflowY: "auto", paddingRight: "4px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "20px" }}>
                {/* Left Table - CHENNAI DASHBOARD */}
                <div>
                  <table className="kpiSummaryTable" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#bae6fd", color: "#0f172a", fontWeight: "bold" }}>
                        <td colSpan={2} style={{ padding: "10px", border: "1px solid #cbd5e1", fontSize: "13px", fontWeight: "800" }}>
                          CHENNAI DASHBOARD
                        </td>
                        <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "right", fontSize: "12px", background: "#f1f5f9" }}>
                          Wednesday / {report?.reportDate ? formatDisplayDateOnly(report.reportDate) : "25th Mar"}
                        </td>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { id: 1, desc: "Total open call", val: chennaiKpiMetrics.openCalls },
                        { id: 2, desc: "Total field Actionable call", val: chennaiKpiMetrics.actionable },
                        { id: 3, desc: "Total Call Scheduled", val: chennaiKpiMetrics.planned },
                        { id: 4, desc: "Call Allocation Engineer Wise", val: chennaiKpiMetrics.callAllocation },
                        { id: 5, desc: "Print - Open call (=>2 days)", val: chennaiKpiMetrics.printOpenGe2 },
                        { id: 6, desc: "Print - Actionable call (=>2 days)", val: chennaiKpiMetrics.printActionableGe2 },
                        { id: 7, desc: "Print - Scheduled (=>2 days)", val: chennaiKpiMetrics.printScheduledGe2 },
                        { id: 8, desc: "Open call (>10 days)", val: chennaiKpiMetrics.openCallsGt10 },
                        { id: 9, desc: "Actionable call (>10 days)", val: chennaiKpiMetrics.actionableGt10 },
                        { id: 10, desc: "Call Scheduled (>10 days)", val: chennaiKpiMetrics.scheduledGt10 },
                        { id: 11, desc: "MPS >1 Days", val: chennaiKpiMetrics.mpsGt1 || "" },
                        { id: 12, desc: "EOD Call Closer", val: chennaiKpiMetrics.eodCloser || "" },
                        { id: 13, desc: "New Calls Received", val: chennaiKpiMetrics.newCalls || "" },
                        { id: 14, desc: "CSO Days Inventory", val: chennaiKpiMetrics.csoDaysInventory, isInventory: true },
                        { id: 15, desc: "Total Eng Count", val: chennaiKpiMetrics.enggCount },
                        { id: 16, desc: "Eng Avl in Field", val: chennaiKpiMetrics.engAvlInField },
                        { id: 17, desc: "Engineers Productivity", val: chennaiKpiMetrics.enggProductivity },
                        { id: 18, desc: "Missed to schedule field action calls due to non avl of Eng", val: chennaiKpiMetrics.missedToSchedule || "" },
                        { id: 19, desc: "Missed by Eng to attend scheduled Call (High call allocation)", val: chennaiKpiMetrics.missedByEng || "", isMissedByEng: true },
                        { id: 20, desc: "G Total (Missed to schedule & Attend Daily basis)", val: chennaiKpiMetrics.gTotalMissed || "" },
                        { id: 21, desc: "% - Missed to schedule & Attend Daily call", val: `${chennaiKpiMetrics.pctMissed}%`, isPctMissed: true },
                        { id: 22, desc: "Closure Adherence", val: `${chennaiKpiMetrics.closureAdherence}%`, isAdherence: true },
                      ].map((m) => {
                        let bg = "transparent";
                        let fg = "#334155";
                        let weight = "normal";
                        
                        if (m.isInventory) {
                          bg = m.val === "#DIV/0!" ? "#fee2e2" : "transparent";
                          fg = m.val === "#DIV/0!" ? "#dc2626" : "#334155";
                          weight = "bold";
                        } else if (m.isMissedByEng) {
                          bg = "#ffedd5";
                          fg = "#c2410c";
                        } else if (m.isPctMissed) {
                          bg = "#f1f5f9";
                          fg = "#334155";
                          weight = "bold";
                        } else if (m.isAdherence) {
                          bg = "#eab308";
                          fg = "#713f12";
                          weight = "bold";
                        }
                        
                        return (
                          <tr key={m.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                            <td style={{ padding: "6px 8px", border: "1px solid #cbd5e1", textAlign: "center", background: "#f8fafc", fontWeight: "600", color: "#334155", width: "40px" }}>{m.id}</td>
                            <td style={{ padding: "6px 8px", border: "1px solid #cbd5e1", color: "#334155", fontWeight: m.isAdherence ? "bold" : "normal" }}>{m.desc}</td>
                            <td style={{ padding: "6px 8px", border: "1px solid #cbd5e1", textAlign: "center", background: bg, color: fg, fontWeight: weight }}>{m.val}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Right Table - NAF ANALYSIS */}
                <div>
                  <table className="kpiSummaryTable" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#ffedd5", color: "#c2410c", fontWeight: "bold" }}>
                        <td style={{ padding: "10px", border: "1px solid #cbd5e1", fontSize: "13px" }}>Date</td>
                        <td style={{ padding: "10px", border: "1px solid #cbd5e1", background: "#fef08a", color: "#854d0e", textAlign: "center", fontSize: "13px", fontWeight: "800" }}>
                          {report?.reportDate ? formatDisplayDateOnly(report.reportDate) : "25th Feb"}
                        </td>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "Non Action-Field", val: chennaiKpiMetrics.totalNaf, isHeader: true },
                        { label: "Flex Backend", val: chennaiKpiMetrics.flexBackend || "" },
                        { label: "SSC", val: chennaiKpiMetrics.ssc || "" },
                        { label: "HP Backend", val: chennaiKpiMetrics.hpBackend || "" },
                        { label: "OBS-Customer", val: chennaiKpiMetrics.obsCustomer || "" },
                        { label: "Cu Pending", val: chennaiKpiMetrics.cuPending || "" },
                        { label: "Physical Closed", val: chennaiKpiMetrics.physicalClosed || "" },
                        { label: "Total NAF", val: chennaiKpiMetrics.totalNaf, isTotal: true },
                        { label: "SSC%", val: `${chennaiKpiMetrics.sscPct}%`, isSscPct: true },
                      ].map((r, index) => {
                        let bg = "transparent";
                        let fg = "#334155";
                        let weight = "normal";
                        
                        if (r.isHeader) {
                          bg = "#ffedd5";
                          fg = "#c2410c";
                          weight = "bold";
                        } else if (r.isTotal) {
                          bg = "#f1f5f9";
                          weight = "bold";
                        } else if (r.isSscPct) {
                          bg = "#fed7aa";
                          fg = "#ea580c";
                          weight = "bold";
                        }
                        
                        return (
                          <tr key={index} style={{ borderBottom: "1px solid #e2e8f0" }}>
                            <td style={{ padding: "8px 12px", border: "1px solid #cbd5e1", color: fg, fontWeight: weight, background: r.isHeader ? bg : "transparent" }}>{r.label}</td>
                            <td style={{ padding: "8px 12px", border: "1px solid #cbd5e1", textAlign: "center", background: bg, color: fg, fontWeight: "bold" }}>{r.val}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
              <button
                type="button"
                className="secondaryButton"
                onClick={() => setIsChennaiKpiModalOpen(false)}
              >
                Close
              </button>
              <button
                type="button"
                style={{ background: "linear-gradient(135deg, #0ea5e9, #0284c7)", borderColor: "#0ea5e9", display: "inline-flex", alignItems: "center", gap: "6px", color: "#ffffff" }}
                onClick={() => {
                  downloadRegionSummaryExcel(activeRegionName, report?.reportDate || todayIsoDate(), regionFilteredRows, true);
                }}
              >
                📥 Download Summary Excel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 3. Super Admin Engineer Productivity Dashboard Popup Modal */}
      {isProductivityModalOpen && (
        <div className="drawerOverlay" style={{ zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15, 23, 42, 0.45)" }} onClick={() => setIsProductivityModalOpen(false)}>
          <div 
            style={{ 
              background: "#ffffff", 
              borderRadius: "12px", 
              width: "min(900px, 95vw)", 
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.15)", 
              padding: "24px", 
              display: "grid", 
              gap: "18px", 
              position: "relative",
              border: "1px solid var(--border)"
            }} 
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "12px", gap: "16px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "700" }}>📊 Engineer Productivity Dashboard</h2>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>
                  Showing status breakdown {selectedRegion && selectedRegion !== "ALL" ? `for ${activeRegionName}` : "globally across all regions"}
                </p>
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                {/* Filter Type */}
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Filter:</span>
                  <select 
                    value={productivityFilterType} 
                    onChange={(e) => setProductivityFilterType(e.target.value)}
                    style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "12px", fontWeight: "600", outline: "none", background: "#f8fafc", cursor: "pointer" }}
                  >
                    <option value="Today">Today</option>
                    <option value="Specific Date">Specific Date</option>
                    <option value="Specific Month">Specific Month</option>
                    <option value="All Dates">All History</option>
                  </select>
                </div>

                {/* Conditional Specific Date / Specific Month value */}
                {(productivityFilterType === "Specific Date" || productivityFilterType === "Specific Month") && (
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>
                      {productivityFilterType === "Specific Date" ? "Date:" : "Month:"}
                    </span>
                    <select 
                      value={selectedProductivityValue} 
                      onChange={(e) => setSelectedProductivityValue(e.target.value)}
                      style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "12px", fontWeight: "600", outline: "none", background: "#f8fafc", cursor: "pointer" }}
                    >
                      {productivityFilterType === "Specific Date" 
                        ? engineerProductivityMetrics.datesList.map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))
                        : engineerProductivityMetrics.monthsList.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))
                      }
                    </select>
                  </div>
                )}

                <button 
                  type="button" 
                  className="secondaryButton" 
                  style={{ minHeight: "32px", padding: "0 12px", borderRadius: "6px", fontSize: "13px" }} 
                  onClick={() => setIsProductivityModalOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>

            <div style={{ maxHeight: "60vh", overflowY: "auto", paddingRight: "4px" }}>
              <table className="kpiSummaryTable" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#fed7aa", color: "#7c2d12", fontWeight: "bold" }}>
                    <td colSpan={8} style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px", fontWeight: "800" }}>
                      Filter Applied: {productivityDateLabel}
                    </td>
                  </tr>
                  <tr style={{ background: "#ffedd5", color: "#7c2d12", fontWeight: "bold" }}>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px", width: "60px" }}>S.No</td>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1", fontSize: "12px" }}>Engineer Name</td>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>Assigned</td>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>Attended</td>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>Closed</td>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>Part ordered</td>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>Under Observation</td>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>CX Reschedule</td>
                  </tr>
                </thead>
                <tbody>
                  {engineerProductivityMetrics.list.length > 0 ? (
                    engineerProductivityMetrics.list.map((item, index) => (
                      <tr key={item.name} style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", background: "#f8fafc", fontWeight: "600", color: "#334155" }}>{index + 1}</td>
                        <td style={{ padding: "8px", border: "1px solid #cbd5e1", fontWeight: "600", color: "#0f172a" }}>{item.name}</td>
                        <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", color: "#334155" }}>{item.assigned}</td>
                        <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontWeight: "bold", color: "#0f172a", background: "#f1f5f9" }}>{item.attended}</td>
                        <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", color: "#166534", fontWeight: "600" }}>{item.closed}</td>
                        <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", color: "#92400e" }}>{item.partOrdered || ""}</td>
                        <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", color: "#1e3a8a" }}>{item.underObservation || ""}</td>
                        <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", color: "#701a75" }}>{item.cxReschedule || ""}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} style={{ padding: "20px", border: "1px solid #cbd5e1", textAlign: "center", color: "var(--text-muted)" }}>
                        No engineer productivity records found for this period.
                      </td>
                    </tr>
                  )}
                  {engineerProductivityMetrics.list.length > 0 && (
                    <tr style={{ background: "#f8fafc", fontWeight: "bold" }}>
                      <td colSpan={3} style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "right", color: "#334155" }}>Total Attended</td>
                      <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", background: "#fed7aa", color: "#7c2d12", fontWeight: "bold" }}>
                        {engineerProductivityMetrics.totalAttended}
                      </td>
                      <td colSpan={4} style={{ border: "1px solid #cbd5e1", background: "transparent" }}></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
              <button
                type="button"
                className="secondaryButton"
                onClick={() => setIsProductivityModalOpen(false)}
              >
                Close
              </button>
              <button
                type="button"
                style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", borderColor: "#f97316", display: "inline-flex", alignItems: "center", gap: "6px", color: "#ffffff" }}
                onClick={() => {
                  downloadEngineerProductivityExcel(
                    activeRegionName || "Global", 
                    productivityDateLabel, 
                    engineerProductivityMetrics.list,
                    engineerProductivityMetrics.totalAttended
                  );
                }}
              >
                📥 Download Productivity Excel
              </button>
            </div>
          </div>
        </div>
      )}

      {isRtplTimeModalOpen && selectedRtplTimeCard && (
        <div className="modalOverlay" onClick={() => setIsRtplTimeModalOpen(false)}>
          <div className="modalCard rtplCheckpointModal" onClick={(event) => event.stopPropagation()}>
            <div className="modalHeader">
              <div className="modalTitleGroup">
                <span className="modalEyebrow">RTPL Operational Checkpoint</span>
                <h2 className="modalTitle">
                  {selectedRtplTimeCard.label}:{" "}
                  <span className="highlightText">
                    {selectedRtplModalStatus ?? selectedRtplTimeCard.status}
                  </span>
                </h2>
              </div>
              <button
                type="button"
                className="modalCloseBtn"
                onClick={() => setIsRtplTimeModalOpen(false)}
                title="Close RTPL details"
              >
                &times;
              </button>
            </div>

            <div className="rtplCheckpointBody">
              <div className="rtplCheckpointSummary">
                <div>
                  <span>Checkpoint</span>
                  <strong>{selectedRtplTimeCard.label}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{selectedRtplModalStatus ?? selectedRtplTimeCard.status}</strong>
                </div>
                <div>
                  <span>Work Orders</span>
                  <strong>{formatNumber(selectedRtplModalDetails.length)}</strong>
                </div>
              </div>

              {visibleRtplTimeDetails.length > 0 ? (
                <div className="rtplCheckpointTable">
                  <div className="rtplCheckpointTableHead">
                    <span>Ticket ID</span>
                    <span>RTPL Status</span>
                    <span>Time</span>
                  </div>
                  <div className="rtplCheckpointRows">
                    {visibleRtplTimeDetails.map((detail) =>
                      detail.type === "carry-forward" ? (
                        <div
                          key={`rtpl-carry-${detail.rowId ?? detail.serialNo}`}
                          className="rtplCheckpointRow"
                        >
                          <strong>WO {detail.ticketId}</strong>
                          <span>Baseline status: {detail.status}</span>
                          <small>Upload time</small>
                        </div>
                      ) : (
                        <div
                          key={detail.id ?? `rtpl-change-${detail.rowId}-${detail.changedAt}`}
                          className="rtplCheckpointRow"
                        >
                          <strong>WO {detail.ticketId}</strong>
                          <span>
                            {formatRtplStatusValue(detail.fromStatus)} -&gt; {formatRtplStatusValue(detail.toStatus)}
                          </span>
                          <small>{formatRtplChangeTime(detail.changedAt)}</small>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ) : (
                <div className="rtplEmptyState">
                  No RTPL status movement recorded for this checkpoint
                  {selectedRtplModalStatus ? ` and status ${selectedRtplModalStatus}` : ""}.
                </div>
              )}

              {hiddenRtplTimeDetailCount > 0 ? (
                <p className="rtplCheckpointFootnote">
                  Showing {formatNumber(visibleRtplTimeDetails.length)} of {formatNumber(selectedRtplModalDetails.length)} work orders.
                </p>
              ) : null}

              <div className="modalActions rtplCheckpointActions">
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() => setIsRtplTimeModalOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEditModalOpen && editingSerialNo !== null && (
        <div className="modalOverlay" onClick={cancelEditing}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div className="modalTitleGroup">
                <span className="modalEyebrow">Work Order Details & Entry</span>
                <h2 className="modalTitle">
                  Ticket ID: <span className="highlightText">{String(draftOutput["Ticket ID"] ?? "")}</span>
                </h2>
              </div>
              <button type="button" className="modalCloseBtn" onClick={cancelEditing} title="Close Form">
                &times;
              </button>
            </div>

            <div className="modalBody">
              {/* Read-Only Summary Info */}
              <div className="modalInfoGrid">
                <div className="modalInfoItem">
                  <span>Case ID</span>
                  <strong>{String(draftOutput["Case ID"] ?? "N/A")}</strong>
                </div>
                <div className="modalInfoItem">
                  <span>Customer Name</span>
                  <strong>{String(draftOutput["Customer Name"] ?? "N/A")}</strong>
                </div>
                <div className="modalInfoItem">
                  <span>Work Location</span>
                  <strong>{String(draftOutput["Work Location"] ?? "N/A")}</strong>
                </div>
                <div className="modalInfoItem">
                  <span>WO OTC Code</span>
                  <strong>{String(draftOutput["WO OTC CODE"] ?? "N/A")}</strong>
                </div>
                <div className="modalInfoItem">
                  <span>Product Line</span>
                  <strong>{String(draftOutput["Product Line Name"] ?? "N/A")}</strong>
                </div>
                <div className="modalInfoItem">
                  <span>WIP Aging</span>
                  <strong>{String(draftOutput["WIP aging"] ?? "N/A")} Days</strong>
                </div>
              </div>

              {/* Form Fields */}
              <form 
                className="modalForm" 
                onSubmit={(e) => { 
                  e.preventDefault(); 
                  void saveEditing(editingSerialNo); 
                }}
              >
                <div className="formFieldGroup">
                  {/* RTPL Status */}
                  <div className="formField">
                    <label htmlFor="modal-rtpl-status">RTPL Status</label>
                    <div className="statusFieldContainer">
                      <RTPLStatusDropdown
                        value={String(draftOutput["RTPL status"] ?? "")}
                        manualEntryRequiredLabel="Entry"
                        onChange={(selected) => {
                          if (selected === "Custom") {
                            setDraftOutput((current) => ({
                              ...current,
                              "RTPL status": "",
                            }));
                          } else {
                            setDraftOutput((current) => ({
                              ...current,
                              "RTPL status": selected,
                            }));
                          }
                        }}
                      />
                      {(draftOutput["RTPL status"] === "" || !RTPL_STATUS_OPTIONS.some((opt) => opt === String(draftOutput["RTPL status"]))) && (
                        <input
                          id="modal-rtpl-status-custom"
                          className="modalInput customStatusInput"
                          value={String(draftOutput["RTPL status"] ?? "")}
                          onChange={(event) =>
                            setDraftOutput((current) => ({
                              ...current,
                              "RTPL status": event.target.value,
                            }))
                          }
                          placeholder="Enter custom status"
                        />
                      )}
                    </div>
                  </div>

                  {/* Engineer */}
                  <div className="formField">
                    <label htmlFor="modal-engineer">Engineer</label>
                    <select
                      id="modal-engineer"
                      className="modalSelect"
                      value={String(draftOutput["Engineer"] ?? "")}
                      onChange={(event) =>
                        setDraftOutput((current) => ({
                          ...current,
                          "Engineer": event.target.value,
                        }))
                      }
                    >
                      <option value="">Entry</option>
                      {engineersList.map(e => (
                        <option key={e.id} value={e.engineerName}>{e.engineerName}</option>
                      ))}
                      {draftOutput["Engineer"] && draftOutput["Engineer"] !== MANUAL_ENTRY_REQUIRED && !engineersList.some(e => e.engineerName === String(draftOutput["Engineer"])) && (
                        <option value={String(draftOutput["Engineer"])}>{String(draftOutput["Engineer"])} (Inactive/Not in list)</option>
                      )}
                    </select>
                  </div>

                  {/* Segment */}
                  <div className="formField">
                    <label htmlFor="modal-segment">Segment</label>
                    <input
                      id="modal-segment"
                      className="modalInput"
                      value={String(draftOutput["Segment"] ?? "")}
                      onChange={(event) =>
                        setDraftOutput((current) => ({
                          ...current,
                          "Segment": event.target.value,
                        }))
                      }
                    />
                  </div>

                  {/* Location */}
                  <div className="formField">
                    <label htmlFor="modal-location">Location</label>
                    <input
                      id="modal-location"
                      className="modalInput"
                      value={String(draftOutput["Location"] ?? "")}
                      onChange={(event) =>
                        setDraftOutput((current) => ({
                          ...current,
                          "Location": event.target.value,
                        }))
                      }
                    />
                  </div>

                  {/* HP Owner Status */}
                  <div className="formField">
                    <label htmlFor="modal-hp-owner-status">HP Owner Status</label>
                    <input
                      id="modal-hp-owner-status"
                      className="modalInput"
                      value={String(draftOutput["HP Owner Status"] ?? "")}
                      onChange={(event) =>
                        setDraftOutput((current) => ({
                          ...current,
                          "HP Owner Status": event.target.value,
                        }))
                      }
                    />
                  </div>

                  {/* Case Created Time */}
                  <div className="formField">
                    <label htmlFor="modal-case-created-time">Case Created Time</label>
                    <input
                      id="modal-case-created-time"
                      className="modalInput"
                      value={String(draftOutput["Case Created Time"] ?? "")}
                      onChange={(event) =>
                        setDraftOutput((current) => ({
                          ...current,
                          "Case Created Time": event.target.value,
                        }))
                      }
                      placeholder="DD-MM-YYYY HH:MM:SS AM/PM"
                    />
                  </div>

                  {/* Customer Mail */}
                  <div className="formField">
                    <label htmlFor="modal-customer-mail">Customer Mail</label>
                    <input
                      id="modal-customer-mail"
                      className="modalInput"
                      value={String(draftOutput["Customer Mail"] ?? "")}
                      onChange={(event) =>
                        setDraftOutput((current) => ({
                          ...current,
                          "Customer Mail": event.target.value,
                        }))
                      }
                    />
                  </div>

                  {/* RCA */}
                  <div className="formField fullWidth">
                    <label htmlFor="modal-rca">RCA (Root Cause Analysis)</label>
                    <textarea
                      id="modal-rca"
                      className="modalTextarea"
                      value={String(draftOutput["RCA"] ?? "")}
                      onChange={(event) =>
                        setDraftOutput((current) => ({
                          ...current,
                          "RCA": event.target.value,
                        }))
                      }
                      rows={3}
                    />
                  </div>
                </div>

                <div className="modalActions">
                  <button
                    type="button"
                    className="secondaryButton"
                    disabled={savingSerialNo === editingSerialNo}
                    onClick={cancelEditing}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="saveBtn"
                    disabled={savingSerialNo === editingSerialNo}
                  >
                    {savingSerialNo === editingSerialNo ? "Saving..." : "Save Entry"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
