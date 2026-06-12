// Dashboard constants extracted from app/page.tsx (Phase 1: constants only).
// Values are moved verbatim — no behavior changes.
//
// NOTE: Some type-coupled config arrays (SOURCE_LABELS, FILE_FIELDS,
// MANUAL_FIELD_BY_COLUMN) still live in page.tsx and move here in a later pass.
// CHANGE_TYPE_LABELS / MANUAL_FIELD_LABELS (Phase 4) and RTPL_CASE_SCOPE_OPTIONS
// (Phase 5) were relocated here because extracted components/hooks depend on them.
import type { ChangeType, ManualCarryForwardField, RtplCaseScope } from "../types";

export const MANUAL_ENTRY_REQUIRED = "Manual Entry Required";
export const CISS_PRODUCT_LINE = "CISS";
export const PC_SEGMENT = "PC";
export const PRINT_SEGMENT = "Print";
export const PRINT_INSTALLATION_WO_OTC_CODE = "05F";
export const TRADE_WO_OTC_CODE_KEYWORD = "TRADE";
export const LAST_HISTORY_SESSION_KEY = "opencall.lastHistorySessionId";
export const RTPL_MODAL_DETAIL_LIMIT = 12;
export const RTPL_STATUS_CHANGE_LIMIT = 200;

export const PIVOT_LOCATION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ASPS01461", label: "Chennai" },
  { value: "ASPS01463", label: "Vellore" },
  { value: "ASPS01465", label: "Salem" },
  { value: "ASPS01489", label: "Kanchipuram" },
  { value: "ASPS01511", label: "Hosur" },
];

export const CHANGE_FIELD_LABELS: Record<string, string> = {
  flex_status: "Flex Status",
  rtpl_status: "RTPL status",
  wip_aging: "WIP aging",
  wip_aging_category: "WIP Aging Category",
  tat: "TAT",
  engineer: "Engineer",
  location: "Location",
  hp_owner_status: "HP Owner Status",
};

export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  NEW: "New",
  CLOSED: "Closed",
  UPDATED: "Updated",
  CARRIED: "Carried",
};

export const MANUAL_FIELD_LABELS: Record<ManualCarryForwardField, string> = {
  rtpl_status: "RTPL status",
  segment: "Segment",
  engineer: "Engineer",
  location: "Location",
  case_created_time: "Case Created Time",
  status_aging: "Status Aging",
  hp_owner_status: "HP Owner Status",
  customer_mail: "Customer Mail",
  rca: "RCA",
};

export const RTPL_CASE_SCOPE_OPTIONS: Array<{
  value: RtplCaseScope;
  label: string;
  description: string;
}> = [
  { value: "overall", label: "Overall", description: "All active cases" },
  { value: "warranty", label: "Warranty", description: "Excludes 01-Trade" },
  { value: "trade", label: "Trade", description: "01-Trade / non-warranty" },
];
