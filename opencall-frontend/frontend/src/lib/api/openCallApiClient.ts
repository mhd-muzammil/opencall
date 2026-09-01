import { readJson } from "./http";
import type {
  CloseRegionEodResponse,
  DatabaseHealthResponse,
  EditedReportRowResponse,
  GeneratedReportResponse,
  LoginResponse,
  MatchPreviewResponse,
  RegionEodStateResponse,
  ReportProductivityRangeResponse,
  ReopenRegionEodResponse,
  ReportHistorySession,
  RtplStatusChange,
  RuntimeHealthResponse,
  UploadResponse,
  Engineer,
  DropdownEngineer,
  ListEngineersResult,
  RtplStatus,
  DropdownRtplStatus,
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
    renderwaysReport?: UploadFileInput[];
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
      evening_rtpl_status?: string | null;
      customer_mail?: string | null;
      rca?: string | null;
      remarks?: string | null;
      manual_notes?: string | null;
      location?: string | null;
      segment?: string | null;
      case_created_time?: string | null;
      wip_aging?: string | null;
      status_aging?: string | null;
      hp_owner_status?: string | null;
    };
  }): Promise<EditedReportRowResponse>;
  getRtplStatusChanges(input: {
    token: string;
    reportId?: string;
    ticketId?: string;
    changeDate?: string;
    limit?: number;
  }): Promise<RtplStatusChange[]>;
  deleteReportRow(token: string, rowId: string): Promise<{ success: boolean }>;
  getReportHistory(token: string): Promise<ReportHistorySession[]>;
  getReportHistoryById(token: string, id: string): Promise<ReportHistorySession>;
  renameReportHistory(token: string, id: string, title: string): Promise<{ id: string; title: string }>;
  duplicateReportHistory(token: string, id: string): Promise<{ id: string; title: string }>;
  deleteReportHistory(token: string, id: string): Promise<{ success: boolean }>;
  getAdminEngineers(token: string, filters: { regionId?: string; search?: string; isActive?: boolean; limit?: number; offset?: number }): Promise<ListEngineersResult>;
  createAdminEngineer(token: string, input: { engineerName: string; engineerCode?: string | null; regionId: string; email?: string | null; phone?: string | null; hpId?: string; vendorId?: string }): Promise<{ engineer: Engineer }>;
  updateAdminEngineer(token: string, id: string, input: { engineerName?: string; engineerCode?: string | null; regionId?: string; email?: string | null; phone?: string | null; hpId?: string; vendorId?: string }): Promise<{ engineer: Engineer }>;
  deactivateAdminEngineer(token: string, id: string): Promise<{ engineer: Engineer }>;
  reactivateAdminEngineer(token: string, id: string): Promise<{ engineer: Engineer }>;
  deleteAdminEngineer(token: string, id: string): Promise<{ success: boolean }>;
  getEngineersDropdown(token: string, regionId?: string): Promise<{ engineers: DropdownEngineer[] }>;
  getAdminRtplStatuses(token: string, filters?: { category?: string; search?: string; isActive?: boolean }): Promise<{ statuses: RtplStatus[] }>;
  createAdminRtplStatus(token: string, input: { name: string; category?: string | null; sortOrder?: number }): Promise<{ status: RtplStatus }>;
  updateAdminRtplStatus(token: string, id: string, input: { name?: string; category?: string; sortOrder?: number }): Promise<{ status: RtplStatus; renamedRowValues?: number }>;
  deactivateAdminRtplStatus(token: string, id: string): Promise<{ status: RtplStatus }>;
  reactivateAdminRtplStatus(token: string, id: string): Promise<{ status: RtplStatus }>;
  deleteAdminRtplStatus(token: string, id: string): Promise<{ success: boolean }>;
  getRtplStatusesDropdown(token: string): Promise<{ statuses: DropdownRtplStatus[] }>;
  getRegionEodState(token: string, workingDate: string): Promise<RegionEodStateResponse>;
  /**
   * Per-region productivity summed across an inclusive day range. Productivity is
   * day-scoped, so a range has to be computed day by day server-side — there is no
   * single report a range can be read off.
   */
  getProductivityRange(
    token: string,
    from: string,
    to: string,
  ): Promise<ReportProductivityRangeResponse>;
  closeRegionEod(token: string, regionId: string, workingDate: string): Promise<CloseRegionEodResponse>;
  reopenRegionEod(token: string, regionId: string, workingDate: string): Promise<ReopenRegionEodResponse>;
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

/**
 * Generations currently in flight, keyed by region + request body.
 *
 * Deliberately module-level rather than per-client: the callers that duplicate a
 * generation are separate React effects, and collapsing them only works if they share
 * one map. Entries live only for the duration of the request — see `generateReport`.
 */
