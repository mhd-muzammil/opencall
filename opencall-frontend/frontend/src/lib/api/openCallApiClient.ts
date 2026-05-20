import { readJson } from "./http";
import type {
  DatabaseHealthResponse,
  EditedReportRowResponse,
  GeneratedReportResponse,
  LoginResponse,
  MatchPreviewResponse,
  ReportHistorySession,
  RuntimeHealthResponse,
  UploadResponse,
} from "./types";

export type FetchLike = typeof fetch;

export type UploadFileInput =
  | Blob
  | {
      uri: string;
      name: string;
      type?: string;
    };

export interface OpenCallApiClientOptions {
  baseUrl: string;
  fetchImpl?: FetchLike;
}

export interface OpenCallApiClient {
  login(username: string, password: string): Promise<LoginResponse>;
  getDatabaseHealth(): Promise<DatabaseHealthResponse>;
  getRuntimeHealth(): Promise<RuntimeHealthResponse>;
  uploadReports(input: {
    token: string;
    regionId: string;
    flexWipReport: UploadFileInput;
    renderwaysReport?: UploadFileInput;
    callPlan?: UploadFileInput[];
  }): Promise<UploadResponse>;
  previewMatches(input: {
    token: string;
    regionId: string;
    flexUploadBatchId: string;
    renderwaysUploadBatchId?: string;
    callPlanUploadBatchId?: string;
  }): Promise<MatchPreviewResponse>;
  generateReport(input: {
    token: string;
    regionId: string;
    reportDate: string;
    flexUploadBatchId: string;
    renderwaysUploadBatchId?: string;
    callPlanUploadBatchId?: string;
  }): Promise<GeneratedReportResponse>;
  updateReportRow(input: {
    token: string;
    rowId: string;
    values: {
      engineer?: string | null;
      rtpl_status?: string | null;
      customer_mail?: string | null;
      rca?: string | null;
      remarks?: string | null;
      manual_notes?: string | null;
      location?: string | null;
      segment?: string | null;
      case_created_time?: string | null;
      wip_aging?: string | null;
      hp_owner_status?: string | null;
    };
  }): Promise<EditedReportRowResponse>;
  getReportHistory(token: string): Promise<ReportHistorySession[]>;
  getReportHistoryById(token: string, id: string): Promise<ReportHistorySession>;
  renameReportHistory(token: string, id: string, title: string): Promise<{ id: string; title: string }>;
  duplicateReportHistory(token: string, id: string): Promise<{ id: string; title: string }>;
  deleteReportHistory(token: string, id: string): Promise<{ success: boolean }>;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
  };
}

function jsonAuthHeaders(token: string): Record<string, string> {
  return {
    ...authHeaders(token),
    "Content-Type": "application/json",
  };
}

function appendUploadFile(formData: FormData, fieldName: string, file: UploadFileInput): void {
  formData.append(fieldName, file as Blob);
}

export function createOpenCallApiClient({
  baseUrl,
  fetchImpl = fetch,
}: OpenCallApiClientOptions): OpenCallApiClient {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const url = (path: string) => `${normalizedBaseUrl}${path}`;

  return {
    async login(username, password) {
      const response = await fetchImpl(url("/api/v1/auth/login"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      return readJson<LoginResponse>(response);
    },

    async getDatabaseHealth() {
      const response = await fetchImpl(url("/api/v1/health/db"), {
        cache: "no-store",
      });

      return readJson<DatabaseHealthResponse>(response);
    },

    async getRuntimeHealth() {
      const response = await fetchImpl(url("/api/v1/health/runtime"), {
        cache: "no-store",
      });

      return readJson<RuntimeHealthResponse>(response);
    },

    async uploadReports(input) {
      const formData = new FormData();
      appendUploadFile(formData, "flexWipReport", input.flexWipReport);

      if (input.renderwaysReport) {
        appendUploadFile(formData, "renderwaysReport", input.renderwaysReport);
      }

      for (const file of input.callPlan ?? []) {
        appendUploadFile(formData, "callPlan", file);
      }

      if (input.regionId.trim()) {
        formData.append("regionId", input.regionId.trim());
      }

      const response = await fetchImpl(url("/api/v1/uploads"), {
        method: "POST",
        headers: authHeaders(input.token),
        body: formData,
      });

      return readJson<UploadResponse>(response);
    },

    async previewMatches(input) {
      const headers = jsonAuthHeaders(input.token);

      if (input.regionId.trim()) {
        headers["x-region-id"] = input.regionId.trim();
      }

      const response = await fetchImpl(url("/api/v1/matches/preview"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          flexUploadBatchId: input.flexUploadBatchId,
          renderwaysUploadBatchId: input.renderwaysUploadBatchId || null,
          callPlanUploadBatchId: input.callPlanUploadBatchId || null,
        }),
      });

      return readJson<MatchPreviewResponse>(response);
    },

    async generateReport(input) {
      const headers = jsonAuthHeaders(input.token);

      if (input.regionId.trim()) {
        headers["x-region-id"] = input.regionId.trim();
      }

      const response = await fetchImpl(url("/api/v1/reports/daily-call-plan/generate"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          reportDate: input.reportDate,
          flexUploadBatchId: input.flexUploadBatchId,
          renderwaysUploadBatchId: input.renderwaysUploadBatchId || null,
          callPlanUploadBatchId: input.callPlanUploadBatchId || null,
        }),
      });

      return readJson<GeneratedReportResponse>(response);
    },

    async updateReportRow(input) {
      const response = await fetchImpl(url(`/api/v1/report-rows/${input.rowId}`), {
        method: "PATCH",
        headers: jsonAuthHeaders(input.token),
        body: JSON.stringify(input.values),
      });

      return readJson<EditedReportRowResponse>(response);
    },

    async getReportHistory(token) {
      const response = await fetchImpl(url("/api/v1/report-history"), {
        headers: authHeaders(token),
      });

      return readJson<ReportHistorySession[]>(response);
    },

    async getReportHistoryById(token, id) {
      const response = await fetchImpl(url(`/api/v1/report-history/${id}`), {
        headers: authHeaders(token),
      });

      return readJson<ReportHistorySession>(response);
    },

    async renameReportHistory(token, id, title) {
      const response = await fetchImpl(url(`/api/v1/report-history/${id}`), {
        method: "PATCH",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ title }),
      });

      return readJson<{ id: string; title: string }>(response);
    },

    async duplicateReportHistory(token, id) {
      const response = await fetchImpl(url(`/api/v1/report-history/${id}/duplicate`), {
        method: "POST",
        headers: authHeaders(token),
      });

      return readJson<{ id: string; title: string }>(response);
    },

    async deleteReportHistory(token, id) {
      const response = await fetchImpl(url(`/api/v1/report-history/${id}`), {
        method: "DELETE",
        headers: authHeaders(token),
      });

      return readJson<{ success: boolean }>(response);
    },
  };
}
