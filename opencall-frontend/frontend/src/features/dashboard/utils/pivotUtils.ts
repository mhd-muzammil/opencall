// Pure RTPL/WIP pivot utilities extracted from app/page.tsx (Phase 3).
// Moved verbatim — no behavior changes.
import type {
  ReportRow,
  RtplWipPivot,
  RtplWipPivotColumn,
  RtplWipPivotRow,
} from "../types";
import { parseWipAgingValue } from "./reportUtils";

export function pivotLabel(value: unknown, fallback = "(blank)"): string {
  const label = String(value ?? "").trim();
  return label.length > 0 ? label : fallback;
}

export function pivotColumnKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "blank";
}

export function buildRtplWipAgingPivot(
  rows: readonly ReportRow[],
  selectedSegments: readonly string[] | null,
): RtplWipPivot {
  const hasSegmentFilter = selectedSegments !== null;
  const selectedSegmentSet = new Set(selectedSegments ?? []);
  const segmentCounts = new Map<string, number>();
  const columnTotals = new Map<string, RtplWipPivotColumn>();
  const rowTotals = new Map<string, RtplWipPivotRow>();
  let grandTotal = 0;

  for (const row of rows) {
    const ticketId = String(row.output["Ticket ID"] ?? "").trim();
    if (!ticketId) {
      continue;
    }

    const segment = pivotLabel(row.output.Segment);
    segmentCounts.set(segment, (segmentCounts.get(segment) ?? 0) + 1);

    if (hasSegmentFilter && !selectedSegmentSet.has(segment)) {
      continue;
    }

    const status = pivotLabel(row.output["RTPL status"]);
    const wipAgingLabel = pivotLabel(row.output["WIP aging"]);
    const wipAgingNumber = parseWipAgingValue(row.output["WIP aging"]);
    const columnKey = `wip-${pivotColumnKey(wipAgingLabel)}`;
    const rowKey = `status-${pivotColumnKey(status)}`;

    let column = columnTotals.get(columnKey);
    if (!column) {
      column = {
        key: columnKey,
        label: wipAgingLabel,
        total: 0,
        sortValue: wipAgingNumber ?? Number.MAX_SAFE_INTEGER,
      };
      columnTotals.set(columnKey, column);
    }
    column.total += 1;

    let pivotRow = rowTotals.get(rowKey);
    if (!pivotRow) {
      pivotRow = {
        key: rowKey,
        status,
        total: 0,
        cells: {},
      };
      rowTotals.set(rowKey, pivotRow);
    }
    pivotRow.cells[columnKey] = (pivotRow.cells[columnKey] ?? 0) + 1;
    pivotRow.total += 1;
    grandTotal += 1;
  }

  return {
    segmentOptions: Array.from(segmentCounts.entries())
      .map(([label, count]) => ({ value: label, label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    columns: Array.from(columnTotals.values()).sort(
      (a, b) => a.sortValue - b.sortValue || a.label.localeCompare(b.label),
    ),
    rows: Array.from(rowTotals.values()).sort(
      (a, b) => b.total - a.total || a.status.localeCompare(b.status),
    ),
    grandTotal,
  };
}
