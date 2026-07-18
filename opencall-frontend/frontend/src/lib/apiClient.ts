export type {
  ApiErrorBody,
  CloseRegionEodResponse,
  DatabaseHealthResponse,
  EditedReportRowResponse,
  GeneratedReportResponse,
  LoginResponse,
  MatchPreviewResponse,
  RegionEodStateEntry,
  RegionEodStateResponse,
  RegionEodStatus,
  ReopenRegionEodResponse,
  ReportHistorySession,
  ReportRow,
  RtplStatusChange,
  RuntimeHealthResponse,
  UploadBatch,
  UploadResponse,
  Engineer,
  DropdownEngineer,
  ListEngineersResult,
  RtplStatus,
  DropdownRtplStatus,
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
export const getRtplStatusChanges = webApiClient.getRtplStatusChanges;
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
export const getAdminRtplStatuses = webApiClient.getAdminRtplStatuses;
export const createAdminRtplStatus = webApiClient.createAdminRtplStatus;
export const updateAdminRtplStatus = webApiClient.updateAdminRtplStatus;
export const deactivateAdminRtplStatus = webApiClient.deactivateAdminRtplStatus;
export const reactivateAdminRtplStatus = webApiClient.reactivateAdminRtplStatus;
export const deleteAdminRtplStatus = webApiClient.deleteAdminRtplStatus;
export const getRtplStatusesDropdown = webApiClient.getRtplStatusesDropdown;
export const getRegionEodState = webApiClient.getRegionEodState;
export const closeRegionEod = webApiClient.closeRegionEod;
export const reopenRegionEod = webApiClient.reopenRegionEod;
