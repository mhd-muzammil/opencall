// Dashboard domain types extracted from app/page.tsx (Phase 2: types only).
// Moved verbatim — no behavior changes.
import type { updateReportRow } from "../../../lib/apiClient";

// Re-use the existing ReportRow definition rather than duplicating it.
export type { ReportRow } from "../../../lib/api/types";

export type SourceKey = "FLEX_WIP" | "RENDERWAYS" | "CALL_PLAN";
export type FileField = "flexWipReport" | "renderwaysReport" | "callPlan";
export type ChangeType = "NEW" | "CLOSED" | "CARRIED" | "UPDATED";
export type PrintCaseFilter = "all" | "installation" | "fix";
export type RtplCaseScope = "overall" | "warranty" | "trade";
export type ManualCarryForwardField =
  | "rtpl_status"
  | "segment"
  | "engineer"
  | "location"
  | "case_created_time"
  | "status_aging"
  | "hp_owner_status"
  | "customer_mail"
  | "rca";

export type ReportRowPatchValues = Parameters<typeof updateReportRow>[0]["values"];
