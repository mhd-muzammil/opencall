"use client";

import { DAILY_CALL_PLAN_COLUMNS, RTPL_STATUS_OPTIONS, ASP_CODE_REGION_MAP } from "@opencall/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { ColumnFilterDropdown } from "../components/ColumnFilterDropdown";
import { AppHeader } from "../components/AppHeader";
import { HistoryDrawer } from "../components/HistoryDrawer";
import { MetricsGrid, type MetricsGridItem } from "../components/MetricsGrid";
import { StatusPill } from "../components/StatusPill";
import { UploadDrawer } from "../components/UploadDrawer";
import { RTPLStatusDropdown, buildStatusGroups, type StatusGroup } from "../components/RTPLStatusDropdown";
import { useColumnFilters } from "../lib/useColumnFilters";
import {
  MANUAL_ENTRY_REQUIRED,
  CISS_PRODUCT_LINE,
  PRINT_SEGMENT,
  PRINT_INSTALLATION_WO_OTC_CODE,
  TRADE_WO_OTC_CODE_KEYWORD,
  LAST_HISTORY_SESSION_KEY,
  RTPL_MODAL_DETAIL_LIMIT,
  RTPL_STATUS_CHANGE_LIMIT,
  PIVOT_LOCATION_OPTIONS,
  CHANGE_FIELD_LABELS,
} from "../features/dashboard/constants";
import type {
  SourceKey,
  FileField,
  ChangeType,
  ReportRow,
  PrintCaseFilter,
  RtplCaseScope,
  ManualCarryForwardField,
  ReportRowPatchValues,
  RtplWipPivotColumn,
  RtplWipPivotRow,
  RtplWipPivot,
} from "../features/dashboard/types";
import {
  isTradeCase,
  isCissCase,
  isPcCase,
  isPrintCase,
  isPrintInstallationCase,
  isPrintFixCase,
  isRcaCase,
  isConsumerCase,
  isWarrantyCase,
  calculateRegionStats,
  buildRtplWipAgingPivot,
  todayIsoDate,
  dateIsoInIst,
  formatDisplayDateTime,
  formatRtplChangeTime,
  parseEditableDateTime,
  sortRowsByWipAging,
  tableColumnClassName,
  formatNumber,
  formatRtplStatusValue,
  formatComparisonValue,
  countManualRequiredCells,
  rowMatchesRecordSearch,
  batchIdBySource,
  formatFieldList,
  computeOperationalHealth,
} from "../features/dashboard/utils";

import {
  ChangeTypeBadge,
  CarryForwardBadge,
  CarryForwardSummaryPanel,
  ComparisonSummaryPanel,
  DashboardToggles,
  ClosedCallLedger,
  MatchPreviewSection,
  RTPLTimeModal,
  ProductivityPage,
  RTPLDashboard,
  FlexDashboard,
  CaseTypeCards,
  CustomerSegmentCards,
  RTPLPivotTable,
  RegionBreakdown,
  EditRecordModal,
  OverviewCharts,
  TNViewStatusPage,
  SLATatPage,
  FlexEodBodPage,
  CaseDetailDrawer,
} from "../features/dashboard/components";
import {
  useRecordRowSets,
  useRegionAnalytics,
  useKpiMetrics,
  useRtplPivot,
  useRtplAnalytics,
  useProductivityAnalytics,
  useExportRows,
} from "../features/dashboard/hooks";
import {
  FILTERABLE_COLUMNS,
  type WipAgingSortDirection,
} from "../lib/columnFilter";
import logoIcon from "./icon.png";
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
  getRtplStatusesDropdown,
  isApiAuthError,
} from "../lib/apiClient";
import type { DropdownEngineer } from "../lib/api/types";
import { LoginScreen, SessionLoadingScreen } from "../features/auth/LoginScreen";
import AdminEngineersPage from "./admin/engineers/page";
import { AdminRtplStatusesManager } from "../components/AdminRtplStatusesManager";
import {
  downloadReportAsXlsx,
  downloadReportAsExcel,
  downloadRegionSummaryExcel,
  downloadEngineerProductivityExcel,
} from "../lib/excelExport";
import * as XLSX from "xlsx";
import {
  ALL_REGIONS_FILTER,
  buildFlexOperationalAnalytics,
  buildOverallWoOtcBreakdown,
  buildRtplTimeCards,
  filterRowsByRegion,
  hasRequestToCancelFlexStatus,
  isTodayCallPlanVisibleRow,
  reportWithRows,
  RTPL_CARRY_FORWARD_TIME_CARD_ID,
  type RtplTimeCardId,
} from "../lib/reportDashboardAnalytics";
import { getLatestCompletedReportSession } from "../lib/reportHistorySelection";

// Phase 2: dashboard/analytics types moved to features/dashboard/types.

const SOURCE_LABELS: Record<SourceKey, string> = {
  FLEX_WIP: "Flex WIP",
  RENDERWAYS: "Renderways",
  CALL_PLAN: "Call Plan",
};

// A ticket whose Renderways "current status aging" is this many days (or more)
// is surfaced in the stale-status banner at the top of the records page. Backed
// by row.enriched.current_status_aging.
const STALE_FLEX_THRESHOLD_DAYS = 2;

// localStorage key for persisting which records-table columns are hidden.
const HIDDEN_COLUMNS_STORAGE_KEY = "opencall.records.hiddenColumns";

// Columns that can never be hidden from the records table. "Ticket ID" is the
// frozen-left identifier column and "S.no" is the row index.
const ALWAYS_VISIBLE_COLUMNS = new Set<string>(["S.no", "Ticket ID"]);

const FILE_FIELDS: Array<{
  field: FileField;
  source: SourceKey;
  label: string;
  required: boolean;
  multiple?: boolean;
}> = [
  { field: "flexWipReport", source: "FLEX_WIP", label: "FieldEZ Report", required: true },
  { field: "renderwaysReport", source: "RENDERWAYS", label: "Flex Mail Report", required: false, multiple: true },
  { field: "callPlan", source: "CALL_PLAN", label: "Call Plan Reports", required: false, multiple: true },
];

// Phase 1: scalar constants moved to features/dashboard/constants.




// Phase 3: case-classification, WO-OTC, sort, and pure helpers moved to
// features/dashboard/utils.

// Phase 3: PC/Print/Install/Consumer/Warranty classification moved to
// features/dashboard/utils/caseClassification.

// Phase 2: RegionStats and RtplWipPivot* interfaces moved to
// features/dashboard/types.

// Phase 3: pivot helpers moved to features/dashboard/utils/pivotUtils.

// Phase 3: getOtcSortWeight moved to features/dashboard/utils/regionUtils.


const MANUAL_FIELD_BY_COLUMN: Partial<Record<string, ManualCarryForwardField>> = {
  "RTPL status": "rtpl_status",
  "Current Remarks": "remarks",
  Segment: "segment",
  Engineer: "engineer",
  Location: "location",
  "Case Created Time": "case_created_time",
  "Status Aging": "status_aging",
  "HP Owner Status": "hp_owner_status",
  "Customer Mail": "customer_mail",
  RCA: "rca",
};


const EDITABLE_COLUMN_API_FIELD: Partial<Record<string, string>> = {
  "RTPL status": "rtpl_status",
  "Current Remarks": "remarks",
  Segment: "segment",
  Engineer: "engineer",
  Location: "location",
  "Case Created Time": "case_created_time",
  "Status Aging": "status_aging",
  "HP Owner Status": "hp_owner_status",
  "Customer Mail": "customer_mail",
  RCA: "rca",
};

// Phase 2: ReportRowPatchValues moved to features/dashboard/types.

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
    | "remarks"
  >>
