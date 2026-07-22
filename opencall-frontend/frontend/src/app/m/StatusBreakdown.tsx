"use client";

import { useMemo, useState } from "react";
import { CaseList } from "./CaseList";
import type { GeneratedReportResponse } from "../../lib/api/types";
import type { ClientSession } from "../../lib/session";

type Row = GeneratedReportResponse["rows"][number];

/**
 * Distribution of rows by one output column, rendered as a tappable bar list. Tapping a
 * value drills into the matching cases.
 *
 * The bucketing mirrors `buildStatusAnalytics` in lib/reportDashboardAnalytics.ts, which
 * is what the desktop RTPL/Flex dashboards use: the key is the raw *trimmed* value
 * (case-sensitive), rows with a blank value are skipped, and the sort is count
 * descending then value A-Z. Because blanks are dropped, the count of skipped rows is
 * shown underneath so nothing disappears silently.
 */
export function StatusBreakdown({
  rows,
  column,
  session,
  onSaved,
  emptyText = "No cases.",
}: Readonly<{
  rows: Row[];
  column: string;
  session?: ClientSession | null;
  onSaved?: () => void;
  emptyText?: string;
}>) {
  const [drill, setDrill] = useState<string | null>(null);

  const valueOf = (row: Row): string =>
    String((row.output as Record<string, unknown>)[column] ?? "").trim();

  const { buckets, blankCount } = useMemo(() => {
    const counts = new Map<string, number>();
    let blank = 0;
    for (const row of rows) {
      const status = String((row.output as Record<string, unknown>)[column] ?? "").trim();
      if (!status) {
        blank += 1;
        continue;
      }
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return {
      buckets: [...counts.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      ),
      blankCount: blank,
    };
  }, [rows, column]);

  const max = buckets[0]?.[1] ?? 1;

  const drillRows = useMemo(
    () => (drill ? rows.filter((row) => valueOf(row) === drill) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, column, drill],
  );

  if (drill) {
    return (
      <>
        <button
          type="button"
          className="mBtn mBtn--ghost"
          style={{ marginBottom: 12 }}
          onClick={() => setDrill(null)}
        >
          ← {drill} ({drillRows.length})
        </button>
        <CaseList
          rows={drillRows}
          emptyText={emptyText}
          session={session ?? null}
          {...(onSaved ? { onSaved } : {})}
        />
      </>
    );
  }

  if (buckets.length === 0) {
    return (
      <div className="mCard">
        <div className="mMuted">{emptyText}</div>
      </div>
    );
  }

  return (
    <>
      <div className="mList">
        {buckets.map(([label, count]) => (
          <button
            key={label}
            type="button"
            className="mRow"
            onClick={() => setDrill(label)}
          >
            <div className="mRow__top">
              <span className="mRow__title" style={{ fontSize: 13.5 }}>{label}</span>
              <span className="mChip">{count}</span>
            </div>
            {/* Proportion bar — instant visual ranking without a chart library. */}
            <div
              style={{
                height: 6,
                borderRadius: 999,
                background: "var(--m-border)",
                marginTop: 9,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.max(3, (count / max) * 100)}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: "var(--m-primary)",
                }}
              />
            </div>
          </button>
        ))}
      </div>

      {blankCount > 0 && (
        <p className="mMuted" style={{ fontSize: 11.5, margin: "10px 2px 0" }}>
          {blankCount} row{blankCount === 1 ? "" : "s"} have no {column} and are not
          counted above — same as the web dashboard.
        </p>
      )}
    </>
  );
}
