export type {
  ApiErrorBody,
  DatabaseHealthResponse,
  EditedReportRowResponse,
  GeneratedReportResponse,
  LoginResponse,
  MatchPreviewResponse,
  ReportHistorySession,
  RuntimeHealthResponse,
  UploadBatch,
  UploadResponse,
} from "./api/types";
export {
  createOpenCallApiClient,
  type FetchLike,
  type OpenCallApiClient,
  type OpenCallApiClientOptions,
  type UploadFileInput,
} from "./api/openCallApiClient";
export { WEB_API_BASE_URL, webApiClient } from "./api/webApiClient";

import { webApiClient } from "./api/webApiClient";

export const login = webApiClient.login;
export const getDatabaseHealth = webApiClient.getDatabaseHealth;
export const getRuntimeHealth = webApiClient.getRuntimeHealth;
export const uploadReports = webApiClient.uploadReports;
export const previewMatches = webApiClient.previewMatches;
export const generateReport = webApiClient.generateReport;
export const updateReportRow = webApiClient.updateReportRow;
export const getReportHistory = webApiClient.getReportHistory;
export const getReportHistoryById = webApiClient.getReportHistoryById;
export const renameReportHistory = webApiClient.renameReportHistory;
export const duplicateReportHistory = webApiClient.duplicateReportHistory;
export const deleteReportHistory = webApiClient.deleteReportHistory;