const inFlightGenerations = new Map<string, Promise<GeneratedReportResponse>>();

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

      for (const file of input.renderwaysReport ?? []) {
        appendUploadFile(formData, "renderwaysReport", file);
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
      const regionId = input.regionId.trim();

      if (regionId) {
        headers["x-region-id"] = regionId;
      }

      const body = JSON.stringify({
        reportDate: input.reportDate,
        flexUploadBatchId: input.flexUploadBatchId,
        renderwaysUploadBatchId: input.renderwaysUploadBatchId || null,
        callPlanUploadBatchId: input.callPlanUploadBatchId || null,
      });

      // One in-flight request per identical generation.
      //
      // A page load asks for the SAME report from three places at once: the history
      // restore, the Engineer Productivity day report and the RTPL day report. Each
      // has its own result cache, so none of them knows another is already asking,
      // and all three send identical requests.
      //
      // On the server every one of them takes `pg_advisory_xact_lock` on the same key
      // (report date + batch ids), so they do not run in parallel — they queue, and
      // the page waits for all three to run end to end. The stragglers then hit the
      // database statement timeout and answer 500, which is what put "Unexpected
      // server error" on screen even when the first request had succeeded.
      //
      // Keyed by exactly what is sent, so a genuinely different report (another date,
      // another batch, another region) is never folded into this one. The entry is
      // removed as soon as it settles, so this is a request-collapsing window and
      // never a cache: the next load re-asks the server.
      const key = `${regionId}|${body}`;
      const existing = inFlightGenerations.get(key);
      if (existing) {
        return existing;
      }

      const pending = (async () => {
        const response = await fetchImpl(
          url("/api/v1/reports/daily-call-plan/generate"),
          { method: "POST", headers, body },
        );
        return readJson<GeneratedReportResponse>(response);
      })();

      inFlightGenerations.set(key, pending);
      try {
        return await pending;
      } finally {
        inFlightGenerations.delete(key);
      }
    },

    async updateReportRow(input) {
      const response = await fetchImpl(url(`/api/v1/report-rows/${input.rowId}`), {
        method: "PATCH",
        headers: jsonAuthHeaders(input.token),
        body: JSON.stringify(input.values),
      });

      return readJson<EditedReportRowResponse>(response);
    },

    async getRtplStatusChanges(input) {
      const params = new URLSearchParams({
        limit: String(input.limit ?? 50),
      });
      if (input.reportId) {
        params.set("reportId", input.reportId);
      }
      if (input.ticketId) {
        params.set("ticketId", input.ticketId);
      }
      if (input.changeDate) {
        params.set("changeDate", input.changeDate);
      }
      const response = await fetchImpl(url(`/api/v1/report-rows/rtpl-status-changes?${params.toString()}`), {
        headers: authHeaders(input.token),
        cache: "no-store",
      });

      return readJson<RtplStatusChange[]>(response);
    },

    async deleteReportRow(token, rowId) {
      const response = await fetchImpl(url(`/api/v1/report-rows/${rowId}`), {
        method: "DELETE",
        headers: authHeaders(token),
      });

      return readJson<{ success: boolean }>(response);
    },

    async getRegionEodState(token, workingDate) {
      const response = await fetchImpl(url(`/api/v1/reports/${workingDate}/eod-state`), {
        headers: authHeaders(token),
        cache: "no-store",
      });

      return readJson<RegionEodStateResponse>(response);
    },

    async getProductivityRange(token, from, to) {
      const query = new URLSearchParams({ from, to }).toString();
      const response = await fetchImpl(
        url(`/api/v1/reports/productivity/range?${query}`),
        { headers: authHeaders(token), cache: "no-store" },
      );

      return readJson<ReportProductivityRangeResponse>(response);
    },

    async closeRegionEod(token, regionId, workingDate) {
      const response = await fetchImpl(url(`/api/v1/regions/${regionId}/eod/close`), {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ workingDate }),
      });

      return readJson<CloseRegionEodResponse>(response);
    },

    async reopenRegionEod(token, regionId, workingDate) {
      const response = await fetchImpl(url(`/api/v1/regions/${regionId}/eod/reopen`), {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ workingDate }),
      });

      return readJson<ReopenRegionEodResponse>(response);
    },

    async getReportHistory(token) {
      const response = await fetchImpl(url("/api/v1/report-history"), {
        headers: authHeaders(token),
        cache: "no-store",
      });

      return readJson<ReportHistorySession[]>(response);
    },

    async getReportHistoryById(token, id) {
      const response = await fetchImpl(url(`/api/v1/report-history/${id}`), {
        headers: authHeaders(token),
        cache: "no-store",
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

    async getAdminEngineers(token, filters) {
      const params = new URLSearchParams();
      if (filters.regionId) params.append("regionId", filters.regionId);
      if (filters.search) params.append("search", filters.search);
      if (filters.isActive !== undefined) params.append("isActive", String(filters.isActive));
      if (filters.limit) params.append("limit", String(filters.limit));
      if (filters.offset) params.append("offset", String(filters.offset));
      
      const queryString = params.toString() ? `?${params.toString()}` : "";
      const response = await fetchImpl(url(`/api/v1/admin/engineers${queryString}`), {
        headers: authHeaders(token),
      });

      return readJson<ListEngineersResult>(response);
    },

    async createAdminEngineer(token, input) {
      const response = await fetchImpl(url(`/api/v1/admin/engineers`), {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify(input),
      });

      return readJson<{ engineer: Engineer }>(response);
    },

    async updateAdminEngineer(token, id, input) {
      const response = await fetchImpl(url(`/api/v1/admin/engineers/${id}`), {
        method: "PATCH",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify(input),
      });

      return readJson<{ engineer: Engineer }>(response);
    },

    async deactivateAdminEngineer(token, id) {
      const response = await fetchImpl(url(`/api/v1/admin/engineers/${id}/deactivate`), {
        method: "POST",
        headers: authHeaders(token),
      });

      return readJson<{ engineer: Engineer }>(response);
    },

    async reactivateAdminEngineer(token, id) {
      const response = await fetchImpl(url(`/api/v1/admin/engineers/${id}/reactivate`), {
        method: "POST",
        headers: authHeaders(token),
      });

      return readJson<{ engineer: Engineer }>(response);
    },

    async deleteAdminEngineer(token, id) {
      const response = await fetchImpl(url(`/api/v1/admin/engineers/${id}`), {
        method: "DELETE",
        headers: authHeaders(token),
      });

      return readJson<{ success: boolean }>(response);
    },

    async getEngineersDropdown(token, regionId) {
      const queryString = regionId ? `?regionId=${encodeURIComponent(regionId)}` : "";
      const response = await fetchImpl(url(`/api/v1/admin/engineers/dropdown${queryString}`), {
        headers: authHeaders(token),
      });

      return readJson<{ engineers: DropdownEngineer[] }>(response);
    },

    async getAdminRtplStatuses(token, filters = {}) {
      const params = new URLSearchParams();
      if (filters.category) params.append("category", filters.category);
      if (filters.search) params.append("search", filters.search);
      if (filters.isActive !== undefined) params.append("isActive", String(filters.isActive));

      const queryString = params.toString() ? `?${params.toString()}` : "";
      const response = await fetchImpl(url(`/api/v1/admin/rtpl-statuses${queryString}`), {
        headers: authHeaders(token),
      });

      return readJson<{ statuses: RtplStatus[] }>(response);
    },

    async createAdminRtplStatus(token, input) {
      const response = await fetchImpl(url(`/api/v1/admin/rtpl-statuses`), {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify(input),
      });

      return readJson<{ status: RtplStatus }>(response);
    },

    async updateAdminRtplStatus(token, id, input) {
      const response = await fetchImpl(url(`/api/v1/admin/rtpl-statuses/${id}`), {
        method: "PATCH",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify(input),
      });

      return readJson<{ status: RtplStatus; renamedRowValues?: number }>(response);
    },

    async deactivateAdminRtplStatus(token, id) {
      const response = await fetchImpl(url(`/api/v1/admin/rtpl-statuses/${id}/deactivate`), {
        method: "POST",
        headers: authHeaders(token),
      });

      return readJson<{ status: RtplStatus }>(response);
    },

    async reactivateAdminRtplStatus(token, id) {
      const response = await fetchImpl(url(`/api/v1/admin/rtpl-statuses/${id}/reactivate`), {
        method: "POST",
        headers: authHeaders(token),
      });

      return readJson<{ status: RtplStatus }>(response);
    },

    async deleteAdminRtplStatus(token, id) {
      const response = await fetchImpl(url(`/api/v1/admin/rtpl-statuses/${id}`), {
        method: "DELETE",
        headers: authHeaders(token),
      });

      return readJson<{ success: boolean }>(response);
    },

    async getRtplStatusesDropdown(token) {
      const response = await fetchImpl(url(`/api/v1/admin/rtpl-statuses/dropdown`), {
        headers: authHeaders(token),
      });

      return readJson<{ statuses: DropdownRtplStatus[] }>(response);
    },
  };
}
