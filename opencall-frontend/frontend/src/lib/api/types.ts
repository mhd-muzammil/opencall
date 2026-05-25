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

export interface EditedReportRowResponse {
  id: string;
  reportId: string;
  regionId: string | null;
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
  hpOwnerStatus: string | null;
  manualFieldsCompleted: boolean;
  manualFieldsMissing: string[];
  updatedAt: string;
  updatedBy: string | null;
  rowEditable: boolean;
  carryForwardSource: "PREVIOUS_FINAL_REPORT";
  carriedForwardFields?: string[];
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
