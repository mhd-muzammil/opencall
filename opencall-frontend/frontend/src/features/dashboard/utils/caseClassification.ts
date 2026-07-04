// Pure case-classification utilities. These read the backend-derived Segment as the
// single source of truth (Trade is baked into the Segment value) rather than
// re-deriving Trade/PC/Print from WO OTC codes on the client.
import type { GeneratedReportResponse } from "../../../lib/apiClient";
import { MANUAL_ENTRY_REQUIRED, CISS_PRODUCT_LINE } from "../constants";

export function segmentValue(row: GeneratedReportResponse["rows"][number]): string {
  return String(row.output.Segment ?? "").trim().toLowerCase();
}

// The Segment is the single source of truth, derived once in the backend from the
// FieldEZ (Flex WIP) "Business Segment" + "WO OTC Code" columns. It is one of:
//   "PC" | "Print" | "Install" | "Trade PC" | "Trade Print" | ""
// (see getSegment in the backend enrichmentHelpers). Trade is baked into the value,
// so every classifier below reads the Segment rather than re-deriving from OTC codes.
export function isTradeCase(row: GeneratedReportResponse["rows"][number]): boolean {
  return segmentValue(row).startsWith("trade");
}

export function isCissCase(row: GeneratedReportResponse["rows"][number]): boolean {
  if (isTradeCase(row)) {
    return false;
  }
  return String(row.output["Product Line Name"] ?? "")
    .trim()
    .toUpperCase()
    .includes(CISS_PRODUCT_LINE);
}

export function isSegmentCase(
  row: GeneratedReportResponse["rows"][number],
  segment: string,
): boolean {
  return String(row.output.Segment ?? "").trim().toLowerCase() === segment.toLowerCase();
}

// PC-type case (warranty "PC" or non-warranty "Trade PC"). Gate with isWarrantyCase
// / isTradeCase at the call site to split warranty PC vs Trade PC.
export function isPcCase(row: GeneratedReportResponse["rows"][number]): boolean {
  const segment = segmentValue(row);
  return segment === "pc" || segment === "trade pc";
}

// Print-type case (everything that is not PC-type): "Print", "Install", "Trade Print",
// and any blank/unknown segment. Preserves the previous "!isPcCase" contract.
export function isPrintCase(row: GeneratedReportResponse["rows"][number]): boolean {
  return !isPcCase(row);
}

export function isPrintInstallationCase(row: GeneratedReportResponse["rows"][number]): boolean {
  return segmentValue(row) === "install";
}

export function isPrintFixCase(row: GeneratedReportResponse["rows"][number]): boolean {
  return isPrintCase(row) && !isPrintInstallationCase(row);
}

export function isRcaCase(row: GeneratedReportResponse["rows"][number]): boolean {
  const rca = String(row.output.RCA ?? "").trim();

  return rca.length > 0 && rca !== MANUAL_ENTRY_REQUIRED;
}

export function isConsumerCase(row: GeneratedReportResponse["rows"][number]): boolean {
  // Authoritative source: the Renderways "Customer Type" field, carried through
  // on the enriched row. "Commercial" => commercial, "Consumer" => consumer.
  const customerType = String(row.enriched?.customer_type ?? "").trim().toLowerCase();
  if (customerType === "commercial") return false;
  if (customerType === "consumer") return true;

  // Fallback heuristic for rows that lack a Customer Type (e.g. unmatched rows
  // with no Renderways record). Best-effort guess from product line / account.
  const segment = String(row.output.Segment ?? "").trim().toLowerCase();
  const prodLine = String(row.output["Product Line Name"] ?? "").trim().toLowerCase();
  const account = String(row.output["Account Name"] ?? "").trim().toLowerCase();
  const custName = String(row.output["Customer Name"] ?? "").trim().toLowerCase();

  // 1. Direct explicit checks
  if (segment.includes("consumer") || prodLine.includes("consumer")) {
    return true;
  }
  if (segment.includes("commercial") || prodLine.includes("commercial") || segment.includes("enterprise") || prodLine.includes("enterprise")) {
    return false;
  }

  // 2. High-fidelity corporate/business account checks
  const corporateKeywords = ["pvt", "ltd", "corp", "inc", "bank", "technologies", "solutions", "limited", "enterprise", "tcs", "wipro", "infosys", "cognizant", "hcl"];
  if (corporateKeywords.some(keyword => account.includes(keyword))) {
    return false;
  }

  // 3. Retail/Individual checks
  if (account === "individual" || account === "consumer" || account.includes("retail")) {
    return true;
  }

  // 4. Fallbacks for individuals (e.g. empty account or same as customer name)
  if (account === "" || account === custName) {
    return true;
  }

  return false;
}

export function isWarrantyCase(row: GeneratedReportResponse["rows"][number]): boolean {
  return !isTradeCase(row);
}
