// Reading a report row the way the Closed Calls page reads it.
//
// One copy, because the region a row belongs to is used by the card counts, the ledger,
// the search and the export, and a second spelling of "which ASP is this" is how the
// parts stop summing to the whole.
import { ASP_CODE_REGION_MAP } from "@opencall/shared";
import type { ReportRow } from "../../types";

export function rowOutput(row: ReportRow): Record<string, unknown> {
  return (row.output ?? {}) as Record<string, unknown>;
}

/**
 * The row's ASP code. The upload has called this column four different things over the
 * years, so all four spellings are accepted, in the order they became authoritative.
 */
export function getRowAspCode(output: Record<string, unknown> = {}): string {
  return String(
    output["Work Location"] ??
      output["ASP Code"] ??
      output["Region"] ??
      output["ASP"] ??
      "",
  )
    .trim()
    .toUpperCase();
}

/** The human region name for an ASP code, falling back to the code itself. */
export function getRowRegionName(aspCode: string): string {
  if (!aspCode) return "-";
  return ASP_CODE_REGION_MAP[aspCode as keyof typeof ASP_CODE_REGION_MAP] || aspCode;
}

/** "Chennai (ASPS01461)", or just the code when there is no name for it. */
export function formatAspDisplay(aspCode: string): string {
  const name = getRowRegionName(aspCode);
  if (name !== "-" && name !== aspCode) return `${name} (${aspCode})`;
  return aspCode || "-";
}

/** The value of a column as a trimmed string, or "" when absent. */
export function text(output: Record<string, unknown>, key: string): string {
  return String(output[key] ?? "").trim();
}

/** The first non-empty value among several candidate column spellings. */
export function firstText(
  output: Record<string, unknown>,
  ...keys: readonly string[]
): string {
  for (const key of keys) {
    const value = text(output, key);
    if (value) return value;
  }
  return "";
}

/** Everything the ledger search looks through, lower-cased and joined. */
export function searchHaystack(row: ReportRow): string {
  const output = rowOutput(row);
  const asp = getRowAspCode(output);
  return [
    text(output, "Ticket ID"),
    text(output, "Case ID"),
    firstText(output, "WO OTC CODE", "WO OTC Code"),
    text(output, "Engineer"),
    firstText(output, "Customer Name", "Customer"),
    text(output, "Account Name"),
    text(output, "RTPL status"),
    asp,
    getRowRegionName(asp),
    text(output, "Segment"),
    text(output, "Contact"),
    text(output, "Customer Mail"),
    text(output, "Product"),
  ]
    .join(" ")
    .toLowerCase();
}

/** True when the row matches every whitespace-separated term of the query. */
export function rowMatchesQuery(row: ReportRow, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = searchHaystack(row);
  return terms.every((term) => haystack.includes(term));
}
