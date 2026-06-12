// Pure case-classification utilities extracted from app/page.tsx (Phase 3).
// Moved verbatim — no behavior changes.
import type { GeneratedReportResponse } from "../../../lib/apiClient";
import {
  MANUAL_ENTRY_REQUIRED,
  CISS_PRODUCT_LINE,
  TRADE_WO_OTC_CODE_KEYWORD,
  PRINT_INSTALLATION_WO_OTC_CODE,
} from "../constants";
import { normalizeWoOtcCode, getWoOtcCodePrefix } from "./woOtcUtils";

export function segmentValue(row: GeneratedReportResponse["rows"][number]): string {
  return String(row.output.Segment ?? "").trim().toLowerCase();
}

export function isTradeCase(row: GeneratedReportResponse["rows"][number]): boolean {
  const code = normalizeWoOtcCode(row.output["WO OTC CODE"]);
  if (code.includes(TRADE_WO_OTC_CODE_KEYWORD) || code.startsWith("01")) {
    return true;
  }
  const segment = segmentValue(row);
  // A "Trade" segment is non-warranty even when the OTC code is not 01/Trade.
  if (segment === "trade") {
    return true;
  }
  // A PC carrying a component field install code ("05F - Comp Field Install") is a
  // billable/non-warranty PC job, so it belongs in Trade -> PC Total, not the
  // warranty dashboard. (Blank/Install segments with 05F remain warranty installs.)
  if (
    segment === "pc" &&
    getWoOtcCodePrefix(row.output["WO OTC CODE"]) === PRINT_INSTALLATION_WO_OTC_CODE
  ) {
    return true;
  }
  return false;
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

export function isPcCase(row: GeneratedReportResponse["rows"][number]): boolean {
  if (isPrintInstallationCase(row)) {
    return false;
  }
  const segment = segmentValue(row);
  const prodLine = String(row.output["Product Line Name"] ?? "").trim().toLowerCase();

  // An explicit segment always wins.
  if (segment === "pc") return true;
  if (segment === "print") return false;

  // Segment is blank/unknown: fall back to Product Line keywords.
  return (
    prodLine.includes("notebook") ||
    prodLine.includes("desktop") ||
    prodLine.includes("chromebook") ||
    prodLine.includes("workstation") ||
    prodLine.includes("display") ||
    prodLine.includes("pc") ||
    prodLine.includes("mws")
  );
}

export function isPrintCase(row: GeneratedReportResponse["rows"][number]): boolean {
  return !isPcCase(row);
}

export function isPrintInstallationCase(row: GeneratedReportResponse["rows"][number]): boolean {
  const segment = segmentValue(row);
  // An explicit segment always wins over the OTC code.
  if (segment === "install") return true;
  if (segment === "pc" || segment === "print") return false;
  // Segment is blank/unknown: fall back to the print-installation OTC code (05F).
  return getWoOtcCodePrefix(row.output["WO OTC CODE"]) === PRINT_INSTALLATION_WO_OTC_CODE;
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
