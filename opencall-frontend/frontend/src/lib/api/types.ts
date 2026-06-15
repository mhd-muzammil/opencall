export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    username: string | null;
    role: "SUPER_ADMIN" | "REGION_ADMIN";
    regionId: string | null;
    region_id: string | null;
    mustChangePassword: boolean;
  };
}

export interface UploadBatch {
  id: string;
  sourceType: "FLEX_WIP" | "RENDERWAYS" | "CALL_PLAN";
  originalFileName: string;
  status: "UPLOADED" | "VALIDATED" | "FAILED" | "PROCESSED";
  rowCount: number;
  errorCount: number;
  createdAt: string;
}

export interface UploadResponse {
  batches: UploadBatch[];
  validations: Array<{
    sourceType: string;
    originalFileName: string;
    rowNumber: number | null;
    isValid: boolean;
    detectedHeaders: string[];
    missingColumns: string[];
  }>;
  parseSummaries: Array<{
    sourceType: string;
    rowCount: number;
    issueCount: number;
    issues?: Array<{
      rowNumber: number;
      field: string;
      message: string;
      originalFileName: string;
    }>;
    duplicateNormalizedTicketIds: string[];
    duplicateNormalizedCaseIds: string[];
    duplicateCount: number;
  }>;
}

export interface MatchPreviewResponse {
  totalRenderwaysRows: number;
  totalFlexRows?: number;
  flexMatchedRows: number;
  callPlanMatchedRows: number;
  unmatchedFlexRows: number;
  unmatchedCallPlanRows: number;
  duplicateTracking: {
    flexWip: number;
    renderways: number;
    callPlan: number;
    total: number;
  };
  matchStatusCounts: Record<string, number>;
  enrichedRows: Array<Record<string, string | number | null>>;
}

export interface GeneratedReportResponse {
  reportId: string;
  sessionId: string;
  reportDate: string;
  columns: readonly string[];
  totalRows: number;
  duplicateTicketCount: number;
  unmatchedTicketCount: number;
  duplicateTracking: {
    flexWip: number;
    renderways: number;
    callPlan: number;
    total: number;
  };
  carryForward: {
    totalFieldsCarried: number;
    rowsAutoCompleted: number;
    rowsStillManual: number;
  };
  comparison: {
    skipped: boolean;
    reason: "NO_PREVIOUS_REPORT" | null;
    currentSessionId: string;
    previousSessionId: string | null;
    summary: {
      total_tickets: number;
      new_count: number;
      closed_count: number;
      updated_count: number;
      carried_count: number;
    } | null;
    duplicateTicketIds: {
      current: string[];
      previous: string[];
    };
  };
  regionBreakdown: Array<{
    aspCode: string;
    regionName: string;
    count: number;
    closedCount: number;
    woOtcCodeBreakdown: Array<{
      code: string;
      count: number;
    }>;
  }>;
  rows: Array<{
    id: string | null;
    serialNo: number;
    output: Record<string, string | number>;
    // Server-side enriched source fields included in the API payload. Used for
    // values that are intentionally not part of the exported output columns
    // (e.g. Customer Type, which drives the Consumer/Commercial split).
    enriched?: {
      customer_type?: string | null;
      // Renderways "current status aging" in days — drives the stale-status banner.
      current_status_aging?: number | null;
    } | null;
    comparison: {
      changeType: "NEW" | "CLOSED" | "CARRIED" | "UPDATED" | null;
      previousFlexStatus: string | null;
      previousRtplStatus: string | null;
      previousWipAging: string | null;
      changedFields: Record<
        string,
        {
          from: string | null;
          to: string | null;
        }
      >;
      changeSummary: string | null;
      /**
       * Consecutive days this ticket's Flex Status has stayed the same
       * (1 = first day at this status). Populated by the backend day-over-day
       * pass; null when unavailable (e.g. no previous report yet). Drives the
       * stale-Flex-Status banner at the top of the records page.
       */
      flexStatusUnchangedDays: number | null;
    } | null;
    carryForward: {
      carriedForwardFields: string[];
      manualFieldsCompleted: boolean;
      manualFieldsMissing: string[];
      changeType: "NEW" | "CLOSED" | "CARRIED" | "UPDATED" | "NEW_WORK_ORDER" | null;
      previousTicketMatched: boolean;
      closedSyntheticRow: boolean;
    };
    updatedAt: string | null;
    updatedBy: string | null;
    rowEditable: boolean;
    carryForwardSource: "PREVIOUS_FINAL_REPORT";
  }>;
}

export type ReportRow = GeneratedReportResponse["rows"][number];

export interface RtplStatusChange {
  id?: string;
  rowId: string;
  reportId: string;
  serialNo: number;
  ticketId: string;
  caseId: string | null;
  workLocation: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  changedAt: string;
  changedBy: string | null;
}

export interface EditedReportRowResponse {
  id: string;
  reportId: string;
  serialNo: number;
  ticketId: string;
  caseId: string | null;
  regionId: string | null;
  workLocation: string | null;
  engineer: string | null;
  rtplStatus: string | null;
  customerMail: string | null;
  rca: string | null;
  remarks: string | null;
  manualNotes: string | null;
  location: string | null;
  segment: string | null;
  caseCreatedTime: string | null;
  wipAging: string | null;
  statusAging: string | null;
  hpOwnerStatus: string | null;
  manualFieldsCompleted: boolean;
  manualFieldsMissing: string[];
  updatedAt: string;
  updatedBy: string | null;
  rowEditable: boolean;
  carryForwardSource: "PREVIOUS_FINAL_REPORT";
  carriedForwardFields?: string[];
  rtplStatusChange?: RtplStatusChange | null;
}

export interface RuntimeHealthResponse {
  status: string;
  ok: boolean;
  missingTables: string[];
  missingColumns: Array<{
    tableName: string;
    columnName: string;
  }>;
}

export interface DatabaseHealthResponse {
  status: string;
  connected: boolean;
  databaseName: string | null;
  latencyMs: number;
  error: string | null;
}

export interface ReportHistorySession {
  id: string;
  title: string;
  status: "DRAFT" | "COMPLETED";
  regionId: string | null;
  flexUploadBatchId: string | null;
  renderwaysUploadBatchId: string | null;
  callPlanUploadBatchId: string | null;
  reportId: string | null;
  reportDate: string | null;
  totalRows: number;
  createdAt: string;
  updatedAt: string;
}

export interface Engineer {
  id: string;
  engineerCode: string | null;
  engineerName: string;
  regionId: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DropdownEngineer {
  id: string;
  engineerCode: string | null;
  engineerName: string;
}

export interface ListEngineersResult {
  rows: Engineer[];
  total: number;
}

