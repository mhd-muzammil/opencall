// Dashboard analytics types extracted from app/page.tsx (Phase 2: types only).
// Moved verbatim — no behavior changes.

export interface RegionStats {
  count: number;
  consumerCount: number;
  commercialCount: number;
  warrantyCount: number;
  nonWarrantyCount: number;

  pcCount: number;
  pcConsumer: number;
  pcCommercial: number;

  printCount: number;
  printConsumer: number;
  printCommercial: number;

  installCount: number;
  installConsumer: number;
  installCommercial: number;

  cissCount: number;
  cissConsumer: number;

  rcaCount: number;
  rcaConsumer: number;
  rcaCommercial: number;

  tradeCount: number;
  tradePcCount: number;
  tradePcConsumer: number;
  tradePcCommercial: number;
  tradePrintCount: number;
  tradePrintConsumer: number;
  tradePrintCommercial: number;

  woOtcCodeBreakdown: { code: string; count: number }[];
}

export interface PivotSegmentOption {
  value: string;
  label: string;
  count: number;
}

export interface RtplWipPivotColumn {
  key: string;
  label: string;
  total: number;
  sortValue: number;
}

export interface RtplWipPivotRow {
  key: string;
  status: string;
  total: number;
  cells: Record<string, number>;
}

export interface RtplWipPivot {
  segmentOptions: PivotSegmentOption[];
  columns: RtplWipPivotColumn[];
  rows: RtplWipPivotRow[];
  grandTotal: number;
}
