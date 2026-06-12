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
  RTPL_CASE_SCOPE_OPTIONS,
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
  RegionStats,
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
} from "../features/dashboard/utils";
import {
  OverviewStat,
  ChangeTypeBadge,
  CarryForwardBadge,
  CarryForwardSummaryPanel,
  ComparisonSummaryPanel,
  DashboardToggles,
  ClosedCallLedger,
  MatchPreviewSection,
  RTPLTimeModal,
  ProductivityModal,
  KPISummaryModal,
  ChennaiKPIModal,
  RTPLAnalytics,
  CaseTypeCards,
  CustomerSegmentCards,
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
import { downloadReportAsXlsx, downloadReportAsExcel } from "../lib/excelExport";
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
  const [isKpiModalOpen, setIsKpiModalOpen] = useState(false);
  const [isChennaiKpiModalOpen, setIsChennaiKpiModalOpen] = useState(false);
  const [isProductivityModalOpen, setIsProductivityModalOpen] = useState(false);
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
  const [workspaceView, setWorkspaceView] = useState<"overview" | "records">("overview");
  const [isRecordsSummaryHidden, setIsRecordsSummaryHidden] = useState(false);
  const [showDayOverDayComparison, setShowDayOverDayComparison] = useState(false);
  const [showMatchPreviewSection, setShowMatchPreviewSection] = useState(false);
  const [showManualCarryForward, setShowManualCarryForward] = useState(false);
  const [showCaseTypeOverview, setShowCaseTypeOverview] = useState(false);
  const [showCustomerSegmentSplit, setShowCustomerSegmentSplit] = useState(false);
  const [showClosedCallLedger, setShowClosedCallLedger] = useState(false);

  useEffect(() => {
    setIsRecordsSummaryHidden(false);
    if (recordsTableWrapRef.current) {
      recordsTableWrapRef.current.scrollTop = 0;
    }
  }, [workspaceView, report?.reportId]);

  useEffect(() => {
    setSelectedRegion(null);
    setSelectedWoOtcCode(null);
    setSelectedRtplRegion(ALL_REGIONS_FILTER);
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
    setIsKpiModalOpen(false);
    setIsChennaiKpiModalOpen(false);
    setIsProductivityModalOpen(false);
    setProductivityFilterType("Today");
    setSelectedProductivityValue("");
    setTnFilterType("Today");
    setSelectedTnValue("");
    setEodBodFilterType("Today");
    setSelectedEodBodValue("");
    setTnViewMode("EOD");
    setEodBodViewMode("EOD");
  }, [report?.reportId]);

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
      ? "All Locations"
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
    scopedClosedRows,
    scopedManualCellCount,
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
    } else {
      setHistorySessions([]);
      setEngineersList([]);
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
    flexStatus,
    segment,
    segments,
    workLocations,
    wipAging,
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
  }: Readonly<{
    region?: string | null;
    woOtcCode?: string | null;
    rtplStatus?: string | null;
    flexStatus?: string | null;
    segment?: string | null;
    segments?: readonly string[] | null;
    workLocations?: readonly string[] | null;
    wipAging?: string | null;
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
    if (rtplStatus) {
      colFilters.setColumnFilter("RTPL status", new Set([rtplStatus]));
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
      const currentValues = current ?? PIVOT_LOCATION_OPTIONS.map((option) => option.value);

      return currentValues.includes(location)
        ? currentValues.filter((value) => value !== location)
        : [...currentValues, location];
    });
  }

  function applyPivotLocationFilter(): void {
    const allLocations = PIVOT_LOCATION_OPTIONS.map((option) => option.value);
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
    openRecordsWithFilter({
      segments: selectedPivotSegments,
      workLocations: selectedPivotLocations,
      rtplStatus: rtplStatus ?? null,
      wipAging: wipAging ?? null,
      warrantyOnly: selectedPivotCaseScope === "warranty",
      tradeOnly: selectedPivotCaseScope === "trade",
    });
  }

  function renderRegionCard(
    aspCode: string,
    regionName: string,
    subtitle: string,
    stats: RegionStats,
    isActive: boolean,
  ) {
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
    showPcOnly ? "PC cases" : null,
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
        onRefreshHealth={() => void handleRefreshWorkspace()}
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
                  {session?.user?.role !== "REGION_ADMIN" && renderRegionCard(
                    "ALL",
                    "All Regions",
                    "Overall",
                    overallStats,
                    selectedRegion === "ALL" && !selectedWoOtcCode && !showConsumerOnly && !showCommercialOnly && !showWarrantyOnly && !showNonWarrantyOnly,
                  )}

                  {activeRegionBreakdown.filter((entry) => entry.count > 0).map((entry) =>
                    renderRegionCard(
                      entry.aspCode,
                      entry.regionName,
                      entry.aspCode,
                      entry,
                      selectedRegion === entry.aspCode && !selectedWoOtcCode && !showConsumerOnly && !showCommercialOnly && !showWarrantyOnly && !showNonWarrantyOnly,
                    ),
                  )}
                </div>
              </div>
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



              <RTPLAnalytics
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
                flexStatusMetrics={flexStatusMetrics}
                openRtplCheckpointModal={openRtplCheckpointModal}
                openRecordsWithFilter={openRecordsWithFilter}
              />

              <div className="pivotSection">
                <div className="sectionHeader pivotHeader">
                  <div>
                    <h3>RTPL Status by WIP Aging Pivot</h3>
                    <p>
                      Segment filter, WIP Aging columns, RTPL status rows, and Ticket ID count values.
                    </p>
                  </div>
                  <span className="statusBadge neutral">
                    {formatNumber(rtplWipPivot.grandTotal)} tickets
                  </span>
                </div>

                <div className="pivotFilterRow">
                <div className="pivotDropdownFilter" aria-label="Pivot segment filter">
                  <span>Segment</span>
                  <div className="pivotDropdownWrap">
                    <button
                      type="button"
                      className={`pivotDropdownTrigger ${pivotSegmentFilterActive ? "active" : ""}`}
                      onClick={() => {
                        if (isPivotSegmentFilterOpen) {
                          setIsPivotSegmentFilterOpen(false);
                        } else {
                          openPivotSegmentFilter();
                        }
                      }}
                    >
                      <span>{appliedPivotSegmentLabel}</span>
                      <strong>{formatNumber(rtplWipPivot.grandTotal)}</strong>
                      <small>▾</small>
                    </button>

                    {isPivotSegmentFilterOpen ? (
                      <div className="pivotSegmentDropdown">
                        <div className="pivotSegmentList">
                          <label className="pivotSegmentDropdownItem pivotSegmentDropdownItemAll">
                            <input
                              type="checkbox"
                              checked={draftPivotSegments === null}
                              onChange={() => setDraftPivotSegments(null)}
                            />
                            <span>(Select All)</span>
                            <strong>{formatNumber(pivotAllSegmentCount)}</strong>
                          </label>

                          {rtplWipPivot.segmentOptions.map((option) => (
                            <label className="pivotSegmentDropdownItem" key={option.value}>
                              <input
                                type="checkbox"
                                checked={draftPivotSegments === null || draftPivotSegmentSet.has(option.value)}
                                onChange={() => toggleDraftPivotSegment(option.value)}
                              />
                              <span>{option.label}</span>
                              <strong>{formatNumber(option.count)}</strong>
                            </label>
                          ))}
                        </div>

                        <div className="pivotSegmentActions">
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => setDraftPivotSegments(null)}
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => setDraftPivotSegments([])}
                          >
                            Unselect All
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => setDraftPivotSegments(null)}
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            className="primary"
                            onClick={applyPivotSegmentFilter}
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                  <div className="pivotCaseScopeFilter" aria-label="Pivot warranty trade filter">
                    <span>Case Type</span>
                    <div className="pivotCaseScopeGroup">
                      {RTPL_CASE_SCOPE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`pivotCaseScopeButton ${selectedPivotCaseScope === option.value ? "active" : ""}`}
                          onClick={() => setSelectedPivotCaseScope(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pivotDropdownFilter" aria-label="Pivot location filter">
                    <span>Location</span>
                    <div className="pivotDropdownWrap pivotLocationWrap">
                      <button
                        type="button"
                        className={`pivotDropdownTrigger ${pivotLocationFilterActive ? "active" : ""}`}
                        onClick={() => {
                          if (isPivotLocationFilterOpen) {
                            setIsPivotLocationFilterOpen(false);
                          } else {
                            openPivotLocationFilter();
                          }
                        }}
                      >
                        <span>{appliedPivotLocationLabel}</span>
                        <strong>{formatNumber(rtplWipPivot.grandTotal)}</strong>
                        <small>▾</small>
                      </button>

                      {isPivotLocationFilterOpen ? (
                        <div className="pivotSegmentDropdown pivotLocationDropdown">
                          <div className="pivotSegmentList pivotLocationList">
                            <label className="pivotSegmentDropdownItem pivotSegmentDropdownItemAll pivotLocationDropdownItem">
                              <input
                                type="checkbox"
                                checked={draftPivotLocations === null}
                                onChange={() => setDraftPivotLocations(null)}
                              />
                              <span>All locations</span>
                              <strong>{formatNumber(pivotAllLocationCount)}</strong>
                            </label>

                            {pivotLocationOptions.map((option) => (
                              <label className="pivotSegmentDropdownItem pivotLocationDropdownItem" key={option.value}>
                                <input
                                  type="checkbox"
                                  checked={draftPivotLocations === null || draftPivotLocationSet.has(option.value)}
                                  onChange={() => toggleDraftPivotLocation(option.value)}
                                />
                                <span>{option.label}</span>
                                <strong>{formatNumber(option.count)}</strong>
                              </label>
                            ))}
                          </div>

                          <div className="pivotSegmentActions pivotLocationActions">
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => setDraftPivotLocations(null)}
                            >
                              All
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => setDraftPivotLocations([])}
                            >
                              None
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => setDraftPivotLocations(null)}
                            >
                              Clear
                            </button>
                            <button
                              type="button"
                              className="primary"
                              onClick={applyPivotLocationFilter}
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {rtplWipPivot.rows.length > 0 && rtplWipPivot.columns.length > 0 ? (
                  <div className="pivotTableWrap">
                    <table className="pivotTable">
                      <thead>
                        <tr className="pivotContextRow">
                          <th scope="col">Filters</th>
                          <th scope="col" colSpan={rtplWipPivot.columns.length + 1}>
                            Segment:{" "}
                            {selectedPivotSegments === null
                              ? "All Segments"
                              : selectedPivotSegments.length > 0
                                ? selectedPivotSegments.join(", ")
                                : "No Segments"}
                            {" | "}
                            Case Type:{" "}
                            {RTPL_CASE_SCOPE_OPTIONS.find((option) => option.value === selectedPivotCaseScope)?.label ?? "Overall"}
                            {" | "}
                            Location:{" "}
                            {selectedPivotLocations === null
                              ? "All Locations"
                              : selectedPivotLocations.length > 0
                                ? selectedPivotLocations
                                    .map((location) => PIVOT_LOCATION_OPTIONS.find((option) => option.value === location)?.label ?? location)
                                    .join(", ")
                                : "No Locations"}
                          </th>
                        </tr>
                        <tr>
                          <th scope="col" className="pivotRowHeader">
                            Count of Ticket ID
                          </th>
                          {rtplWipPivot.columns.map((column) => (
                            <th key={column.key} scope="col">
                              <button
                                type="button"
                                className="pivotHeaderButton"
                                onClick={() => openPivotRecords({ wipAging: column.label })}
                                title={`Open WIP aging ${column.label} records`}
                              >
                                {column.label}
                              </button>
                            </th>
                          ))}
                          <th scope="col" className="pivotGrandColumn">
                            Grand Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rtplWipPivot.rows.map((pivotRow) => (
                          <tr key={pivotRow.key}>
                            <th scope="row" className="pivotRowLabel">
                              <button
                                type="button"
                                onClick={() => openPivotRecords({ rtplStatus: pivotRow.status })}
                                title={`Open ${pivotRow.status} records`}
                              >
                                {pivotRow.status}
                              </button>
                            </th>
                            {rtplWipPivot.columns.map((column) => {
                              const count = pivotRow.cells[column.key] ?? 0;

                              return (
                                <td key={`${pivotRow.key}-${column.key}`}>
                                  {count > 0 ? (
                                    <button
                                      type="button"
                                      className="pivotValueButton"
                                      onClick={() =>
                                        openPivotRecords({
                                          rtplStatus: pivotRow.status,
                                          wipAging: column.label,
                                        })
                                      }
                                      title={`Open ${pivotRow.status}, WIP aging ${column.label}`}
                                    >
                                      {formatNumber(count)}
                                    </button>
                                  ) : (
                                    <span className="pivotEmptyCell">-</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="pivotGrandColumn">
                              <button
                                type="button"
                                className="pivotTotalButton"
                                onClick={() => openPivotRecords({ rtplStatus: pivotRow.status })}
                              >
                                {formatNumber(pivotRow.total)}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th scope="row">Grand Total</th>
                          {rtplWipPivot.columns.map((column) => (
                            <td key={`total-${column.key}`}>
                              <button
                                type="button"
                                className="pivotTotalButton"
                                onClick={() => openPivotRecords({ wipAging: column.label })}
                              >
                                {formatNumber(column.total)}
                              </button>
                            </td>
                          ))}
                          <td className="pivotGrandColumn">
                            <button
                              type="button"
                              className="pivotTotalButton"
                              onClick={() => openPivotRecords({})}
                            >
                              {formatNumber(rtplWipPivot.grandTotal)}
                            </button>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="rtplEmptyState">
                    No pivot data for the selected Segment filter.
                  </div>
                )}
              </div>

              {showDayOverDayComparison && (
                <ComparisonSummaryPanel report={report} />
              )}
              {showManualCarryForward && (
                <CarryForwardSummaryPanel report={report} />
              )}

              {showClosedCallLedger && overallClosedCount > 0 ? (
                <ClosedCallLedger
                  overallClosedCount={overallClosedCount}
                  closedRegionBreakdown={closedRegionBreakdown}
                  showClosedOnly={showClosedOnly}
                  selectedRegion={selectedRegion}
                  openRecordsWithFilter={openRecordsWithFilter}
                />
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
                  const scrollTop = event.currentTarget.scrollTop;
                  setIsRecordsSummaryHidden(scrollTop > 10);
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
            />
          )}
        </section>
      </section>

      {/* 1. Salem Region KPI Summary Popup Modal */}
      {isKpiModalOpen && selectedRegion && selectedRegion !== "ALL" && regionKpiMetrics && (
        <KPISummaryModal
          activeRegionName={activeRegionName}
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
          setIsKpiModalOpen={setIsKpiModalOpen}
        />
      )}

      {/* 2. Chennai Region Dashboard Summary Popup Modal */}
      {isChennaiKpiModalOpen && selectedRegion && selectedRegion !== "ALL" && chennaiKpiMetrics && (
        <ChennaiKPIModal
          activeRegionName={activeRegionName}
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
          setIsChennaiKpiModalOpen={setIsChennaiKpiModalOpen}
        />
      )}
      {/* 3. Super Admin Engineer Productivity Dashboard Popup Modal */}
      {isProductivityModalOpen && (
        <ProductivityModal
          selectedRegion={selectedRegion}
          activeRegionName={activeRegionName}
          productivityFilterType={productivityFilterType}
          setProductivityFilterType={setProductivityFilterType}
          selectedProductivityValue={selectedProductivityValue}
          setSelectedProductivityValue={setSelectedProductivityValue}
          engineerProductivityMetrics={engineerProductivityMetrics}
          productivityDateLabel={productivityDateLabel}
          setIsProductivityModalOpen={setIsProductivityModalOpen}
        />
      )}

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
                          setDraftOutput((current) => ({
                            ...current,
                            "RTPL status": selected,
                          }));
                        }}
                      />
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
                    <select
                      id="modal-segment"
                      className="modalSelect"
                      value={String(draftOutput["Segment"] ?? "")}
                      onChange={(event) =>
                        setDraftOutput((current) => ({
                          ...current,
                          "Segment": event.target.value,
                        }))
                      }
                    >
                      <option value="">Entry</option>
                      <option value="Print">Print</option>
                      <option value="PC">PC</option>
                      <option value="Install">Install</option>
                      <option value="Trade">Trade</option>
                      {draftOutput["Segment"] && 
                       draftOutput["Segment"] !== MANUAL_ENTRY_REQUIRED && 
                       !["Print", "PC", "Install", "Trade"].includes(String(draftOutput["Segment"])) && (
                        <option value={String(draftOutput["Segment"])}>{String(draftOutput["Segment"])}</option>
                      )}
                    </select>
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
