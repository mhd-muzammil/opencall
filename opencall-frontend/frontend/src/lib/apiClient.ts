export type {
  ApiErrorBody,
  DatabaseHealthResponse,
  EditedReportRowResponse,
  GeneratedReportResponse,
  LoginResponse,
  MatchPreviewResponse,
  ReportHistorySession,
  ReportRow,
  RuntimeHealthResponse,
  UploadBatch,
  UploadResponse,
  Engineer,
  DropdownEngineer,
  ListEngineersResult,
} from "./api/types";
export {
  createOpenCallApiClient,
  type FetchLike,
  type OpenCallApiClient,
  type OpenCallApiClientOptions,
  type UploadFileInput,
} from "./api/openCallApiClient";
export { WEB_API_BASE_URL, webApiClient } from "./api/webApiClient";
export { ApiClientError, isApiAuthError } from "./api/http";

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
export const deleteReportRow = webApiClient.deleteReportRow;
export const getAdminEngineers = webApiClient.getAdminEngineers;
export const createAdminEngineer = webApiClient.createAdminEngineer;
export const updateAdminEngineer = webApiClient.updateAdminEngineer;
export const deactivateAdminEngineer = webApiClient.deactivateAdminEngineer;
export const reactivateAdminEngineer = webApiClient.reactivateAdminEngineer;
export const getEngineersDropdown = webApiClient.getEngineersDropdown;
