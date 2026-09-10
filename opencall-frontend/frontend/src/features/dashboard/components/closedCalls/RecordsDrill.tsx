import React, { useEffect, useMemo, useState } from "react";
import { formatNumber } from "../../utils";
import { formatMonthKey } from "../../utils/billCycle";
import { formatDateKey, formatRangeLabel } from "../../utils/closedCallsPeriod";
import { DrillModal } from "./DrillModal";

/**
 * The individual records behind a "FieldEZ data closure" or "Raw data closures" count,
 * scoped to exactly the ASP, dates and status half the number was showing.
 *
 * Fetches its own data, so opening it never blocks the cards, and asks the server with the
 * same filters the count used — including `status`, so clicking the cancelled sub-figure
 * cannot open a list of completions.
 */
export function RecordsDrill({
  token,
  kind,
  outcome,
  aspCode,
  regionLabel,
  closureFrom,
  closureTo,
  rawMonthFrom,
  rawMonthTo,
  rawDateFrom,
  rawDateTo,
  onClose,
}: Readonly<{
  token: string;
  kind: "fieldez" | "raw";
  /** Which half of the card's split was clicked. */
  outcome: "closed" | "cancelled";
  aspCode: string;
  regionLabel: string;
  /** Day-precise bounds ("YYYY-MM-DD") for the closure records. */
  closureFrom: string;
  closureTo: string;
  /** Month bounds ("YYYY-MM") for raw records when day bounds are not available. */
  rawMonthFrom: string;
  rawMonthTo: string;
  /**
   * Day bounds on the raw records' WO Closed date. Set only when the card's count was
   * confirmed day-precise, so the list always shows the rows the number counted.
   */
  rawDateFrom: string;
  rawDateTo: string;
  onClose: () => void;
}>) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        if (kind === "fieldez") {
          const { getClosureDateRecords } = await import(
            "../../../../lib/closureDateApiClient"
          );
          const result = await getClosureDateRecords(token, {
            asp: aspCode,
            from: closureFrom,
            to: closureTo,
            status: outcome,
          });
          if (cancelled) return;
          setRows(
            result.rows.map((row) => ({
              "WO ID": row.woId || "—",
              "Case ID": row.caseId || "—",
              // Flex closes cancellations without a closure date, so a blank here is
              // expected — the status column is what explains it.
              "Closure Date": row.closureDate || "—",
              "Flex Status": row.closureStatus || "—",
              Region: row.aspCode || "(unmatched)",
            })),
          );
          setTotal(result.total);
        } else {
          const { getFlexRawRecords } = await import(
            "../../../../lib/flexRawApiClient"
          );
          const dayScoped = rawDateFrom !== "" || rawDateTo !== "";
          // Day bounds replace the month bounds outright — they are stricter, and the
          // month filter would additionally drop rows with a blank Month cell that the
          // day count legitimately included.
          const result = await getFlexRawRecords(token, {
            asp: aspCode,
            from: dayScoped ? "" : rawMonthFrom,
            to: dayScoped ? "" : rawMonthTo,
            dateFrom: rawDateFrom,
            dateTo: rawDateTo,
            status: outcome,
          });
          if (cancelled) return;
          setRows(
            result.rows.map((row) => ({
              Ticket: row.ticketNo || "—",
              "Case ID": row.caseId || "—",
              "Work Location": row.workLocation || "—",
              "Call Status": row.callStatus || "—",
              Closed: row.closedOn ? formatDateKey(row.closedOn) : "—",
              Month: row.month ? formatMonthKey(row.month) : "—",
            })),
          );
          setTotal(result.total);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load records");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    token,
    kind,
    outcome,
    aspCode,
    closureFrom,
    closureTo,
    rawMonthFrom,
    rawMonthTo,
    rawDateFrom,
    rawDateTo,
  ]);

  const columns = rows[0] ? Object.keys(rows[0]) : [];
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      Object.values(row).some((value) => value.toLowerCase().includes(query)),
    );
  }, [rows, search]);

  const title =
    (kind === "fieldez" ? "FieldEZ data closure" : "Raw data closures") +
    (outcome === "cancelled" ? " — cancelled" : "");

  // Closure and day-scoped raw show the exact dates picked; month-scoped raw shows the
  // months the range mapped to. Saying which is what keeps a "discrepancy" readable.
  const rangeLabel =
    kind === "fieldez"
      ? formatRangeLabel(closureFrom, closureTo, formatDateKey, "All dates")
      : rawDateFrom || rawDateTo
        ? formatRangeLabel(rawDateFrom, rawDateTo, formatDateKey, "All dates")
        : formatRangeLabel(rawMonthFrom, rawMonthTo, formatMonthKey, "All months");

  const endpoint =
    kind === "fieldez"
      ? "GET /api/v1/closure-dates/records"
      : "GET /api/v1/flex-raw/records";

  return (
    <DrillModal
      title={title}
      subtitle={`${regionLabel} · ${rangeLabel} · ${formatNumber(total)} record${
        total === 1 ? "" : "s"
      }${total > rows.length ? ` (showing first ${formatNumber(rows.length)})` : ""} · ${endpoint}`}
      onClose={onClose}
      footer={
        <button type="button" className="ccBtn ccSm" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="ccSearchRow">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search WO, Case ID, status…"
          aria-label="Search these records"
        />
      </div>

      {loading ? (
        <div className="ccLoading">Loading records…</div>
      ) : error ? (
        <div className="ccLoading ccError">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="ccEmpty">
          {rows.length === 0
            ? "No records for this scope."
            : "No records match the search."}
        </div>
      ) : (
        <table className="ccTable">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column}>{row[column]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DrillModal>
  );
}
