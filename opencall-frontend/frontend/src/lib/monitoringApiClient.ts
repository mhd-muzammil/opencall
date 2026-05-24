export interface MonitoringDashboardSummary {
  activeRegions: number;
  totalRegions: number;
  totalActiveUsers: number;
  totalReports30d: number;
  totalPendingManualEntries: number;
}

export interface RtplMetric {
  rtplStatus: string;
  count: number;
}

export interface RegionDashboardEntry {
  regionId: string;
  regionCode: string;
  regionName: string;
  regionIsActive: boolean;
  activeUserCount: number;
  recentLoginCount24h: number;
  reportCount30d: number;
  failedBatchCount30d: number;
  pendingManualEntries: number;
  lastLoginAt: string | null;
  lastUploadAt: string | null;
  lastReportGeneratedAt: string | null;
  rtplMetrics: RtplMetric[];
}

export interface RecentLoginRow {
  userId: string;
  username: string | null;
  email: string;
  role: "SUPER_ADMIN" | "REGION_ADMIN";
  regionId: string | null;
  lastLoginAt: string | null;
  isActive: boolean;
}

export interface RecentUploadRow {
  batchId: string;
  originalFileName: string;
  sourceType: "FLEX_WIP" | "RENDERWAYS" | "CALL_PLAN";
  status: "UPLOADED" | "VALIDATED" | "FAILED" | "PROCESSED";
  rowCount: number;
  errorCount: number;
  createdAt: string;
}

export interface RecentReportRow {
  reportId: string;
  reportDate: string;
  totalRows: number;
  duplicateTicketCount: number;
  unmatchedTicketCount: number;
  createdAt: string;
}

export interface MonitoringDashboard {
  generatedAt: string;
  summary: MonitoringDashboardSummary;
  regions: RegionDashboardEntry[];
  recentLogins: RecentLoginRow[];
  recentUploads: RecentUploadRow[];
  recentReports: RecentReportRow[];
}

export interface RegionDrillDown {
  region: RegionDashboardEntry;
  recentLogins: RecentLoginRow[];
  recentUploads: RecentUploadRow[];
  recentReports: RecentReportRow[];
}

const NOT_YET_AVAILABLE =
  "Activity monitoring will be available in Phase 2. User management is live in the Users tab.";

export async function getMonitoringDashboard(
  _token: string,
  _regionId: string | null,
  _limit: number,
): Promise<MonitoringDashboard> {
  throw new Error(NOT_YET_AVAILABLE);
}

export async function getRegionDrillDown(
  _token: string,
  _regionId: string,
  _limit: number,
): Promise<RegionDrillDown> {
  throw new Error(NOT_YET_AVAILABLE);
}
