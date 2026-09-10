import React, { useMemo, useState } from "react";
import { formatNumber } from "../../utils";
import type { ReportRow } from "../../types";
import { DrillModal } from "./DrillModal";
import {
  firstText,
  getRowAspCode,
  getRowRegionName,
  rowMatchesQuery,
  rowOutput,
  text,
} from "./rowFields";

const MAX_ROWS = 300;

/**
 * The records behind OUR closed count.
 *
 * No fetch: these rows are already in memory — they are the same `closedRows` the cards
 * counted, narrowed by the same period, region and outcome predicates. That is the point.
 * A drill-down that re-derived its list from the server could disagree with the number
 * that opened it, and the one thing this page cannot afford is a count you cannot
 * reconcile with its own list.
 */
export function OursDrill({
  rows,
  title,
  scope,
  onOpenCase,
  onClose,
}: Readonly<{
  rows: readonly ReportRow[];
  title: string;
  /** Region and dates, said out loud under the title. */
  scope: string;
  onOpenCase: (row: ReportRow) => void;
  onClose: () => void;
}>) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => rows.filter((row) => rowMatchesQuery(row, search)),
    [rows, search],
  );
  const visible = filtered.slice(0, MAX_ROWS);

  return (
    <DrillModal
      title={title}
      subtitle={`${formatNumber(rows.length)} record${
        rows.length === 1 ? "" : "s"
      } · ${scope} · from this report`}
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
          placeholder="Search ticket, case, engineer, customer…"
          aria-label="Search these records"
        />
      </div>

      <table className="ccTable">
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Case</th>
            <th>Region</th>
            <th>Engineer</th>
            <th>Customer</th>
            <th>Closed date</th>
            <th>Flex status</th>
            <th>RTPL status</th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td colSpan={8} className="ccEmpty">
                {rows.length === 0
                  ? "No records for this scope."
                  : "No records match the search."}
              </td>
            </tr>
          ) : (
            visible.map((row, index) => {
              const output = rowOutput(row);
              const asp = getRowAspCode(output);
              const flexStatus = text(output, "Flex Status");
              return (
                <tr
                  key={row.serialNo ?? index}
                  className="ccClick"
                  onClick={() => onOpenCase(row)}
                >
                  <td className="ccTk">{text(output, "Ticket ID") || "—"}</td>
                  <td>{text(output, "Case ID") || "—"}</td>
                  <td>{getRowRegionName(asp)}</td>
                  <td>{text(output, "Engineer") || "—"}</td>
                  <td>
                    {firstText(output, "Account Name", "Customer Name", "Customer") || "—"}
                  </td>
                  <td>{text(output, "Case Closed Date") || "—"}</td>
                  <td>
                    {flexStatus || <span className="ccSt ccNone">none</span>}
                  </td>
                  <td>{text(output, "RTPL status") || "—"}</td>
                </tr>
              );
            })
          )}
          {filtered.length > MAX_ROWS && (
            <tr>
              <td colSpan={8} className="ccEmpty">
                Showing the first {MAX_ROWS} of {formatNumber(filtered.length)}. Export
                Excel covers all of them.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </DrillModal>
  );
}
