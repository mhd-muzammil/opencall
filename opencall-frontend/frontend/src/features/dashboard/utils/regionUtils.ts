// Pure region-stats utilities extracted from app/page.tsx (Phase 3).
// Moved verbatim — no behavior changes.
import type { GeneratedReportResponse } from "../../../lib/apiClient";
import type { RegionStats } from "../types";
import {
  isConsumerCase,
  isWarrantyCase,
  isPcCase,
  isPrintCase,
  isPrintInstallationCase,
  isCissCase,
  isRcaCase,
  isTradeCase,
} from "./caseClassification";

export function getOtcSortWeight(code: string): number {
  const normalized = code.trim().toUpperCase();
  if (normalized.includes("TRADE")) {
    return 6;
  }
  if (normalized.startsWith("05F") || normalized.startsWith("O5F")) {
    return 1;
  }
  if (normalized.startsWith("05K") || normalized.startsWith("O5K")) {
    return 2;
  }
  if (normalized.startsWith("02N") || normalized.startsWith("O2N")) {
    return 3;
  }
  if (normalized.startsWith("00C") || normalized.startsWith("OOC")) {
    return 4;
  }
  return 5;
}

export function calculateRegionStats(rows: GeneratedReportResponse["rows"][number][]): RegionStats {
  const count = rows.length;
  let consumerCount = 0;
  let commercialCount = 0;
  let warrantyCount = 0;
  let nonWarrantyCount = 0;

  let pcCount = 0;
  let pcConsumer = 0;
  let pcCommercial = 0;

  let printCount = 0;
  let printConsumer = 0;
  let printCommercial = 0;

  let installCount = 0;
  let installConsumer = 0;
  let installCommercial = 0;

  let cissCount = 0;
  let cissConsumer = 0;

  let rcaCount = 0;
  let rcaConsumer = 0;
  let rcaCommercial = 0;

  let tradeCount = 0;
  let tradePcCount = 0;
  let tradePcConsumer = 0;
  let tradePcCommercial = 0;
  let tradePrintCount = 0;
  let tradePrintConsumer = 0;
  let tradePrintCommercial = 0;

  const woOtcCodes = new Map<string, number>();

  for (const row of rows) {
    const isConsumer = isConsumerCase(row);
    const isWarranty = isWarrantyCase(row);
    const isPc = isPcCase(row);
    const isPrint = isPrintCase(row);
    const isInstall = isPrintInstallationCase(row);
    const isCiss = isCissCase(row);
    const isRca = isRcaCase(row);
    const isTrade = isTradeCase(row);

    const woOtcCode = String(row.output["WO OTC CODE"] || "Unspecified").trim() || "Unspecified";
    woOtcCodes.set(woOtcCode, (woOtcCodes.get(woOtcCode) ?? 0) + 1);

    if (isConsumer) consumerCount++;
    else commercialCount++;

    if (isWarranty) warrantyCount++;
    else nonWarrantyCount++;

    if (isPc && isWarranty) {
      pcCount++;
      if (isConsumer) pcConsumer++;
      else pcCommercial++;
    }

    if (isPrint && isWarranty) {
      printCount++;
      if (isConsumer) printConsumer++;
      else printCommercial++;
    }

    if (isInstall && isWarranty) {
      installCount++;
      if (isConsumer) installConsumer++;
      else installCommercial++;
    }

    if (isCiss) {
      cissCount++;
      if (isConsumer) cissConsumer++;
    }

    if (isRca) {
      rcaCount++;
      if (isConsumer) rcaConsumer++;
      else rcaCommercial++;
    }

    if (isTrade) {
      tradeCount++;
      if (isPc) {
        tradePcCount++;
        if (isConsumer) tradePcConsumer++;
        else tradePcCommercial++;
      }
      if (isPrint) {
        tradePrintCount++;
        if (isConsumer) tradePrintConsumer++;
        else tradePrintCommercial++;
      }
    }
  }

  const woOtcCodeBreakdown = Array.from(woOtcCodes.entries())
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => {
      const weightA = getOtcSortWeight(a.code);
      const weightB = getOtcSortWeight(b.code);
      if (weightA !== weightB) {
        return weightA - weightB;
      }
      return a.code.localeCompare(b.code);
    });

  return {
    count,
    consumerCount,
    commercialCount,
    warrantyCount,
    nonWarrantyCount,
    pcCount,
    pcConsumer,
    pcCommercial,
    printCount,
    printConsumer,
    printCommercial,
    installCount,
    installConsumer,
    installCommercial,
    cissCount,
    cissConsumer,
    rcaCount,
    rcaConsumer,
    rcaCommercial,
    tradeCount,
    tradePcCount,
    tradePcConsumer,
    tradePcCommercial,
    tradePrintCount,
    tradePrintConsumer,
    tradePrintCommercial,
    woOtcCodeBreakdown,
  };
}
