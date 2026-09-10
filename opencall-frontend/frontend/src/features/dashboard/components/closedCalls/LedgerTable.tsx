import React from "react";
import { formatNumber } from "../../utils";
import { hasFlexClosureOutcome } from "@opencall/shared";
import type { ReportRow } from "../../types";
import type { ClosedCallsPeriodPreset } from "../../utils/closedCallsPeriod";
import { firstText, getRowAspCode, getRowRegionName, rowOutput, text } from "./rowFields";

/** The stored customer feedback for a row, when some has been captured. */
interface RowFeedback {
  callStatus?: string | undefined;
  feedback?: string | undefined;
  remarks?: string | undefined;
}

function readFeedback(output: Record<string, unknown>): RowFeedback | null {
  const raw = output["Customer Feedback"];
  if (raw && typeof raw === "object") return raw as RowFeedback;
  // Older responses only carry the derived one-line summary.
  const summary = text(output, "Customer Status");
  return summary ? { callStatus: summary } : null;
}

/**
 * The closed-call records themselves.
 *
 * TWELVE columns, down from sixteen. The old table rendered the customer four times over:
 * a "Customer / Segment" cell that already listed name, account, mail and contact as
 * chips, and then separate Customer Name, Customer Mail and Contact columns repeating all
 * three. Those are chips again here, with the mail and phone behind icons.
 *
 * A PAGE at a time. Each row is a dozen cells with nested spans and a button — roughly 30
 * DOM nodes — and at ~1,900 closed records that is ~55,000 nodes built synchronously,
 * while an `<input type="date">` fires onChange for every segment you type. Picking a date
 * used to rebuild the whole table several times and the tab went Unresponsive. The counts
 * above and Export Excel still work off the full filtered set; only the DOM is paged.
 *
 * SEARCH NARROWS THIS TABLE AND NOTHING ELSE. It used to leak into the headline "Total
 * Closed Calls" and the share percentage, so typing a customer's name silently rewrote
 * numbers that were supposed to describe the whole period.
 */
