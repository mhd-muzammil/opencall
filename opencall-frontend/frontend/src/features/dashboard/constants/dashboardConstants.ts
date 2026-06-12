// Dashboard constants extracted from app/page.tsx (Phase 1: constants only).
// Values are moved verbatim — no behavior changes.
//
// NOTE: Type-coupled config arrays (SOURCE_LABELS, FILE_FIELDS,
// RTPL_CASE_SCOPE_OPTIONS, CHANGE_TYPE_LABELS, MANUAL_FIELD_BY_COLUMN) remain in
// page.tsx until Phase 2, when they move here together with their local types
// (avoids duplicating types / import cycles).

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
