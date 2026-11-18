import { brandForTicketId, type CallBrand } from "@opencall/shared";
import type { GeneratedReportResponse } from "../../lib/apiClient";

/**
 * HP and Acer calls share one daily report; a row's brand is read from its Ticket ID
 * (Acer rows are "ACER-<case id>"). These helpers split the report so the HP dashboards
 * keep seeing HP calls only, and the Records page shows one brand per tab.
 */

export type RecordsBrand = CallBrand;

export function rowBrand(row: { output: Record<string, string | number> }): CallBrand {
  return brandForTicketId(row.output["Ticket ID"]);
}

/** The report with only `brand`'s rows; null brand = the whole report. Same object when nothing changes. */
export function reportForBrand(
  report: GeneratedReportResponse | null,
  brand: CallBrand | null,
): GeneratedReportResponse | null {
  if (!report || brand === null) return report;
  const rows = report.rows.filter((row) => rowBrand(row) === brand);
  return rows.length === report.rows.length ? report : { ...report, rows };
}

/**
 * The Records columns on the Acer tab. HP-only columns (HP Owner Status, WO OTC CODE,
 * Flex's TAT…) are left out; the portal's own fields — sent by the backend as extra
 * row values — are in.
 */
export const ACER_RECORD_COLUMNS: readonly string[] = [
  "S.no",
  "Case ID",
  "Ticket ID",
  "Customer Name",
  "Contact",
  "Alt Contact",
  "Location",
  "Pincode",
  "Full Address",
  "Product Name",
  "Product Line Name",
  "Product S.No",
  "Issue Description",
  "Warranty Status",
  "Service Type",
  "Call Status",
  "WIP aging",
  "RTPL status",
  "Evening status",
  "Engineer",
  "Current Remarks",
  "RCA",
  "Work Location",
  "Case Created Time",
];