export function LedgerTable({
  rows,
  startIndex,
  totalInPeriod,
  matchingCount,
  searchQuery,
  setSearchQuery,
  page,
  pageCount,
  pageSize,
  setPage,
  preset,
  repeatWoIds,
  onOpenCase,
  onFeedback,
}: Readonly<{
  /** The current page of rows. */
  rows: readonly ReportRow[];
  startIndex: number;
  /** Every closed row in the period + region, search ignored. */
  totalInPeriod: number;
  /** How many of those the search matched. Equal to `totalInPeriod` with no search. */
  matchingCount: number;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  page: number;
  pageCount: number;
  pageSize: number;
  setPage: (page: number) => void;
  preset: ClosedCallsPeriodPreset;
  /** Work orders the repeat-visit report flagged as unpaid callbacks. */
  repeatWoIds: ReadonlySet<string>;
  onOpenCase: (row: ReportRow) => void;
  /** null for a view-only session — the column then shows a dash. */
  onFeedback: ((row: ReportRow) => void) | null;
}>) {
  const searching = searchQuery.trim().length > 0;

  return (
    <div className="ccCard">
      <div className="ccLedgerHead">
        <h2>Closed call records</h2>
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search ticket, WO, engineer, customer, product…"
          aria-label="Search closed call records"
        />
        <span className="ccCnt">
          {searching ? (
            <>
              <b>{formatNumber(matchingCount)}</b> matching of{" "}
              {formatNumber(totalInPeriod)} in period
            </>
          ) : (
            <>
              <b>{formatNumber(totalInPeriod)}</b> in period
            </>
          )}
        </span>
      </div>

      <div className="ccTbl">
        <table className="ccTable">
          <thead>
            <tr>
              <th>#</th>
              <th>Ticket ID</th>
              <th>ASP / Region</th>
              <th>WO OTC</th>
              <th>Engineer</th>
              <th>Customer / Segment</th>
              <th className="ccNum">WIP aging</th>
              <th>Created</th>
              <th>Closed date</th>
              <th>Customer status</th>
              <th>RTPL status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="ccEmpty">
                  {searching
                    ? `No closed call records matching “${searchQuery.trim()}”.`
                    : preset === "today"
                      ? "No same-day closures on today’s report yet."
                      : "No closed call records for this period."}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const output = rowOutput(row);
                const ticketId = text(output, "Ticket ID");
                const asp = getRowAspCode(output);
                const regionName = getRowRegionName(asp);
                const otc = firstText(output, "WO OTC CODE", "WO OTC Code");
                const engineer = text(output, "Engineer");
                const customer = firstText(output, "Customer Name", "Customer");
                const account = text(output, "Account Name");
                const segment = text(output, "Segment");
                const mail = text(output, "Customer Mail");
                const contact = text(output, "Contact");
                const aging = firstText(output, "WIP aging", "WIP Aging");
                const created = text(output, "Case Created Time");
                // Comes from the imported closure table, not a calculation — "—" until an
                // import supplies it.
                const closedDate = text(output, "Case Closed Date");
                const rtpl = text(output, "RTPL status");
                const feedback = readFeedback(output);
                const flexReported = hasFlexClosureOutcome(output);
                const isRepeat = ticketId !== "" && repeatWoIds.has(ticketId.toUpperCase());
                const primary = account || customer || "—";

                return (
                  <tr
                    key={row.serialNo ?? `${ticketId}-${startIndex + index}`}
                    className="ccClick"
                    onClick={() => onOpenCase(row)}
                  >
                    <td className="ccMuted">{startIndex + index + 1}</td>
                    <td>
                      <button
                        type="button"
                        className="ccTk"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenCase(row);
                        }}
                      >
                        {ticketId || "—"}
                      </button>
                      {isRepeat && (
                        <>
                          {" "}
                          <span
                            className="ccGap ccR"
                            title="Repeat visit inside the vendor window — not paid"
                          >
                            repeat
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      {regionName}{" "}
                      <span className="ccSubline">{asp}</span>
                    </td>
                    <td>{otc || "—"}</td>
                    <td>{engineer || "—"}</td>
                    <td>
                      <div className="ccChips">
                        {segment && <span className="ccSegChip">{segment}</span>}
                        <span title={primary}>
                          {primary.length > 24 ? `${primary.slice(0, 24)}…` : primary}
                        </span>
                        {mail && <span title={mail}>✉</span>}
                        {contact && <span title={contact}>☎</span>}
                      </div>
                      {account && customer && account !== customer && (
                        <div className="ccSubline">{customer}</div>
                      )}
                    </td>
                    <td className="ccNum">{aging ? `${aging}d` : "—"}</td>
                    <td>{created || "—"}</td>
                    <td>{closedDate || "—"}</td>
                    <td>
                      {feedback ? (
                        <>
                          <span className="ccSt ccClosed">
                            {feedback.callStatus || "Captured"}
                          </span>
                          {feedback.feedback && (
                            <div className="ccSubline ccInk2">{feedback.feedback}</div>
                          )}
                        </>
                      ) : (
                        <span className="ccSt ccNone">Not contacted</span>
                      )}
                    </td>
                    <td>
                      {rtpl || "—"}
                      {!flexReported && (
                        <div
                          className="ccSubline ccWarnText"
                          title="Flex has not reported how this call ended, so its outcome is unknown rather than assumed billable"
                        >
                          no Flex closure
                        </div>
                      )}
                    </td>
                    <td>
                      {onFeedback ? (
                        <button
                          type="button"
                          className={`ccFb${feedback ? " ccDone" : ""}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onFeedback(row);
                          }}
                        >
                          {feedback ? "Edit feedback" : "Feedback"}
                        </button>
                      ) : (
                        <span className="ccMuted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="ccPager">
          <button
            type="button"
            className="ccBtn ccSm"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page + 1} of {formatNumber(pageCount)} · {pageSize} per page
          </span>
          <button
            type="button"
            className="ccBtn ccSm"
            disabled={page >= pageCount - 1}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