> = {
  "RTPL status": "rtplStatus",
  "Current Remarks": "remarks",
  Segment: "segment",
  Engineer: "engineer",
  Location: "location",
  "Case Created Time": "caseCreatedTime",
  "Status Aging": "statusAging",
  "HP Owner Status": "hpOwnerStatus",
  "Customer Mail": "customerMail",
  RCA: "rca",
};



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
  const [caseDetailRow, setCaseDetailRow] = useState<ReportRow | null>(null);
  const draftOutputRef = useRef(draftOutput);
  const hasAutoRestoredHistoryRef = useRef(false);
  const recordsTableWrapRef = useRef<HTMLDivElement | null>(null);
  const recordsScrollTopRef = useRef<HTMLDivElement | null>(null);
  const recordsScrollTopSpacerRef = useRef<HTMLDivElement | null>(null);
  const recordsAreaRef = useRef<HTMLDivElement | null>(null);
  const [engineersList, setEngineersList] = useState<DropdownEngineer[]>([]);
  // Dynamic, admin-managed RTPL status groups. Empty until fetched; the dropdown
  // falls back to the legacy hardcoded groups while empty.
  const [rtplStatusGroups, setRtplStatusGroups] = useState<StatusGroup[]>([]);
  // Flat list of known status names (dynamic if loaded, else legacy) — used to
  // decide whether the current value is a custom free-text entry.
  const rtplStatusFlatOptions: readonly string[] =
    rtplStatusGroups.length > 0 ? rtplStatusGroups.flatMap((g) => g.options) : RTPL_STATUS_OPTIONS;
  draftOutputRef.current = draftOutput;

  const [sidebarWidth, setSidebarWidth] = useState<number>(260);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isResizing, setIsResizing] = useState<boolean>(false);

  // Load sidebar settings on mount
  useEffect(() => {
    try {
      const storedWidth = window.localStorage.getItem("opencall.sidebarWidth");
      if (storedWidth) {
        setSidebarWidth(parseInt(storedWidth, 10));
      }
      const storedCollapsed = window.localStorage.getItem("opencall.sidebarCollapsed");
      if (storedCollapsed) {
        setIsSidebarCollapsed(storedCollapsed === "true");
      }
    } catch (e) {
      console.error("Failed to load sidebar settings", e);
    }
  }, []);

  // Handle resizing mouse events
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      let newWidth = e.clientX;
      if (newWidth < 120) {
        setIsSidebarCollapsed(true);
        try {
          window.localStorage.setItem("opencall.sidebarCollapsed", "true");
        } catch {}
      } else {
        setIsSidebarCollapsed(false);
        try {
          window.localStorage.setItem("opencall.sidebarCollapsed", "false");
        } catch {}
        if (newWidth > 480) newWidth = 480;
        setSidebarWidth(newWidth);
        try {
          window.localStorage.setItem("opencall.sidebarWidth", String(newWidth));
        } catch {}
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

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
  const [selectedPivotCaseScope, setSelectedPivotCaseScope] = useState<RtplCaseScope>("overall");
  const [selectedPivotSegments, setSelectedPivotSegments] = useState<string[] | null>(null);
  const [draftPivotSegments, setDraftPivotSegments] = useState<string[] | null>(null);
  const [isPivotSegmentFilterOpen, setIsPivotSegmentFilterOpen] = useState(false);
  const [selectedPivotLocations, setSelectedPivotLocations] = useState<string[] | null>(null);
  const [draftPivotLocations, setDraftPivotLocations] = useState<string[] | null>(null);
  const [isPivotLocationFilterOpen, setIsPivotLocationFilterOpen] = useState(false);
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
  const [showPcOnly, setShowPcOnly] = useState(false);
  const [productivityFilterType, setProductivityFilterType] = useState("Today");
  const [selectedProductivityValue, setSelectedProductivityValue] = useState("");
  const [tnFilterType, setTnFilterType] = useState("Today");
  const [selectedTnValue, setSelectedTnValue] = useState("");
  const [eodBodFilterType, setEodBodFilterType] = useState("Today");
  const [selectedEodBodValue, setSelectedEodBodValue] = useState("");
  const [tnViewMode, setTnViewMode] = useState<"BOD" | "EOD">("EOD");
  const [eodBodViewMode, setEodBodViewMode] = useState<"BOD" | "EOD">("EOD");
  const [printCaseFilter, setPrintCaseFilter] = useState<PrintCaseFilter | null>(null);
  const [wipAgingSort, setWipAgingSort] = useState<WipAgingSortDirection | null>(null);
  const [recordsSearchQuery, setRecordsSearchQuery] = useState("");
  // View-only column visibility (Excel/ERP-style). Hidden columns are removed
  // from the rendered table only — exports always output the full column set.
  // "S.no" and "Ticket ID" are always visible (Ticket ID may be frozen-left).
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = useState(false);
  // Whether the records table is expanded to a full-screen overlay.
  const [isRecordsTableMaximized, setIsRecordsTableMaximized] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement | null>(null);
  // Whether the stale-Flex-Status "View all" details modal is open.
  const [isStaleModalOpen, setIsStaleModalOpen] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<"overview" | "records" | "rtpl" | "rtpl-dashboard" | "pivot" | "flex" | "productivity" | "tn-view-status" | "sla-tat" | "flex-eod-bod" | "admin-engineers" | "admin-rtpl-statuses">("overview");
  const [pivotActiveStatus, setPivotActiveStatus] = useState<string | null>(null);
  const [pivotActiveWipAging, setPivotActiveWipAging] = useState<string | null>(null);

  useEffect(() => {
    setPivotActiveStatus(null);
    setPivotActiveWipAging(null);
  }, [workspaceView, report?.reportId, selectedPivotSegments, selectedPivotLocations, selectedPivotCaseScope]);
  const [showDayOverDayComparison, setShowDayOverDayComparison] = useState(false);
  const [showMatchPreviewSection, setShowMatchPreviewSection] = useState(false);
  const [showManualCarryForward, setShowManualCarryForward] = useState(false);
  const [showCaseTypeOverview, setShowCaseTypeOverview] = useState(false);
  const [showCustomerSegmentSplit, setShowCustomerSegmentSplit] = useState(false);
  const [showClosedCallLedger, setShowClosedCallLedger] = useState(false);
  const [showUploadBatches, setShowUploadBatches] = useState(false);

  // BOD fixed time: ISO string when user clicked "Fix BOD"; null = not yet fixed.
  // Stored in sessionStorage so it persists across re-renders but resets on new tab.
  const [bodFixedTime, setBodFixedTime] = useState<string | null>(() => {
    try { return window.sessionStorage.getItem("opencall.bodFixedTime") ?? null; } catch { return null; }
  });

  // BOD snapshot: frozen ticketId → rtplStatus map captured at the moment Fix BOD is clicked.
  // Once set, BOD counts are derived from this frozen snapshot — never recalculated.
  // Stored in sessionStorage so it survives re-renders but resets on new tab/day.
  const [bodSnapshot, setBodSnapshot] = useState<Record<string, string> | null>(() => {
    try {
      const stored = window.sessionStorage.getItem("opencall.bodSnapshot");
      return stored ? (JSON.parse(stored) as Record<string, string>) : null;
    } catch { return null; }
  });

  // Reset BOD fix if a different report is loaded or a different analytics date is selected
  useEffect(() => {
    if (!report?.reportId) return;
    try {
      const storedReportId = window.sessionStorage.getItem("opencall.bodFixedReportId");
      const storedDate = window.sessionStorage.getItem("opencall.bodFixedDate");
      const currentReportId = String(report.reportId);
      const currentDate = rtplAnalyticsDate || "";

      if (
        (storedReportId && storedReportId !== currentReportId) ||
        (storedDate && storedDate !== currentDate)
      ) {
        setBodFixedTime(null);
        setBodSnapshot(null);
        window.sessionStorage.removeItem("opencall.bodFixedTime");
        window.sessionStorage.removeItem("opencall.bodSnapshot");
        window.sessionStorage.removeItem("opencall.bodFixedReportId");
        window.sessionStorage.removeItem("opencall.bodFixedDate");
      }
    } catch { /* non-fatal */ }
  }, [report?.reportId, rtplAnalyticsDate]);

  // Whether the 6PM auto-download has already fired for this session.
  const autoDownloadFiredRef = useRef(false);


  useEffect(() => {
    if (recordsAreaRef.current) {
      recordsAreaRef.current.classList.remove("summaryHidden");
    }
    if (recordsTableWrapRef.current) {
      recordsTableWrapRef.current.scrollTop = 0;
    }
  }, [workspaceView, report?.reportId]);

  // Restore persisted column visibility on mount (ERP convenience). Falls back
  // to "all visible" on any parse error or missing key.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(HIDDEN_COLUMNS_STORAGE_KEY);
      if (!stored) return;
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        const restored = parsed.filter(
          (c): c is string =>
            typeof c === "string" && !ALWAYS_VISIBLE_COLUMNS.has(c),
        );
        if (restored.length > 0) {
          setHiddenColumns(new Set(restored));
        }
      }
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  // Persist column visibility whenever it changes.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        HIDDEN_COLUMNS_STORAGE_KEY,
        JSON.stringify([...hiddenColumns]),
      );
    } catch {
      /* storage may be unavailable (private mode); non-fatal */
    }
  }, [hiddenColumns]);

  // Close the Columns visibility menu on outside pointerdown or Escape.
  useEffect(() => {
    if (!isColumnsMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && columnsMenuRef.current?.contains(target)) {
        return;
      }
      setIsColumnsMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsColumnsMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isColumnsMenuOpen]);

  // Exit the full-screen records table on Escape.
  useEffect(() => {
    if (!isRecordsTableMaximized) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsRecordsTableMaximized(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRecordsTableMaximized]);

  useEffect(() => {
    const isRegionAdmin = session?.user?.role === "REGION_ADMIN";
    const initialRegion = isRegionAdmin && report?.regionBreakdown?.[0]?.aspCode
      ? report.regionBreakdown[0].aspCode
      : null;

    setSelectedRegion(initialRegion);
    setSelectedWoOtcCode(null);
    setSelectedRtplRegion(initialRegion && initialRegion !== "ALL" ? initialRegion : ALL_REGIONS_FILTER);
    setSelectedRtplCaseScope("overall");
    setSelectedPivotCaseScope("overall");
    setSelectedPivotSegments(null);
    setDraftPivotSegments(null);
    setIsPivotSegmentFilterOpen(false);
    setSelectedPivotLocations(null);
    setDraftPivotLocations(null);
    setIsPivotLocationFilterOpen(false);
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
    setShowPcOnly(false);
    setPrintCaseFilter(null);
    setProductivityFilterType("Today");
    setSelectedProductivityValue("");
    setTnFilterType("Today");
    setSelectedTnValue("");
    setEodBodFilterType("Today");
    setSelectedEodBodValue("");
    setTnViewMode("EOD");
    setEodBodViewMode("EOD");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.reportId, session]);

  // Phase 5: record row-set memos moved to features/dashboard/hooks/useRecordRowSets.
  const {
    activeRows,
    cissRows,
    pcRows,
    printInstallationRows,
    printFixRows,
    rcaRows,
    tradeRows,
    closedRows,
    consumerRows,
    commercialRows,
    warrantyRows,
    nonWarrantyRows,
    tableBaseRows,
    regionFilteredRows,
  } = useRecordRowSets({
    report,
    showClosedOnly,
    showConsumerOnly,
    showCommercialOnly,
    showWarrantyOnly,
    showNonWarrantyOnly,
    showCissOnly,
    showRcaOnly,
    showTradeOnly,
    showPcOnly,
    printCaseFilter,
    selectedRegion,
    selectedWoOtcCode,
  });


  // Phase 5: RTPL/WIP pivot memos moved to features/dashboard/hooks/useRtplPivot.
  const {
    pivotCaseRows,
    pivotBaseRows,
    rtplWipPivot,
    draftPivotSegmentSet,
    draftPivotLocationSet,
    pivotAllSegmentCount,
    pivotLocationOptions,
    pivotAllLocationCount,
    availableLocationValues,
  } = useRtplPivot({
    activeRows,
    selectedPivotCaseScope,
    selectedPivotLocations,
    selectedPivotSegments,
    draftPivotSegments,
    draftPivotLocations,
  });

  const appliedPivotSegmentLabel =
    selectedPivotSegments === null
      ? "All Segments"
      : selectedPivotSegments.length === 0
        ? "No Segments"
        : selectedPivotSegments.length === 1
          ? selectedPivotSegments[0]
          : `${selectedPivotSegments.length} Segments`;

  const pivotSegmentFilterActive = selectedPivotSegments !== null;

  const appliedPivotLocationLabel =
    selectedPivotLocations === null
      ? availableLocationValues.length === 1
        ? PIVOT_LOCATION_OPTIONS.find((option) => option.value === availableLocationValues[0])?.label ?? "All Locations"
        : "All Locations"
      : selectedPivotLocations.length === 0
        ? "No Locations"
        : selectedPivotLocations.length === 1
          ? PIVOT_LOCATION_OPTIONS.find((option) => option.value === selectedPivotLocations[0])?.label ?? selectedPivotLocations[0]
          : `${selectedPivotLocations.length} Locations`;

  const pivotLocationFilterActive = selectedPivotLocations !== null;





  // Phase 5: region-analytics memos moved to features/dashboard/hooks/useRegionAnalytics.
  const {
    activeRegionBreakdown,
    caseTypeRegionBreakdown,
    overallStats,
    overallWoOtcBreakdown,
    overallClosedCount,
    closedRegionBreakdown,
  } = useRegionAnalytics({ activeRows, report });

  // Phase 5: kpiBaseRows/date-scope/productivity memos moved to
  // features/dashboard/hooks/useProductivityAnalytics. (The tn/eodBod/productivity
  // auto-select useEffect blocks remain below in page.tsx and read these values.)
  const {
    kpiBaseRows,
    regionDateMetadata,
    tnFilteredRows,
    tnDateLabel,
    eodBodFilteredRows,
    eodBodDateLabel,
    engineerProductivityMetrics,
    productivityDateLabel,
  } = useProductivityAnalytics({
    report,
    selectedRegion,
    selectedWoOtcCode,
    tnFilterType,
    selectedTnValue,
    eodBodFilterType,
    selectedEodBodValue,
    productivityFilterType,
    selectedProductivityValue,
  });

  useEffect(() => {
    if (tnFilterType === "Specific Date") {
      if (!selectedTnValue || !regionDateMetadata.datesList.includes(selectedTnValue)) {
        setSelectedTnValue(regionDateMetadata.datesList[0] || "");
      }
    } else if (tnFilterType === "Specific Month") {
      if (!selectedTnValue || !regionDateMetadata.monthsList.includes(selectedTnValue)) {
        setSelectedTnValue(regionDateMetadata.monthsList[0] || "");
      }
    } else {
      setSelectedTnValue("");
    }
  }, [tnFilterType, regionDateMetadata.datesList, regionDateMetadata.monthsList, selectedTnValue]);


  useEffect(() => {
    if (eodBodFilterType === "Specific Date") {
      if (!selectedEodBodValue || !regionDateMetadata.datesList.includes(selectedEodBodValue)) {
        setSelectedEodBodValue(regionDateMetadata.datesList[0] || "");
      }
    } else if (eodBodFilterType === "Specific Month") {
      if (!selectedEodBodValue || !regionDateMetadata.monthsList.includes(selectedEodBodValue)) {
        setSelectedEodBodValue(regionDateMetadata.monthsList[0] || "");
      }
    } else {
      setSelectedEodBodValue("");
    }
  }, [eodBodFilterType, regionDateMetadata.datesList, regionDateMetadata.monthsList, selectedEodBodValue]);


  const getParsedDateForExcel = (filterType: string, selectedValue: string) => {
    if (filterType === "Today") {
      return report?.reportDate || todayIsoDate();
    }
    if (filterType === "Specific Date" && selectedValue) {
      const parts = selectedValue.split("-");
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
    return selectedValue || "All Dates";
  };

  const getDayOfWeek = (dateStr: string): string => {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "";
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[date.getDay()] ?? "";
  };

  // Column-filter hook: operates on rows already filtered by region/WO OTC
  const colFilters = useColumnFilters(regionFilteredRows);

  // Reset column filters when the report changes
  const reportId = report?.reportId;
  useEffect(() => {
    colFilters.resetAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  // Phase 5: export/visible-row memos moved to features/dashboard/hooks/useExportRows
  // (called after colFilters, which stays in page.tsx).
  const {
    columnFilteredRows,
    filteredRows,
    selectedRecords,
    batchIds,
  } = useExportRows({
    colFilters,
    regionFilteredRows,
    recordsSearchQuery,
    wipAgingSort,
    closedRows,
    selectedRegion,
    selectedWoOtcCode,
    preview,
    selectedPreviewCategory,
    upload,
  });

  const pivotFilteredRows = useMemo(() => {
    let rows = pivotBaseRows;
    if (selectedPivotSegments !== null) {
      const segmentSet = new Set(selectedPivotSegments);
      rows = rows.filter((row) => segmentSet.has(String(row.output["Segment"] ?? "").trim()));
    }
    if (pivotActiveStatus !== null) {
      rows = rows.filter((row) => String(row.output["RTPL status"] ?? "").trim() === pivotActiveStatus);
    }
    if (pivotActiveWipAging !== null) {
      rows = rows.filter((row) => String(row.output["WIP aging"] ?? "").trim() === pivotActiveWipAging);
    }
    if (recordsSearchQuery) {
      const query = recordsSearchQuery.toLowerCase().trim();
      rows = rows.filter((row) =>
        Object.values(row.output).some((val) =>
          String(val ?? "").toLowerCase().includes(query)
        )
      );
    }
    return rows;
  }, [
    pivotBaseRows,
    selectedPivotSegments,
    pivotActiveStatus,
    pivotActiveWipAging,
    recordsSearchQuery,
  ]);

  const pivotFilteredRowsWithColFilters = useMemo(() => {
    const rows = colFilters.filteredRows(pivotFilteredRows);
    return sortRowsByWipAging(rows, wipAgingSort);
  }, [pivotFilteredRows, colFilters, wipAgingSort]);

  // View-only set of columns currently rendered in the records table. Driven by
  // hiddenColumns; the underlying data/exports are untouched.
  const visibleColumns = useMemo(
    () => DAILY_CALL_PLAN_COLUMNS.filter((c) => !hiddenColumns.has(c)),
    [hiddenColumns],
  );

  // Keep the top proxy scrollbar's spacer width matched to the inner <table>'s
  // real content width so the proxy thumb and the table scroll in lock-step.
  // We measure the actual <table> element (its scrollWidth — the full content
  // extent regardless of the wrapper's clipping) after layout, recomputing on:
  // mount (via rAF, so the first paint has settled), visible-row changes,
  // column-visibility changes, summary collapse, and any resize of the table or
  // window. The proxy only renders in records mode, so this is a no-op elsewhere.
  useEffect(() => {
    const tableWrap = recordsTableWrapRef.current;
    const spacer = recordsScrollTopSpacerRef.current;
    if (!tableWrap || !spacer) {
      return;
    }

    let rafId = 0;

    function updateWidth() {
      const wrap = recordsTableWrapRef.current;
      const inner = recordsScrollTopSpacerRef.current;
      if (!wrap || !inner) {
        return;
      }
      // Prefer the inner <table>'s own scrollWidth (true content width); fall
      // back to the wrapper's scrollWidth if the table isn't mounted yet.
      const table = wrap.querySelector("table");
      const contentWidth = table
        ? Math.max(table.scrollWidth, table.offsetWidth)
        : wrap.scrollWidth;
      const nextWidth = `${contentWidth}px`;
      if (inner.style.width !== nextWidth) {
        inner.style.width = nextWidth;
      }
    }

    // Measure after the browser has laid out the current frame.
    function scheduleUpdate() {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateWidth);
    }

    scheduleUpdate();

    const innerTable = tableWrap.querySelector("table");
    const resizeObserver = new ResizeObserver(() => scheduleUpdate());
    resizeObserver.observe(tableWrap);
    if (innerTable) {
      resizeObserver.observe(innerTable);
    }
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [workspaceView, filteredRows, hiddenColumns]);

  // Phase 5: KPI-metric memos moved to features/dashboard/hooks/useKpiMetrics.
  const {
    activeRegionName,
    regionKpiMetrics,
    chennaiKpiMetrics,
    incompleteCellCount,
  } = useKpiMetrics({
    report,
    selectedRegion,
    tnFilteredRows,
    tnViewMode,
    eodBodFilteredRows,
    eodBodViewMode,
  });


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





  // Phase 5: RTPL analytics memos moved to features/dashboard/hooks/useRtplAnalytics.
  const {
    rtplRowsForSelectedScope,
    rtplRowsForSelectedRegion,
    rtplCaseScopeOptions,
    rtplRegionOptions,
    rtplAnalyticsRows,
    flexStatusMetrics,
    visibleRtplStatusChanges,
    rtplTimeCards,
    selectedRtplTimeCard,
  } = useRtplAnalytics({
    activeRows,
    selectedRtplCaseScope,
    selectedRtplRegion,
    activeRegionBreakdown,
    report,
    rtplStatusChanges,
    selectedRtplTimeCardId,
    bodFixedTime,
  });

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

  // Fix BOD to current IST time and freeze a snapshot of every visible ticket's RTPL status.
  // After this, BOD counts are permanently locked to this snapshot for the session.
  // EOD continues to reflect the live current status as edits happen throughout the day.
  function handleFixBod(): void {
    const now = new Date().toISOString();
    setBodFixedTime(now);
    try {
      window.sessionStorage.setItem("opencall.bodFixedTime", now);
      if (report?.reportId) {
        window.sessionStorage.setItem("opencall.bodFixedReportId", String(report.reportId));
      }
      if (rtplAnalyticsDate) {
        window.sessionStorage.setItem("opencall.bodFixedDate", rtplAnalyticsDate);
      }
    } catch { /* non-fatal */ }

    // Capture the current RTPL status of every analytics row as the frozen BOD baseline.
    const snapshot: Record<string, string> = {};
    for (const row of rtplAnalyticsRows) {
      const ticketId = String(row.output["Ticket ID"] ?? "").trim();
      const status = String(row.output["RTPL status"] ?? "").trim();
      if (ticketId) {
        snapshot[ticketId] = status;
      }
    }
    setBodSnapshot(snapshot);
    try { window.sessionStorage.setItem("opencall.bodSnapshot", JSON.stringify(snapshot)); } catch { /* non-fatal */ }
  }

  // Download BOD + EOD status breakdown as a two-sheet Excel file.
  function handleDownloadBodEod(
    card: { label: string; cardBod: number; cardEod: number; breakdown: Array<{ status: string; bodCount: number; eodCount: number }> },
  ): void {
    const dateStr = rtplAnalyticsDate || todayIsoDate();
    const cardLabel = card.label.replace(/[^a-zA-Z0-9 _-]/g, "").trim();

    // BOD sheet data
    const bodAoa: (string | number)[][] = [
      [`BOD Status Summary — ${cardLabel} — ${dateStr}`],
      ["S.No", "Status", "BOD Count"],
      ...card.breakdown.map((entry, idx) => [idx + 1, entry.status, entry.bodCount]),
      ["Total", "", card.cardBod],
    ];

    // EOD sheet data
    const eodAoa: (string | number)[][] = [
      [`EOD Status Summary — ${cardLabel} — ${dateStr}`],
      ["S.No", "Status", "EOD Count"],
      ...card.breakdown.map((entry, idx) => [idx + 1, entry.status, entry.eodCount]),
      ["Total", "", card.cardEod],
    ];

    const wb = XLSX.utils.book_new();
    const bodSheet = XLSX.utils.aoa_to_sheet(bodAoa);
    bodSheet["!cols"] = [{ wch: 8 }, { wch: 35 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, bodSheet, "BOD");

    const eodSheet = XLSX.utils.aoa_to_sheet(eodAoa);
    eodSheet["!cols"] = [{ wch: 8 }, { wch: 35 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, eodSheet, "EOD");

    XLSX.writeFile(wb, `RTPL_BOD_EOD_${cardLabel.replace(/\s+/g, "_")}_${dateStr}.xlsx`);
  }
  // 6:00 PM IST auto-download: fires once per session when the clock crosses 18:00.
  useEffect(() => {
    if (!rtplTimeCards || rtplTimeCards.length === 0) return;

    const CHECK_INTERVAL_MS = 30_000; // check every 30 seconds
    const AUTO_DOWNLOAD_HOUR_IST = 18; // 6:00 PM IST

    const timerId = setInterval(() => {
      if (autoDownloadFiredRef.current) return;

      const nowIst = new Date().toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const [hStr] = nowIst.split(":");
      const currentHour = Number(hStr);

      if (currentHour >= AUTO_DOWNLOAD_HOUR_IST) {
        autoDownloadFiredRef.current = true;
        // Find the 6PM card (id "1800"); fall back to the last card with data
        const eodCard = rtplTimeCards.find((c) => c.id === "1800") ?? rtplTimeCards[rtplTimeCards.length - 1];
        if (eodCard && (eodCard.count > 0 || eodCard.details.length > 0)) {
          // Build a minimal card shape matching the download handler expectation
          // We call the same handler that individual cards use, so logic is shared.
          handleDownloadBodEod({
            label: eodCard.label,
            cardBod: 0, // BOD total will show from breakdown
            cardEod: eodCard.count,
            breakdown: eodCard.statusBreakdown.map((b) => ({
              status: b.status,
              bodCount: 0,
              eodCount: b.count,
            })),
          });
        }
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rtplTimeCards]);



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

  async function handleRefreshWorkspace() {
    await runAction(async () => {
      await refreshHealth();

      if (!session) {
        return;
      }

      const sessions = await getReportHistory(session.token);
      setHistorySessions(sessions);

      const sessionToRefresh = getLatestCompletedReportSession(sessions);

      if (!sessionToRefresh) {
        setMessage("Health refreshed. No completed report is available to reload.");
        return;
      }

      await restoreHistorySession(sessionToRefresh, {
        closeHistoryPanel: false,
        successMessage: "Workspace refreshed with latest report data.",
      });
    });
  }

  useEffect(() => {
    if (session) {
      getReportHistory(session.token).then((sessions) => {
        setHistorySessions(sessions);

        if (!hasAutoRestoredHistoryRef.current && !report && !upload) {
          hasAutoRestoredHistoryRef.current = true;
          const sessionToRestore = getLatestCompletedReportSession(sessions);

          if (sessionToRestore) {
            void handleHistoryOpen(sessionToRestore);
          }
        }
      }).catch(handleBackgroundError);
      getEngineersDropdown(session.token)
        .then((res) => setEngineersList(res.engineers))
        .catch(handleBackgroundError);
      getRtplStatusesDropdown(session.token)
        .then((res) => setRtplStatusGroups(buildStatusGroups(res.statuses)))
        .catch(handleBackgroundError);
    } else {
      setHistorySessions([]);
      setEngineersList([]);
      setRtplStatusGroups([]);
      hasAutoRestoredHistoryRef.current = false;
    }
  }, [session]);

  // Keep refs of active state to prevent rebuilding the interval timer on every input/button state change
  const editingSerialNoRef = useRef(editingSerialNo);
  editingSerialNoRef.current = editingSerialNo;

  const savingSerialNoRef = useRef(savingSerialNo);
  savingSerialNoRef.current = savingSerialNo;

  const isBusyRef = useRef(isBusy);
  isBusyRef.current = isBusy;

  useEffect(() => {
    if (!session || !report?.reportId || !upload) return;

    const token = session.token;
    const flexWipBatchId = upload.batches.find((b) => b.sourceType === "FLEX_WIP")?.id;
    if (!flexWipBatchId) return;
    const activeFlexWipBatchId: string = flexWipBatchId;

    const renderwaysBatchId = upload.batches.find((b) => b.sourceType === "RENDERWAYS")?.id;
    const callPlanBatchId = upload.batches.find((b) => b.sourceType === "CALL_PLAN")?.id;

    const currentReportDate = report.reportDate;
    const currentRegionId = regionId;
    const currentReportId = report.reportId;

    let timerId: NodeJS.Timeout;

    async function poll() {
      // Skip polling if saving, editing, or busy to prevent state conflicts
      if (savingSerialNoRef.current !== null || isBusyRef.current) {
        timerId = setTimeout(poll, 10000);
        return;
      }

      try {
        const [latestRep, latestStatusChanges] = await Promise.all([
          generateReport({
            token: token,
            regionId: currentRegionId,
            reportDate: currentReportDate,
            flexUploadBatchId: activeFlexWipBatchId,
            ...(renderwaysBatchId ? { renderwaysUploadBatchId: renderwaysBatchId } : {}),
            ...(callPlanBatchId ? { callPlanUploadBatchId: callPlanBatchId } : {}),
          }),
          getRtplStatusChanges({
            token: token,
            reportId: currentReportId,
            changeDate: rtplAnalyticsDate,
            limit: RTPL_STATUS_CHANGE_LIMIT,
          }),
        ]);

        // Verify the reportId hasn't changed in the background before updating state
        setReport((prevReport) => {
          if (!prevReport || prevReport.reportId !== latestRep.reportId) {
            return prevReport;
          }

          // Merge latest rows, preserving the row that is currently being edited
          const updatedRows = latestRep.rows.map((newRow) => {
            if (editingSerialNoRef.current !== null && newRow.serialNo === editingSerialNoRef.current) {
              const prevRow = prevReport.rows.find((r) => r.serialNo === editingSerialNoRef.current);
              return prevRow ? prevRow : newRow;
            }
            return newRow;
          });

          return {
            ...prevReport,
            rows: updatedRows,
            totalRows: latestRep.totalRows,
            duplicateTicketCount: latestRep.duplicateTicketCount,
            unmatchedTicketCount: latestRep.unmatchedTicketCount,
            duplicateTracking: latestRep.duplicateTracking,
            carryForward: latestRep.carryForward,
            comparison: latestRep.comparison,
            regionBreakdown: latestRep.regionBreakdown,
          };
        });

        setRtplStatusChanges((prevChanges) => {
          // Only update if changes have actually updated to avoid unnecessary renders
          if (JSON.stringify(prevChanges) === JSON.stringify(latestStatusChanges)) {
            return prevChanges;
          }
          return latestStatusChanges;
        });

      } catch (error) {
        if (isApiAuthError(error)) {
          handleBackgroundError(error);
        } else {
          console.error("Background poll failed:", error);
        }
      } finally {
        timerId = setTimeout(poll, 10000);
      }
    }

    timerId = setTimeout(poll, 10000);

    return () => {
      clearTimeout(timerId);
    };
  }, [
    session,
    report?.reportId,
    upload?.batches,
    regionId,
    rtplAnalyticsDate,
  ]);


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
    const renderwaysReport = files.renderwaysReport ?? [];
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
        ...(renderwaysReport.length > 0 ? { renderwaysReport } : {}),
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

  async function restoreHistorySession(
    historySession: ReportHistorySession,
    {
      closeHistoryPanel = true,
      successMessage,
    }: Readonly<{
      closeHistoryPanel?: boolean;
      successMessage?: string;
    }> = {},
  ): Promise<boolean> {
    if (!session) return false;

    const detail = await getReportHistoryById(session.token, historySession.id);

    if (!detail.flexUploadBatchId) {
      setMessage("Refresh failed: selected history session has no Flex upload batch.");
      return false;
    }

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
    if (detail.reportDate) {
      setReportDate(detail.reportDate);
      setRtplAnalyticsDate(detail.reportDate);
    }
    window.localStorage.setItem(LAST_HISTORY_SESSION_KEY, detail.id);

    const prev = await previewMatches({
      token: session.token,
      regionId: effectiveRegionId,
      flexUploadBatchId: detail.flexUploadBatchId,
      ...(detail.renderwaysUploadBatchId ? { renderwaysUploadBatchId: detail.renderwaysUploadBatchId } : {}),
      ...(detail.callPlanUploadBatchId ? { callPlanUploadBatchId: detail.callPlanUploadBatchId } : {}),
    });
    setPreview(prev);

    if (detail.status === "COMPLETED") {
      const historyReportDate = detail.reportDate ?? detail.createdAt.slice(0, 10);
      const rep = await generateReport({
        token: session.token,
        regionId: effectiveRegionId,
        reportDate: historyReportDate,
        flexUploadBatchId: detail.flexUploadBatchId,
        ...(detail.renderwaysUploadBatchId ? { renderwaysUploadBatchId: detail.renderwaysUploadBatchId } : {}),
        ...(detail.callPlanUploadBatchId ? { callPlanUploadBatchId: detail.callPlanUploadBatchId } : {}),
      });
      setReport(rep);
      window.localStorage.setItem(LAST_HISTORY_SESSION_KEY, rep.sessionId);
    }

    if (closeHistoryPanel) {
      setIsHistoryPanelOpen(false);
    }

    if (successMessage) {
      setMessage(successMessage);
    }

    return true;
  }

  async function handleHistoryOpen(historySession: ReportHistorySession) {
    if (!session) return;
    await runAction(async () => {
      await restoreHistorySession(historySession);
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
      // "Current Remarks" is optional — an empty value stays blank rather than
      // being flagged as a missing manual entry.
      const emptyFallback = column === "Current Remarks" ? "" : MANUAL_ENTRY_REQUIRED;
      nextOutput[column] =
        typeof displayValue === "string" && displayValue.trim().length > 0
          ? displayValue
          : emptyFallback;
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
            latestRow.id === row.id
              ? {
                ...latestRow,
                output: outputFromPersistedRow(
                  { ...latestRow.output },
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
          rows: latestReport.rows.filter((latestRow) => latestRow.id !== row.id),
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
        const rowRegion = String(row.output["Work Location"] ?? "").trim().toUpperCase();
        const targetRegion = String(selectedRegion ?? "").trim().toUpperCase();
        const matchRegion =
          selectedRegion === "ALL" ||
          !selectedRegion ||
          rowRegion === targetRegion;

        const rowCode = String(row.output["WO OTC CODE"] ?? "").trim().toUpperCase();
        const targetCode = String(selectedWoOtcCode ?? "").trim().toUpperCase();
        const matchCode = !selectedWoOtcCode || rowCode === targetCode;
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
    const hasPcFilter = showPcOnly;
    const isRtplRegionFiltered = selectedRtplRegion !== ALL_REGIONS_FILTER;

    let exportRows: ReportRow[] | null = null;

    if (hasClosedFilter) {
      const scopedClosedRows = scopedRows(closedRows);
      exportRows = applyActiveTableFilters(scopedClosedRows);
    } else if (
      hasConsumerFilter ||
      hasCommercialFilter ||
      hasWarrantyFilter ||
      hasNonWarrantyFilter ||
      hasCissFilter ||
      hasRcaFilter ||
      hasTradeFilter ||
      hasPrintFilter ||
      hasPcFilter
    ) {
      // Customer / warranty / special-case scope (mutually exclusive)...
      const scopeRows = hasConsumerFilter
        ? consumerRows
        : hasCommercialFilter
          ? commercialRows
          : hasWarrantyFilter
            ? warrantyRows
            : hasNonWarrantyFilter
              ? nonWarrantyRows
              : hasCissFilter
                ? cissRows
                : hasRcaFilter
                  ? rcaRows
                  : hasTradeFilter
                    ? tradeRows
                    : activeRows;

      // ...with the segment-product filter composed on top, mirroring the
      // displayed table (tableBaseRows).
      const scopedProductRows = hasPcFilter
        ? scopeRows.filter(isPcCase)
        : printCaseFilter === "installation"
          ? scopeRows.filter(isPrintInstallationCase)
          : printCaseFilter === "fix"
            ? scopeRows.filter(isPrintFixCase)
            : printCaseFilter === "all"
              ? scopeRows.filter(isPrintCase)
              : scopeRows;
      exportRows = applyActiveTableFilters(scopedRows(scopedProductRows));
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
    rtplStatuses,
    flexStatus,
    segment,
    segments,
    workLocations,
    wipAging,
    wipAgings,
    engineers,
    printCase = null,
    pcOnly = false,
    cissOnly = false,
    rcaOnly = false,
    tradeOnly = false,
    closedOnly = false,
    consumerOnly = false,
    commercialOnly = false,
    warrantyOnly = false,
    nonWarrantyOnly = false,
    ticketIds = null,
  }: Readonly<{
    region?: string | null;
    woOtcCode?: string | null;
    rtplStatus?: string | null;
    rtplStatuses?: readonly string[] | null;
    flexStatus?: string | null;
    segment?: string | null;
    segments?: readonly string[] | null;
    workLocations?: readonly string[] | null;
    wipAging?: string | null;
    wipAgings?: readonly string[] | null;
    engineers?: readonly string[] | null;
    printCase?: PrintCaseFilter | null;
    pcOnly?: boolean;
    cissOnly?: boolean;
    rcaOnly?: boolean;
    tradeOnly?: boolean;
    closedOnly?: boolean;
    consumerOnly?: boolean;
    commercialOnly?: boolean;
    warrantyOnly?: boolean;
    nonWarrantyOnly?: boolean;
    ticketIds?: readonly string[] | null;
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
    setShowPcOnly(pcOnly);
    setPrintCaseFilter(printCase);
    setSelectedRtplRegion(region && region !== "ALL" ? region : ALL_REGIONS_FILTER);
    colFilters.resetAll();
    if (ticketIds && ticketIds.length > 0) {
      colFilters.setColumnFilter("Ticket ID", new Set(ticketIds));
    }
    if (rtplStatus) {
      colFilters.setColumnFilter("RTPL status", new Set([rtplStatus]));
    }
    if (rtplStatuses && rtplStatuses.length > 0) {
      colFilters.setColumnFilter("RTPL status", new Set(rtplStatuses));
    }
    if (flexStatus) {
      colFilters.setColumnFilter("Flex Status", new Set([flexStatus]));
    }
    if (segment) {
      colFilters.setColumnFilter("Segment", new Set([segment]));
    }
    if (segments !== null && segments !== undefined) {
      colFilters.setColumnFilter("Segment", new Set(segments));
    }
    if (workLocations !== null && workLocations !== undefined) {
      colFilters.setColumnFilter("Work Location", new Set(workLocations));
    }
    if (wipAging) {
      colFilters.setColumnFilter("WIP aging", new Set([wipAging]));
    }
    if (wipAgings && wipAgings.length > 0) {
      colFilters.setColumnFilter("WIP aging", new Set(wipAgings));
    }
    if (engineers && engineers.length > 0) {
      colFilters.setColumnFilter("Engineer", new Set(engineers));
    }
    setWorkspaceView("records");
  }

  function openPivotSegmentFilter(): void {
    setDraftPivotSegments(selectedPivotSegments);
    setIsPivotSegmentFilterOpen(true);
  }

  function toggleDraftPivotSegment(segment: string): void {
    setDraftPivotSegments((current) => {
      const currentValues = current ?? rtplWipPivot.segmentOptions.map((option) => option.value);

      return currentValues.includes(segment)
        ? currentValues.filter((value) => value !== segment)
        : [...currentValues, segment];
    });
  }

  function applyPivotSegmentFilter(): void {
    const allSegments = rtplWipPivot.segmentOptions.map((option) => option.value);
    const nextSelection =
      draftPivotSegments !== null && draftPivotSegments.length === allSegments.length
        ? null
        : draftPivotSegments;

    setSelectedPivotSegments(nextSelection);
    setIsPivotSegmentFilterOpen(false);
  }

  function openPivotLocationFilter(): void {
    setDraftPivotLocations(selectedPivotLocations);
    setIsPivotLocationFilterOpen(true);
  }

  function toggleDraftPivotLocation(location: string): void {
    setDraftPivotLocations((current) => {
      const currentValues = current ?? [...availableLocationValues];

      return currentValues.includes(location)
        ? currentValues.filter((value) => value !== location)
        : [...currentValues, location];
    });
  }

  function applyPivotLocationFilter(): void {
    const allLocations = availableLocationValues;
    const nextSelection =
      draftPivotLocations !== null && draftPivotLocations.length === allLocations.length
        ? null
        : draftPivotLocations;

    setSelectedPivotLocations(nextSelection);
    setIsPivotLocationFilterOpen(false);
  }

  function openPivotRecords({
    rtplStatus,
    wipAging,
  }: Readonly<{
    rtplStatus?: string;
    wipAging?: string;
  }>): void {
    const targetStatus = rtplStatus ?? null;
    const targetWip = wipAging ?? null;

    if (pivotActiveStatus === targetStatus && pivotActiveWipAging === targetWip) {
      setPivotActiveStatus(null);
      setPivotActiveWipAging(null);
    } else {
      setPivotActiveStatus(targetStatus);
      setPivotActiveWipAging(targetWip);
    }
  }

  const onShowAllRegions = () => {
    setSelectedRegion(null);
    setSelectedWoOtcCode(null);
    setShowClosedOnly(false);
    setShowCissOnly(false);
    setShowRcaOnly(false);
    setShowTradeOnly(false);
    setPrintCaseFilter(null);
    colFilters.resetAll();
  };

  // Drives the overview region dropdown. Switching region clears any case-type
  // scope (same reset as "Show All Regions") so the chosen region starts clean.
  const selectOverviewRegion = (value: string) => {
    setSelectedWoOtcCode(null);
    setShowClosedOnly(false);
    setShowCissOnly(false);
    setShowRcaOnly(false);
    setShowTradeOnly(false);
    setPrintCaseFilter(null);
    colFilters.resetAll();

    if (value === "ALL") {
      setSelectedRegion(null);
      setSelectedRtplRegion(ALL_REGIONS_FILTER);
    } else {
      setSelectedRegion(value);
      setSelectedRtplRegion(value);
    }
  };

  // Open rows scoped to the region chosen in the overview dropdown (null/"ALL"
  // → every region). Drives the operational-health header cards below.
  const regionScopedActiveRows = useMemo(() => {
    if (!selectedRegion || selectedRegion === "ALL") return activeRows;
    const target = selectedRegion.trim().toUpperCase();
    return activeRows.filter(
      (row) => String(row.output["Work Location"] ?? "").trim().toUpperCase() === target,
    );
  }, [activeRows, selectedRegion]);

  // Operational-health signals for the overview header — "what needs attention
  // now" rather than raw volume totals (which are surfaced lower on the page).
  const operationalHealth = useMemo(
    () => computeOperationalHealth(regionScopedActiveRows),
    [regionScopedActiveRows],
  );

  const overviewMetrics: MetricsGridItem[] = report
    ? [
      {
        label: "Actionable & Planned",
        value: "",
        detail: "",
        customRender: () => (
          <div className="activityCustomCard">
            <div
              className="activityCol clickableCol"
              onClick={(e) => {
                e.stopPropagation();
                if (operationalHealth.actionable.count > 0) {
                  openRecordsWithFilter({ region: selectedRegion, rtplStatuses: operationalHealth.actionable.values });
                }
              }}
            >
              <span className="activityLabel">Actionable</span>
              <strong className="activityVal">{operationalHealth.actionable.count}</strong>
            </div>
            <div className="activityDivider" />
            <div
              className="activityCol clickableCol"
              onClick={(e) => {
                e.stopPropagation();
                if (operationalHealth.planned.count > 0) {
                  openRecordsWithFilter({ region: selectedRegion, rtplStatuses: operationalHealth.planned.values });
                }
              }}
            >
              <span className="activityLabel">Planned</span>
              <strong className="activityVal">{operationalHealth.planned.count}</strong>
            </div>
          </div>
        ),
        tone: "blue",
      },
      {
        label: "At-Risk Backlog",
        value: "",
        detail: "",
        customRender: () => (
          <div className="agedCustomCard">
            <div
              className="agedCol clickableCol"
              onClick={(e) => {
                e.stopPropagation();
                if (operationalHealth.aged.aged5PlusCount > 0) {
                  openRecordsWithFilter({ region: selectedRegion, wipAgings: operationalHealth.aged.aged5PlusValues });
                }
              }}
            >
              <span className="agedLabel">5+ Days</span>
              <strong className="agedVal">{operationalHealth.aged.aged5PlusCount}</strong>
            </div>
            <div className="agedDivider" />
            <div
              className="agedCol clickableCol"
              onClick={(e) => {
                e.stopPropagation();
                if (operationalHealth.aged.aged7PlusCount > 0) {
                  openRecordsWithFilter({ region: selectedRegion, wipAgings: operationalHealth.aged.aged7PlusValues });
                }
              }}
            >
              <span className="agedLabel">7+ Days</span>
              <strong className="agedVal">{operationalHealth.aged.aged7PlusCount}</strong>
            </div>
            <div className="agedDivider" />
            <div
              className="agedCol clickableCol"
              onClick={(e) => {
                e.stopPropagation();
                if (operationalHealth.aged.aged10PlusCount > 0) {
                  openRecordsWithFilter({ region: selectedRegion, wipAgings: operationalHealth.aged.aged10PlusValues });
                }
              }}
            >
              <span className="agedLabel">10+ Days</span>
              <strong className="agedVal">{operationalHealth.aged.aged10PlusCount}</strong>
            </div>
          </div>
        ),
        tone: "danger",
      },
      {
        label: "Parts Pending",
        value: "",
        detail: "",
        customRender: () => (
          <div className="partsPendingCustomCard">
            <div
              className="partsPendingCol clickableCol"
              onClick={(e) => {
                e.stopPropagation();
                if (operationalHealth.partPending.partPendingCount > 0) {
                  openRecordsWithFilter({ region: selectedRegion, rtplStatuses: operationalHealth.partPending.partPendingValues });
                }
              }}
            >
              <span className="partsPendingLabel">Part Pending</span>
              <strong className="partsPendingVal">{operationalHealth.partPending.partPendingCount}</strong>
            </div>
            <div className="partsPendingDivider" />
            <div
              className="partsPendingCol clickableCol"
              onClick={(e) => {
                e.stopPropagation();
                if (operationalHealth.partPending.partOrderPendingCount > 0) {
                  openRecordsWithFilter({ region: selectedRegion, rtplStatuses: operationalHealth.partPending.partOrderPendingValues });
                }
              }}
            >
              <span className="partsPendingLabel">Part Order Pending</span>
              <strong className="partsPendingVal">{operationalHealth.partPending.partOrderPendingCount}</strong>
            </div>
          </div>
        ),
        tone: "warn",
      },
      {
        label: "Unassigned",
        value: operationalHealth.unassigned.count,
        detail: `of ${operationalHealth.openCount} open`,
        tone: "warn",
        ...(operationalHealth.unassigned.count > 0
          ? { onClick: () => openRecordsWithFilter({ region: selectedRegion, engineers: operationalHealth.unassigned.values }) }
          : {}),
      },
    ]
    : [];

  // Tickets in the visible set whose Renderways "current status aging" is at
  // least STALE_FLEX_THRESHOLD_DAYS, worst offenders first. current_status_aging
  // may be null/undefined (e.g. unmatched rows or older uploads) — guarded here
  // so the banner simply stays empty (and hidden) in that case.
  const staleFlexRows = useMemo(
    () =>
      filteredRows
        .filter((row) => {
          const days = row.enriched?.current_status_aging;
          return days != null && days >= STALE_FLEX_THRESHOLD_DAYS;
        })
        .sort(
          (a, b) =>
            (b.enriched?.current_status_aging ?? 0) -
            (a.enriched?.current_status_aging ?? 0),
        ),
    [filteredRows],
  );
  // Filter the records table down to a single stale ticket and close the
  // details modal — the simplest reliable "jump to ticket" (reuses the search
  // filter).
  function jumpToStaleTicket(ticketId: string): void {
    if (!ticketId) {
      return;
    }
    setRecordsSearchQuery(ticketId);
    setWorkspaceView("records");
    setIsStaleModalOpen(false);
  }

  // Escalate emphasis with the unchanged-day count (tasteful, warning-palette).
  function staleSeverityClass(days: number): string {
    if (days >= STALE_FLEX_THRESHOLD_DAYS * 3) {
      return "staleSeverityHigh";
    }
    if (days >= STALE_FLEX_THRESHOLD_DAYS * 2) {
      return "staleSeverityMedium";
    }
    return "staleSeverityLow";
  }

  // Two-way scrollLeft sync between the top proxy scrollbar and the table. The
  // equality check terminates the feedback loop: once the paired element is set
  // to this element's scrollLeft, its own onScroll sees the values already match
  // and stops — no boolean flag needed (robust to coalesced scroll events).
  function handleTableWrapScroll(event: React.UIEvent<HTMLDivElement>): void {
    if (recordsAreaRef.current) {
      recordsAreaRef.current.classList.toggle("summaryHidden", event.currentTarget.scrollTop > 10);
    }
    const proxy = recordsScrollTopRef.current;
    if (proxy && proxy.scrollLeft !== event.currentTarget.scrollLeft) {
      proxy.scrollLeft = event.currentTarget.scrollLeft;
    }
  }

  function handleTopScroll(event: React.UIEvent<HTMLDivElement>): void {
    const tableWrap = recordsTableWrapRef.current;
    if (tableWrap && tableWrap.scrollLeft !== event.currentTarget.scrollLeft) {
      tableWrap.scrollLeft = event.currentTarget.scrollLeft;
    }
  }

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

  // Records scope breakdown for the header card: the active dashboard category
  // (PC / Print / Trade / ...) total within the current region scope, split into
  // Consumer vs Commercial. regionFilteredRows already has the category + region
  // filters applied (independent of ad-hoc column filters), so the total matches
  // the dashboard card that was clicked to open Records.
  const recordsScopeLabel = (() => {
    if (showClosedOnly) return "Closed Total";
    if (showPcOnly) return "PC Total";
    if (printCaseFilter === "installation") return "Print Install Total";
    if (printCaseFilter === "fix") return "Print Fix Total";
    if (printCaseFilter === "all") return "Print Total";
    if (showCissOnly) return "CISS Total";
    if (showTradeOnly) return "Trade Total";
    if (showNonWarrantyOnly) return "Non-Warranty Total";
    if (showWarrantyOnly) return "Warranty Total";
    if (showRcaOnly) return "RCA Total";
    if (showConsumerOnly) return "Consumer Total";
    if (showCommercialOnly) return "Commercial Total";
    return "Total";
  })();
  const recordsScopeTotal = regionFilteredRows.length;
  const recordsScopeConsumer = regionFilteredRows.filter(isConsumerCase).length;
  const recordsScopeCommercial = recordsScopeTotal - recordsScopeConsumer;
  const recordsScopeWarranty = regionFilteredRows.filter(isWarrantyCase).length;
  const recordsScopeTrade = recordsScopeTotal - recordsScopeWarranty;
  const recordsScopeManualPending = countManualRequiredCells(regionFilteredRows);
  // Segment mix only makes sense in the unfiltered "Total" scope; when a single
  // category is selected the rows are already just that category.
  const recordsScopeHasCategory =
    showPcOnly ||
    printCaseFilter !== null ||
    showCissOnly ||
    showTradeOnly ||
    showWarrantyOnly ||
    showNonWarrantyOnly ||
    showConsumerOnly ||
    showCommercialOnly ||
    showRcaOnly ||
    showClosedOnly;
  const recordsScopeSegmentMix = recordsScopeHasCategory
    ? null
    : [
      { key: "pc", label: "PC", count: regionFilteredRows.filter(isPcCase).length, onSelect: () => openRecordsWithFilter({ region: selectedRegion, pcOnly: true }) },
      { key: "printFix", label: "Print Fix", count: regionFilteredRows.filter(isPrintFixCase).length, onSelect: () => openRecordsWithFilter({ region: selectedRegion, printCase: "fix" }) },
      { key: "printInstall", label: "Print Install", count: regionFilteredRows.filter(isPrintInstallationCase).length, onSelect: () => openRecordsWithFilter({ region: selectedRegion, printCase: "installation" }) },
      { key: "ciss", label: "CISS", count: regionFilteredRows.filter(isCissCase).length, onSelect: () => openRecordsWithFilter({ region: selectedRegion, cissOnly: true }) },
      { key: "trade", label: "Trade", count: regionFilteredRows.filter(isTradeCase).length, onSelect: () => openRecordsWithFilter({ region: selectedRegion, tradeOnly: true }) },
    ];

  const renderDetailedRecordsTable = (tableRows: ReportRow[]) => {
    return (
      <div className={`recordsTableZone ${isRecordsTableMaximized ? "maximized" : ""}`}>
        {isRecordsTableMaximized ? (
          <div className="recordsTableZoneBar">
            <span className="recordsTableZoneTitle">
              Records — Full Screen
              <span className="recordsTableZoneCount">
                {tableRows.length} rows
              </span>
            </span>
            <div className="recordsSearchBar recordsTableZoneSearch">
              <input
                type="search"
                value={recordsSearchQuery}
                aria-label="Search records"
                placeholder="Search WO, case ID, trade..."
                onChange={(event) => setRecordsSearchQuery(event.target.value)}
              />
            </div>
            <button
              type="button"
              className="secondaryButton"
              onClick={() => setIsRecordsTableMaximized(false)}
              title="Exit full screen (Esc)"
            >
              ✕ Exit Full Screen
            </button>
          </div>
        ) : null}
        <div
          className="tableScrollTop"
          ref={recordsScrollTopRef}
          onScroll={handleTopScroll}
          aria-hidden="true"
        >
          <div className="tableScrollTopSpacer" ref={recordsScrollTopSpacerRef} />
        </div>
        <div
          className="tableWrap"
          ref={recordsTableWrapRef}
          onScroll={handleTableWrapScroll}
        >
          <table>
            <thead>
              <tr>
                {visibleColumns.map((column) => {
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
              {tableRows.map((row, visibleIndex) => {
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
                    {visibleColumns.map((column) => {
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
                          title={
                            isCarriedForward
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
                                  groups={rtplStatusGroups}
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
                                {(draftOutput[column] === "" || !rtplStatusFlatOptions.some((opt) => opt === String(draftOutput[column]))) && (
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
                                <span>
                                  {value === MANUAL_ENTRY_REQUIRED
                                    ? "Entry"
                                    : column === "Work Location"
                                      ? ASP_CODE_REGION_MAP[String(value ?? "").trim()] ?? String(value ?? "")
                                      : String(value ?? "")}
                                </span>
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
                        <div className="rowActions">
                          <button
                            type="button"
                            className="secondaryButton caseViewBtn"
                            title="View case details"
                            aria-label="View case details"
                            onClick={() => setCaseDetailRow(row)}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="secondaryButton"
                            onClick={() => startEditing(row)}
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="dashboardLayout">
      <aside
        className={`appSidebar ${isSidebarCollapsed ? "collapsed" : ""} ${isResizing ? "resizing" : ""}`}
        style={{ width: isSidebarCollapsed ? "72px" : `${sidebarWidth}px` }}
      >
        <button
          type="button"
          className="sidebarCollapseToggle"
          onClick={() => {
            const nextCollapsed = !isSidebarCollapsed;
            setIsSidebarCollapsed(nextCollapsed);
            try {
              window.localStorage.setItem("opencall.sidebarCollapsed", String(nextCollapsed));
            } catch {}
          }}
          aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isSidebarCollapsed ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          )}
        </button>
        <div
          className="sidebarResizeHandle"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
        />
        <div className="sidebarBrand">
          <div className="sidebarLogo" aria-hidden="true" style={{ background: "none", boxShadow: "none" }}>
            <img src={logoIcon.src} alt="R" style={{ width: "38px", height: "38px", objectFit: "contain" }} />
          </div>
          <span className="sidebarTitle">Renderways</span>
        </div>

        <div className="sidebarMenu">
          <div className="sidebarSection">Dashboards</div>

          <button
            type="button"
            className={`sidebarItem ${workspaceView === "overview" ? "active" : ""}`}
            onClick={() => setWorkspaceView("overview")}
          >
            <span className="sidebarIcon">
              <span>📊</span> <span className="sidebarText">Overview</span>
            </span>
          </button>

          <button
            type="button"
            className={`sidebarItem ${workspaceView === "rtpl-dashboard" ? "active" : ""}`}
            onClick={() => setWorkspaceView("rtpl-dashboard")}
          >
            <span className="sidebarIcon">
              <span>📈</span> <span className="sidebarText">RTPL Dashboard</span>
            </span>
          </button>

          <button
            type="button"
            className={`sidebarItem ${workspaceView === "rtpl" ? "active" : ""}`}
            onClick={() => setWorkspaceView("rtpl")}
          >
            <span className="sidebarIcon">
              <span>📈</span> <span className="sidebarText">RTPL Houres status</span>
            </span>
          </button>

          <button
            type="button"
            className={`sidebarItem ${workspaceView === "sla-tat" ? "active" : ""}`}
            onClick={() => setWorkspaceView("sla-tat")}
          >
            <span className="sidebarIcon">
              <span>⏰</span> <span className="sidebarText">SLA TaT</span>
            </span>
          </button>

          <button
            type="button"
            className={`sidebarItem ${workspaceView === "pivot" ? "active" : ""}`}
            onClick={() => setWorkspaceView("pivot")}
          >
            <span className="sidebarIcon">
              <span>🧩</span> <span className="sidebarText">RTPL pivot</span>
            </span>
          </button>

          <button
            type="button"
            className={`sidebarItem ${workspaceView === "tn-view-status" ? "active" : ""}`}
            onClick={() => setWorkspaceView("tn-view-status")}
          >
            <span className="sidebarIcon">
              <span>📊</span> <span className="sidebarText">TN VIEW Status</span>
            </span>
          </button>

          <button
            type="button"
            className={`sidebarItem ${workspaceView === "flex" ? "active" : ""}`}
            onClick={() => setWorkspaceView("flex")}
          >
            <span className="sidebarIcon">
              <span>⚡</span> <span className="sidebarText">Flex Dashboard</span>
            </span>
          </button>

          <button
            type="button"
            className={`sidebarItem ${workspaceView === "flex-eod-bod" ? "active" : ""}`}
            onClick={() => setWorkspaceView("flex-eod-bod")}
          >
            <span className="sidebarIcon">
              <span>📈</span> <span className="sidebarText">Flex Eod&Bod</span>
            </span>
          </button>

          <div className="sidebarSection">Data & Operations</div>

          <button
            type="button"
            className={`sidebarItem ${workspaceView === "records" ? "active" : ""}`}
            disabled={!report}
            onClick={() => setWorkspaceView("records")}
          >
            <span className="sidebarIcon">
              <span>📋</span> <span className="sidebarText">Records Table</span>
            </span>
            {report && incompleteCellCount > 0 && (
              <span className="sidebarBadge">{incompleteCellCount}</span>
            )}
          </button>

          {(session.user.role === "SUPER_ADMIN" || (selectedRegion && selectedRegion !== "ALL" && regionKpiMetrics)) && (
            <button
              type="button"
              className={`sidebarItem ${workspaceView === "productivity" ? "active" : ""}`}
              onClick={() => setWorkspaceView("productivity")}
            >
              <span className="sidebarIcon">
                <span>👥</span> <span className="sidebarText">Engineer Productivity</span>
              </span>
            </button>
          )}

          {(session.user.role === "SUPER_ADMIN" || session.user.role === "REGION_ADMIN") && (
            <button
              type="button"
              className={`sidebarItem ${workspaceView === "admin-engineers" ? "active" : ""}`}
              onClick={() => setWorkspaceView("admin-engineers")}
            >
              <span className="sidebarIcon">
                <span>👤</span> <span className="sidebarText">Add Engineers</span>
              </span>
            </button>
          )}

          {session.user.role === "SUPER_ADMIN" && (
            <button
              type="button"
              className={`sidebarItem ${workspaceView === "admin-rtpl-statuses" ? "active" : ""}`}
              onClick={() => setWorkspaceView("admin-rtpl-statuses")}
            >
              <span className="sidebarIcon">
                <span>🏷️</span> <span className="sidebarText">RTPL Statuses</span>
              </span>
            </button>
          )}

          <div className="sidebarSection">Utilities & System</div>

          {session.user.role === "SUPER_ADMIN" && (
            <button
              type="button"
              className="sidebarItem"
              onClick={() => setIsUploadDrawerOpen(true)}
            >
              <span className="sidebarIcon">
                <span>📤</span> <span className="sidebarText">Upload Files</span>
              </span>
            </button>
          )}

          <button
            type="button"
            className="sidebarItem"
            onClick={() => setIsHistoryPanelOpen(true)}
          >
            <span className="sidebarIcon">
              <span>📜</span> <span className="sidebarText">History Logs</span>
            </span>
          </button>

          <button
            type="button"
            className="sidebarItem"
            onClick={() => void handleRefreshWorkspace()}
            disabled={isBusy}
          >
            <span className="sidebarIcon">
              <span>🔄</span> <span className="sidebarText">Refresh Workspace</span>
            </span>
          </button>



          <button
            type="button"
            className="sidebarItem danger"
            onClick={handleLogout}
            style={{ color: "#f87171" }}
          >
            <span className="sidebarIcon">
              <span>🚪</span> <span className="sidebarText">Log Out</span>
            </span>
          </button>
        </div>
      </aside>

      <main className="mainLayoutContent">
        <AppHeader
          workspaceView={workspaceView}
          hasReport={Boolean(report)}
          hasBatches={canUseBatches}
          isBusy={isBusy}
          dbHealth={dbHealth}
          runtimeHealth={runtimeHealth}
          session={session}
          onWorkspaceViewChange={setWorkspaceView}
          onRefreshHealth={() => void handleRefreshWorkspace()}
          onOpenUpload={() => setIsUploadDrawerOpen(true)}
          onOpenHistory={() => setIsHistoryPanelOpen(true)}
          onGenerateReport={() => void handleGenerate()}
          onExportXlsx={() => exportReport(downloadReportAsXlsx)}
          onExportCsv={() => exportReport(downloadReportAsExcel)}
          onLogout={handleLogout}
        />

        <div className="pageContent">
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
                    {workspaceView === "overview" && (
                      <>
                        <div className="sectionHeader">
                          <div className="overviewRegionPicker">
                            {session?.user?.role === "REGION_ADMIN" ? (
                              <h2>{report.regionBreakdown[0]?.regionName ?? "My Region"}</h2>
                            ) : (
                              <select
                                className="overviewRegionSelect"
                                aria-label="Select region"
                                value={selectedRegion ?? "ALL"}
                                onChange={(event) => selectOverviewRegion(event.target.value)}
                              >
                                <option value="ALL">All Regions</option>
                                {activeRegionBreakdown
                                  .filter((entry) => entry.count > 0)
                                  .map((entry) => (
                                    <option key={entry.aspCode || entry.regionName} value={entry.aspCode}>
                                      {entry.regionName}
                                    </option>
                                  ))}
                              </select>
                            )}
                          </div>
                          <MetricsGrid items={overviewMetrics} />
                        </div>

                        {staleFlexRows.length > 0 ? (
                          <div className="staleFlexBanner" role="status" style={{ borderLeft: "4px solid #f59e0b", padding: "10px 14px", background: "#fffbeb", borderRadius: "10px", border: "1px solid #fef3c7", marginBottom: "20px" }}>
                            <div className="staleFlexBannerHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                              <p className="staleFlexBannerSummary" style={{ margin: 0, fontSize: "12px", fontWeight: "800", color: "#b45309" }}>
                                ⚠ Status Aging Summary
                              </p>
                              <button
                                type="button"
                                className="staleFlexToggle"
                                style={{
                                  fontSize: "11px",
                                  fontWeight: "700",
                                  padding: "3px 8px",
                                  borderRadius: "6px",
                                  border: "1px solid #d97706",
                                  color: "#d97706",
                                  background: "#ffffff",
                                  cursor: "pointer"
                                }}
                                onClick={() => setIsStaleModalOpen(true)}
                              >
                                View Detailed List
                              </button>
                            </div>
                            <div className="staleAgingGrid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                              <div
                                style={{
                                  background: "#ffffff",
                                  border: "1px solid #fde68a",
                                  borderRadius: "8px",
                                  padding: "8px 10px",
                                  textAlign: "center",
                                  cursor: "pointer",
                                  transition: "transform 0.2s"
                                }}
                                onClick={() => {
                                  const ticketIds = staleFlexRows
                                    .filter((r) => (r.enriched?.current_status_aging ?? 0) >= 2)
                                    .map((r) => String(r.output["Ticket ID"] ?? "").trim())
                                    .filter(Boolean);
                                  openRecordsWithFilter({ ticketIds });
                                }}
                                title="Click to filter table to 2+ days aging"
                              >
                                <div style={{ fontSize: "10px", fontWeight: "700", color: "#6b7280", textTransform: "uppercase" }}>2+ Days</div>
                                <div style={{ fontSize: "20px", fontWeight: "900", color: "#d97706", marginTop: "2px" }}>
                                  {staleFlexRows.filter((r) => (r.enriched?.current_status_aging ?? 0) >= 2).length}
                                </div>
                              </div>
                              <div
                                style={{
                                  background: "#ffffff",
                                  border: "1px solid #fde68a",
                                  borderRadius: "8px",
                                  padding: "8px 10px",
                                  textAlign: "center",
                                  cursor: "pointer",
                                  transition: "transform 0.2s"
                                }}
                                onClick={() => {
                                  const ticketIds = staleFlexRows
                                    .filter((r) => (r.enriched?.current_status_aging ?? 0) >= 6)
                                    .map((r) => String(r.output["Ticket ID"] ?? "").trim())
                                    .filter(Boolean);
                                  openRecordsWithFilter({ ticketIds });
                                }}
                                title="Click to filter table to 6+ days aging"
                              >
                                <div style={{ fontSize: "10px", fontWeight: "700", color: "#6b7280", textTransform: "uppercase" }}>6+ Days</div>
                                <div style={{ fontSize: "20px", fontWeight: "900", color: "#d97706", marginTop: "2px" }}>
                                  {staleFlexRows.filter((r) => (r.enriched?.current_status_aging ?? 0) >= 6).length}
                                </div>
                              </div>
                              <div
                                style={{
                                  background: "#ffffff",
                                  border: "1px solid #fca5a5",
                                  borderRadius: "8px",
                                  padding: "8px 10px",
                                  textAlign: "center",
                                  cursor: "pointer",
                                  transition: "transform 0.2s"
                                }}
                                onClick={() => {
                                  const ticketIds = staleFlexRows
                                    .filter((r) => (r.enriched?.current_status_aging ?? 0) >= 25)
                                    .map((r) => String(r.output["Ticket ID"] ?? "").trim())
                                    .filter(Boolean);
                                  openRecordsWithFilter({ ticketIds });
                                }}
                                title="Click to filter table to 25+ days aging"
                              >
                                <div style={{ fontSize: "10px", fontWeight: "700", color: "#dc2626", textTransform: "uppercase" }}>25+ Days</div>
                                <div style={{ fontSize: "20px", fontWeight: "900", color: "#dc2626", marginTop: "2px" }}>
                                  {staleFlexRows.filter((r) => (r.enriched?.current_status_aging ?? 0) >= 25).length}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        <OverviewCharts
                          report={report}
                          activeRows={activeRows}
                          overallStats={overallStats}
                          selectedRegion={selectedRegion}
                        />
                        {showCaseTypeOverview && (
                          <CaseTypeCards
                            printInstallationRows={printInstallationRows}
                            cissRows={cissRows}
                            printFixRows={printFixRows}
                            pcRows={pcRows}
                            tradeRows={tradeRows}
                            rcaRows={rcaRows}
                            printCaseFilter={printCaseFilter}
                            showCissOnly={showCissOnly}
                            showTradeOnly={showTradeOnly}
                            showRcaOnly={showRcaOnly}
                            caseTypeRegionBreakdown={caseTypeRegionBreakdown}
                            openRecordsWithFilter={openRecordsWithFilter}
                          />
                        )}

                        {showCustomerSegmentSplit && (
                          <CustomerSegmentCards
                            showConsumerOnly={showConsumerOnly}
                            consumerRows={consumerRows}
                            showCommercialOnly={showCommercialOnly}
                            commercialRows={commercialRows}
                            showWarrantyOnly={showWarrantyOnly}
                            warrantyRows={warrantyRows}
                            showNonWarrantyOnly={showNonWarrantyOnly}
                            nonWarrantyRows={nonWarrantyRows}
                            caseTypeRegionBreakdown={caseTypeRegionBreakdown}
                            incompleteCellCount={incompleteCellCount}
                            openRecordsWithFilter={openRecordsWithFilter}
                          />
                        )}
                      </>
                    )}



                    {workspaceView === "rtpl-dashboard" && (
                      <RegionBreakdown
                        canShowAllRegions={session?.user?.role !== "REGION_ADMIN"}
                        overallStats={overallStats}
                        activeRegionBreakdown={activeRegionBreakdown}
                        selectedRegion={selectedRegion}
                        selectedWoOtcCode={selectedWoOtcCode}
                        showConsumerOnly={showConsumerOnly}
                        showCommercialOnly={showCommercialOnly}
                        showWarrantyOnly={showWarrantyOnly}
                        showNonWarrantyOnly={showNonWarrantyOnly}
                        showPcOnly={showPcOnly}
                        showCissOnly={showCissOnly}
                        showRcaOnly={showRcaOnly}
                        printCaseFilter={printCaseFilter}
                        openRecordsWithFilter={openRecordsWithFilter}
                        onShowAllRegions={onShowAllRegions}
                      />
                    )}

                    {workspaceView === "rtpl" && (
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
                        bodFixedTime={bodFixedTime}
                        bodSnapshot={bodSnapshot}
                        onFixBod={handleFixBod}
                        onDownloadBodEod={handleDownloadBodEod}
                      />
                    )}

                    {workspaceView === "pivot" && (
                      <RTPLPivotTable
                        rtplWipPivot={rtplWipPivot}
                        draftPivotSegmentSet={draftPivotSegmentSet}
                        draftPivotLocationSet={draftPivotLocationSet}
                        pivotAllSegmentCount={pivotAllSegmentCount}
                        pivotLocationOptions={pivotLocationOptions}
                        pivotAllLocationCount={pivotAllLocationCount}
                        pivotSegmentFilterActive={pivotSegmentFilterActive}
                        appliedPivotSegmentLabel={appliedPivotSegmentLabel}
                        isPivotSegmentFilterOpen={isPivotSegmentFilterOpen}
                        setIsPivotSegmentFilterOpen={setIsPivotSegmentFilterOpen}
                        draftPivotSegments={draftPivotSegments}
                        setDraftPivotSegments={setDraftPivotSegments}
                        selectedPivotSegments={selectedPivotSegments}
                        selectedPivotCaseScope={selectedPivotCaseScope}
                        setSelectedPivotCaseScope={setSelectedPivotCaseScope}
                        pivotLocationFilterActive={pivotLocationFilterActive}
                        appliedPivotLocationLabel={appliedPivotLocationLabel}
                        isPivotLocationFilterOpen={isPivotLocationFilterOpen}
                        setIsPivotLocationFilterOpen={setIsPivotLocationFilterOpen}
                        draftPivotLocations={draftPivotLocations}
                        setDraftPivotLocations={setDraftPivotLocations}
                        selectedPivotLocations={selectedPivotLocations}
                        openPivotSegmentFilter={openPivotSegmentFilter}
                        toggleDraftPivotSegment={toggleDraftPivotSegment}
                        applyPivotSegmentFilter={applyPivotSegmentFilter}
                        openPivotLocationFilter={openPivotLocationFilter}
                        toggleDraftPivotLocation={toggleDraftPivotLocation}
                        applyPivotLocationFilter={applyPivotLocationFilter}
                        openPivotRecords={openPivotRecords}
                      />
                    )}


                    {workspaceView === "tn-view-status" && (
                      <TNViewStatusPage
                        selectedRegion={selectedRegion}
                        setSelectedRegion={setSelectedRegion}
                        activeRegionName={activeRegionName}
                        activeRegionBreakdown={activeRegionBreakdown}
                        tnViewMode={tnViewMode}
                        setTnViewMode={setTnViewMode}
                        tnFilterType={tnFilterType}
                        setTnFilterType={setTnFilterType}
                        selectedTnValue={selectedTnValue}
                        setSelectedTnValue={setSelectedTnValue}
                        regionDateMetadata={regionDateMetadata}
                        tnDateLabel={tnDateLabel}
                        regionKpiMetrics={regionKpiMetrics}
                        tnFilteredRows={tnFilteredRows}
                        getParsedDateForExcel={getParsedDateForExcel}
                        isSuperAdmin={session?.user?.role === "SUPER_ADMIN"}
                      />
                    )}

                    {workspaceView === "sla-tat" && (
                      <SLATatPage
                        selectedRegion={selectedRegion}
                        activeRegionName={activeRegionName}
                        pcRows={pcRows}
                        printFixRows={printFixRows}
                        printInstallationRows={printInstallationRows}
                        openRecordsWithFilter={openRecordsWithFilter}
                      />
                    )}

                    {workspaceView === "flex" && (
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
                    )}

                    {workspaceView === "flex-eod-bod" && (
                      <FlexEodBodPage
                        selectedRegion={selectedRegion}
                        setSelectedRegion={setSelectedRegion}
                        activeRegionName={activeRegionName}
                        activeRegionBreakdown={activeRegionBreakdown}
                        eodBodViewMode={eodBodViewMode}
                        setEodBodViewMode={setEodBodViewMode}
                        eodBodFilterType={eodBodFilterType}
                        setEodBodFilterType={setEodBodFilterType}
                        selectedEodBodValue={selectedEodBodValue}
                        setSelectedEodBodValue={setSelectedEodBodValue}
                        regionDateMetadata={regionDateMetadata}
                        chennaiKpiMetrics={chennaiKpiMetrics}
                        eodBodFilteredRows={eodBodFilteredRows}
                        getParsedDateForExcel={getParsedDateForExcel}
                        getDayOfWeek={getDayOfWeek}
                        isSuperAdmin={session?.user?.role === "SUPER_ADMIN"}
                      />
                    )}

                    {workspaceView === "admin-engineers" && (
                      <AdminEngineersPage />
                    )}

                    {workspaceView === "admin-rtpl-statuses" && (
                      <AdminRtplStatusesManager
                        onStatusesChanged={() => {
                          if (!session) return;
                          getRtplStatusesDropdown(session.token)
                            .then((res) => setRtplStatusGroups(buildStatusGroups(res.statuses)))
                            .catch(handleBackgroundError);
                        }}
                      />
                    )}

                    {workspaceView === "productivity" && (
                      <ProductivityPage
                        selectedRegion={selectedRegion}
                        setSelectedRegion={setSelectedRegion}
                        activeRegionName={activeRegionName}
                        productivityFilterType={productivityFilterType}
                        setProductivityFilterType={setProductivityFilterType}
                        selectedProductivityValue={selectedProductivityValue}
                        setSelectedProductivityValue={setSelectedProductivityValue}
                        engineerProductivityMetrics={engineerProductivityMetrics}
                        productivityDateLabel={productivityDateLabel}
                        regionsList={report?.regionBreakdown ?? []}
                        isSuperAdmin={session?.user?.role === "SUPER_ADMIN"}
                        openRecordsWithFilter={openRecordsWithFilter}
                      />
                    )}

                    {showDayOverDayComparison && workspaceView === "overview" && (
                      <ComparisonSummaryPanel report={report} />
                    )}
                    {showManualCarryForward && workspaceView === "overview" && (
                      <CarryForwardSummaryPanel report={report} />
                    )}

                    {showClosedCallLedger && overallClosedCount > 0 && workspaceView === "overview" ? (
                      <ClosedCallLedger
                        overallClosedCount={overallClosedCount}
                        closedRegionBreakdown={closedRegionBreakdown}
                        showClosedOnly={showClosedOnly}
                        selectedRegion={selectedRegion}
                        openRecordsWithFilter={openRecordsWithFilter}
                      />
                    ) : null}
                  </div>

                  {workspaceView === "records" && (
                    <div className="recordsArea" ref={recordsAreaRef}>
                      <div className="recordsScopeRow">
                        {/* Active category breakdown grid layout */}
                        <div className="recordsScopeCard">
                          {/* Col 1: Total info */}
                          <div className="recordsScopeColInfo">
                            {activeRegionName ? (
                              <span className="recordsScopeRegion">{activeRegionName}</span>
                            ) : null}
                            <span className="recordsScopeLabel">{recordsScopeLabel}</span>
                            <strong className="recordsScopeTotal">{formatNumber(recordsScopeTotal)}</strong>
                          </div>

                          {/* Col 2: Category Split */}
                          <div className="recordsScopeColSplit">
                            <span className="recordsScopeColHeader">Category Split</span>
                            <div className="recordsScopeSplit" style={{ marginTop: 0 }}>
                              <button
                                type="button"
                                className="recordsScopeSplitItem"
                                title="Show Consumer records only"
                                onClick={() => openRecordsWithFilter({ region: selectedRegion, consumerOnly: true })}
                              >
                                <span>Consumer</span>
                                <strong>{formatNumber(recordsScopeConsumer)}</strong>
                              </button>
                              <button
                                type="button"
                                className="recordsScopeSplitItem"
                                title="Show Commercial records only"
                                onClick={() => openRecordsWithFilter({ region: selectedRegion, commercialOnly: true })}
                              >
                                <span>Commercial</span>
                                <strong>{formatNumber(recordsScopeCommercial)}</strong>
                              </button>
                            </div>
                          </div>

                          {/* Col 3: Type Split */}
                          <div className="recordsScopeColSplit">
                            <span className="recordsScopeColHeader">Type Split</span>
                            <div className="recordsScopeSplit" style={{ marginTop: 0 }}>
                              <button
                                type="button"
                                className="recordsScopeSplitItem"
                                title="Show Warranty records only"
                                onClick={() => openRecordsWithFilter({ region: selectedRegion, warrantyOnly: true })}
                              >
                                <span>Warranty</span>
                                <strong>{formatNumber(recordsScopeWarranty)}</strong>
                              </button>
                              <button
                                type="button"
                                className="recordsScopeSplitItem"
                                title="Show Trade records only"
                                onClick={() => openRecordsWithFilter({ region: selectedRegion, tradeOnly: true })}
                              >
                                <span>Trade</span>
                                <strong>{formatNumber(recordsScopeTrade)}</strong>
                              </button>
                            </div>
                          </div>

                          {/* Col 4: Segment Breakdown */}
                          {recordsScopeSegmentMix ? (
                            <div className="recordsScopeColChips">
                              <span className="recordsScopeColHeader">Segment Breakdown</span>
                              <div className="recordsScopeChips" style={{ marginTop: 0 }}>
                                {recordsScopeSegmentMix.map((item) => (
                                  <button
                                    key={item.key}
                                    type="button"
                                    className="recordsScopeChip"
                                    title={`Show ${item.label} records only`}
                                    onClick={item.onSelect}
                                  >
                                    <strong>{formatNumber(item.count)}</strong> {item.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {/* Col 5: Manual Action */}
                          <div className="recordsScopeColManual">
                            <span className="recordsScopeColHeader">Manual Action</span>
                            <div className="recordsScopeManualInfo">
                              <span>Pending</span>
                              <strong className={recordsScopeManualPending > 0 ? "pending" : ""}>
                                {formatNumber(recordsScopeManualPending)}
                              </strong>
                            </div>
                          </div>
                        </div>
                      </div>
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
                          {(session?.user?.role === "SUPER_ADMIN" || (selectedRegion && selectedRegion !== "ALL" && regionKpiMetrics)) && (
                            <button
                              type="button"
                              className="downloadBtn excelBtn"
                              style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", borderColor: "#f97316", color: "#ffffff" }}
                              onClick={() => setWorkspaceView("productivity")}
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
                          <div className="columnsMenu" ref={columnsMenuRef}>
                            <button
                              type="button"
                              className={`secondaryButton columnsMenuTrigger ${hiddenColumns.size > 0 ? "active" : ""}`}
                              aria-haspopup="menu"
                              aria-expanded={isColumnsMenuOpen}
                              onClick={() => setIsColumnsMenuOpen((open) => !open)}
                              title="Show or hide table columns"
                            >
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" />
                                <path d="M6 2.5v11M10 2.5v11" stroke="currentColor" />
                              </svg>
                              Columns
                              {hiddenColumns.size > 0 ? (
                                <span className="columnsMenuCount">{hiddenColumns.size}</span>
                              ) : null}
                            </button>
                            {isColumnsMenuOpen ? (
                              <div className="columnsMenuPopover" role="menu">
                                <div className="columnsMenuHeader">
                                  <span>Show columns</span>
                                  <button
                                    type="button"
                                    className="columnsMenuReset"
                                    disabled={hiddenColumns.size === 0}
                                    onClick={() => setHiddenColumns(new Set())}
                                  >
                                    Show all
                                  </button>
                                </div>
                                <div className="columnsMenuList">
                                  {DAILY_CALL_PLAN_COLUMNS.map((column) => {
                                    const locked = ALWAYS_VISIBLE_COLUMNS.has(column);
                                    const isVisible = !hiddenColumns.has(column);
                                    return (
                                      <label
                                        key={column}
                                        className={`columnsMenuItem ${locked ? "locked" : ""}`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isVisible}
                                          disabled={locked}
                                          onChange={() => {
                                            if (locked) {
                                              return;
                                            }
                                            setHiddenColumns((current) => {
                                              const next = new Set(current);
                                              if (next.has(column)) {
                                                next.delete(column);
                                              } else {
                                                next.add(column);
                                              }
                                              return next;
                                            });
                                          }}
                                        />
                                        <span className="columnsMenuLabel">{column}</span>
                                        {locked ? (
                                          <span className="columnsMenuLock" title="Always visible">
                                            Locked
                                          </span>
                                        ) : null}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            className="secondaryButton fullRecordButton"
                            onClick={() => setIsRecordsTableMaximized(true)}
                            title="Expand the records table to full screen"
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                              <path d="M2 6V2.5h3.5M14 6V2.5h-3.5M2 10v3.5h3.5M14 10v3.5h-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                            Full Record
                          </button>
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

                      {renderDetailedRecordsTable(filteredRows)}
                    </div>
                  )}
                </section>
              ) : null}

              {upload && showUploadBatches && workspaceView === "overview" ? (
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

              {preview && showMatchPreviewSection && workspaceView === "overview" ? (
                <MatchPreviewSection
                  preview={preview}
                  isBusy={isBusy}
                  canUseBatches={canUseBatches}
                  handleGenerate={handleGenerate}
                  selectedPreviewCategory={selectedPreviewCategory}
                  setSelectedPreviewCategory={setSelectedPreviewCategory}
                  selectedRecords={selectedRecords}
                />
              ) : null}

              {workspaceView === "overview" && (
                <DashboardToggles
                  showDayOverDayComparison={showDayOverDayComparison}
                  setShowDayOverDayComparison={setShowDayOverDayComparison}
                  showMatchPreviewSection={showMatchPreviewSection}
                  setShowMatchPreviewSection={setShowMatchPreviewSection}
                  showManualCarryForward={showManualCarryForward}
                  setShowManualCarryForward={setShowManualCarryForward}
                  showCaseTypeOverview={showCaseTypeOverview}
                  setShowCaseTypeOverview={setShowCaseTypeOverview}
                  showCustomerSegmentSplit={showCustomerSegmentSplit}
                  setShowCustomerSegmentSplit={setShowCustomerSegmentSplit}
                  showClosedCallLedger={showClosedCallLedger}
                  setShowClosedCallLedger={setShowClosedCallLedger}
                  showUploadBatches={showUploadBatches}
                  setShowUploadBatches={setShowUploadBatches}
                />
              )}
            </section>
          </section>
        </div>
      </main>

      {/* 3. Super Admin Engineer Productivity Dashboard Page */}
      {/* Replaced with direct panel rendering under workspaceView === "productivity" */}

      {isRtplTimeModalOpen && selectedRtplTimeCard && (
        <RTPLTimeModal
          selectedRtplTimeCard={selectedRtplTimeCard}
          selectedRtplModalStatus={selectedRtplModalStatus}
          selectedRtplModalDetails={selectedRtplModalDetails}
          visibleRtplTimeDetails={visibleRtplTimeDetails}
          hiddenRtplTimeDetailCount={hiddenRtplTimeDetailCount}
          setIsRtplTimeModalOpen={setIsRtplTimeModalOpen}
        />
      )}

      {isEditModalOpen && editingSerialNo !== null && (
        <EditRecordModal
          editingSerialNo={editingSerialNo}
          savingSerialNo={savingSerialNo}
          draftOutput={draftOutput}
          setDraftOutput={setDraftOutput}
          engineersList={engineersList}
          rtplStatusGroups={rtplStatusGroups}
          cancelEditing={cancelEditing}
          saveEditing={saveEditing}
        />
      )}

      {caseDetailRow && session && (
        <CaseDetailDrawer
          row={caseDetailRow}
          token={session.token}
          localStatusChanges={rtplStatusChanges}
          onClose={() => setCaseDetailRow(null)}
        />
      )}

      {/* Full details for stale Flex Status tickets — opened from "View all". */}
      {isStaleModalOpen && staleFlexRows.length > 0 && (
        <div className="modalOverlay" onClick={() => setIsStaleModalOpen(false)}>
          <div
            className="modalCard staleFlexModal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modalHeader">
              <div className="modalTitleGroup">
                <span className="modalEyebrow">Status Aging</span>
                <h2 className="modalTitle">
                  {formatNumber(staleFlexRows.length)} record(s) with Status Aging{" "}
                  <span className="highlightText">
                    {STALE_FLEX_THRESHOLD_DAYS}+ days
                  </span>
                </h2>
              </div>
              <button
                type="button"
                className="modalCloseBtn"
                onClick={() => setIsStaleModalOpen(false)}
                title="Close"
              >
                &times;
              </button>
            </div>

            <div className="staleFlexModalBody">
              <div className="staleFlexModalPanel">
                <table className="staleFlexTable">
                  <thead>
                    <tr>
                      <th>Ticket ID</th>
                      <th>Flex Status</th>
                      <th className="staleFlexDaysCol">Days</th>
                      <th>Location</th>
                      <th>Engineer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staleFlexRows.map((row) => {
                      const ticketId = String(row.output["Ticket ID"] ?? "");
                      const days = row.enriched?.current_status_aging ?? 0;
                      const engineer = String(row.output["Engineer"] ?? "").trim();
                      return (
                        <tr
                          key={row.serialNo}
                          className={`staleFlexRow ${staleSeverityClass(days)}`}
                          role="button"
                          tabIndex={0}
                          title={`Filter records to ticket ${ticketId || "—"}`}
                          onClick={() => jumpToStaleTicket(ticketId)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              jumpToStaleTicket(ticketId);
                            }
                          }}
                        >
                          <td className="staleFlexTicket">{ticketId || "—"}</td>
                          <td>{String(row.output["Flex Status"] ?? "—")}</td>
                          <td className="staleFlexDaysCol">
                            <span className="staleFlexDaysBadge">{days}</span>
                          </td>
                          <td>{String(row.output["Location"] ?? "—")}</td>
                          <td>{engineer || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="modalActions">
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() => setIsStaleModalOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
