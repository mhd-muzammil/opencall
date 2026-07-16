// Operational app sections a REGION_ADMIN's access can be scoped to from the Admin
// Console. Mirrors the backend's USER_SECTIONS (shared/constants/userSections.ts) — kept
// as a small frontend copy because the frontend's @opencall/shared build does not carry
// the backend-only constant. The keys MUST stay in sync with the backend list; the
// backend re-validates every key, so a drift here is rejected server-side, not silently
// applied.

export interface UserSectionOption {
  key: string;
  label: string;
  group: string;
}

export const USER_SECTIONS: readonly UserSectionOption[] = [
  { key: "overview", label: "Overview", group: "Dashboards" },
  { key: "closed-calls", label: "Closed Calls", group: "Dashboards" },
  { key: "rtpl-dashboard", label: "RTPL Dashboard", group: "Dashboards" },
  { key: "rtpl", label: "RTPL Hours Status", group: "Dashboards" },
  { key: "sla-tat", label: "SLA TaT", group: "Dashboards" },
  { key: "pivot", label: "RTPL Pivot", group: "Dashboards" },
  { key: "tn-view-status", label: "TN View Status", group: "Dashboards" },
  { key: "flex", label: "Flex Dashboard", group: "Dashboards" },
  { key: "flex-eod-bod", label: "Flex EOD & BOD", group: "Dashboards" },
  { key: "records", label: "Records Table", group: "Data & Operations" },
  { key: "record-format", label: "Record Format", group: "Data & Operations" },
  { key: "warranty", label: "Warranty Lookup", group: "Data & Operations" },
  { key: "productivity", label: "Engineer Productivity", group: "Dashboards" },
];

export const USER_SECTION_KEYS: readonly string[] = USER_SECTIONS.map(
  (section) => section.key,
);
