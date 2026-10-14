"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { isApiAuthError } from "../../../lib/api/http";
import {
  getRouteKm,
  getRouteKmDay,
  type EngineerKmDays,
  type RouteKmDay,
  type RouteKmPoint,
  type RouteKmRange,
} from "../../../lib/payrollTrackingApiClient";
import { formatKm } from "../../../lib/kmReport";
import {
  GOOGLE_AREA_EMBED_URL,
  googleMapsDirectionsUrl,
  googleMapsEmbedUrl,
  routeKmCellText,
  routeKmRowTotals,
  routeKmTotals,
} from "../../../lib/routeKm";

/**
 * ROUTE KM: under the RTPL APP KM table, the same FSEs and days measured another
 * way. Not the phone's GPS trail but the road between the places the engineer
 * marked -- their Login, each Check-in, their Logout, in time order -- as Ola
 * Maps measures it, so a day reads as what a map app says the trip was.
 *
 * Ola's free tier allows only a few routes a minute, so Payroll measures a few
 * days per question and keeps them. The table asks again until none are left,
 * and fills in as it goes.
 */

// Ola allows a few routes a minute; asking more often would only find the same
// days still waiting.
const POLL_MS = 15_000;

// Filling a cycle takes tens of minutes of polls, and one failed question -- a
// redeploy, a slow Ola holding a Payroll worker -- must not end it. Asked again
// this many times in a row before the table says it has stopped.
const MAX_FAILED_ASKS = 4;

// Google's directions page takes ten places at most (see routeKm.ts).
const GOOGLE_MAX_STOPS = 10;

/** "2026-10-13" -> "13". */
const dayOfMonth = (iso: string) => String(Number(iso.slice(8, 10)));

/** "2026-10-13" -> "Tue". */
const weekday = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });

const isSunday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 0;

/** "2026-10-13" -> "13 Oct 2026". */
const fullDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

// Frozen columns: their widths are fixed so each knows where the next begins.
const SNO_W = 48;
const NAME_W = 180;
const PLACE_W = 112;

const cellBase: CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #e5e7eb",
  borderRight: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
};

// Border-box, or the padding is added to the width and each frozen column
// comes out wider than the offset the next one is pinned at -- the next one
// then sits over the end of it once the days scroll.
const frozen = (left: number, width: number, background: string, z: number): CSSProperties => ({
  position: "sticky",
  left,
  width,
  minWidth: width,
  maxWidth: width,
  boxSizing: "border-box",
  background,
  zIndex: z,
});

// A km that can be clicked. Every part of the app's own button look -- a 40px
// filled pill with white text -- is undone, so the cell still reads as a cell.
const dayButton: CSSProperties = {
  font: "inherit",
  display: "block",
  width: "100%",
  minHeight: 0,
  margin: 0,
  padding: "8px 10px",
  border: 0,
  borderRadius: 0,
  fontVariantNumeric: "tabular-nums",
  cursor: "pointer",
  // The focus ring inside the cell, where the next cell cannot paint over it.
  outlineOffset: -2,
  // A figure can still be double-clicked and copied, as it could as plain text.
  userSelect: "text",
  WebkitUserSelect: "text",
};

// As tall as the table may grow, so the two end together, and never so short
// that a route cannot be read.
const MAP_HEIGHT = "max(360px, calc(100vh - 320px))";

// Every kind of failure ends here -- no road found, Ola down, a bad answer --
// so the words do not claim to know which.
const FAILED_TITLE = "Ola could not measure this day; it is tried again later";
// A failed day Payroll has settled for good: no retry is coming.
const FAILED_FINAL_TITLE = "Ola could not measure this day";

const OFFICE_TITLE = "A Login or Logout with no GPS was placed at the FSE's office";

const SUBTITLE = "Login → Check-ins → Logout · road km by Ola Maps";

// Nothing picked, or its answer not here yet.
const NO_POINTS: RouteKmPoint[] = [];

/** The day the map is showing: one cell of the table. */
interface RoutePick {
  engineerId: number;
  name: string;
  day: string;
  /**
   * This pick's own number. Two days of one engineer share an engineer id; the
   * answer fetched for a pick carries its number, so one pick's route is never
   * drawn under another's name.
   */
  seq: number;
}

type DayAnswer =
  | { seq: number; status: "ready"; day: RouteKmDay }
  | { seq: number; status: "failed"; message: string };

export interface RouteKmSectionProps {
  token: string;
  fromIso: string;
  toIso: string;
  /** The RTPL table's days, so the two tables line up day for day. */
  days: string[];
  /** Every matched FSE of the cycle: who Payroll is asked about. */
  engineers: EngineerKmDays[];
  /** What the region box and the search leave on screen: what is shown. */
  shown: EngineerKmDays[];
  onSessionExpired: () => void;
}

export default function RouteKmSection({
  token,
  fromIso,
  toIso,
  days,
  engineers,
  shown,
  onSessionExpired,
}: RouteKmSectionProps) {
  // Answers are kept with the question they answer, so one for another cycle,
  // or for other FSEs, is never shown under this one.
  const [range, setRange] = useState<{ key: string; answer: RouteKmRange } | null>(null);
  // `stopped` once MAX_FAILED_ASKS questions in a row have failed; before that
  // the table is still asking.
  const [rangeError, setRangeError] = useState<{ key: string; message: string; stopped: boolean } | null>(null);
  // The day clicked in the table, and what came back for it.
  const [pick, setPick] = useState<RoutePick | null>(null);
  const [dayAnswer, setDayAnswer] = useState<DayAnswer | null>(null);
  const pickCount = useRef(0);
  const mapBox = useRef<HTMLDivElement>(null);
  // The panel hands a new function on every render; the questions in flight
  // must not start over because of it.
  const onExpired = useRef(onSessionExpired);
  onExpired.current = onSessionExpired;

  // Another cycle is another table: the day the map was showing is not in it.
  const cycle = `${fromIso}|${toIso}`;
  const [pickCycle, setPickCycle] = useState(cycle);
  if (pickCycle !== cycle) {
    setPickCycle(cycle);
    setPick(null);
  }

  // Everyone in the cycle is asked about, whatever the boxes and the search
  // leave on screen: narrowing the table must not start the measuring over.
  const idsKey = useMemo(
    () => [...new Set(engineers.flatMap((row) => (row.engineer_id != null ? [row.engineer_id] : [])))].join(","),
    [engineers],
  );
  const requestKey = `${cycle}|${idsKey}`;
  // For one render after the cycle arrows, the panel hands over the new cycle
  // with the old cycle's FSEs and days; asked then, Payroll would do a poll's
  // work for an answer that is thrown away.
  const daysFitCycle = days.length === 0 || (days[0]! >= fromIso && days[days.length - 1]! <= toIso);

  useEffect(() => {
    const engineerIds = idsKey ? idsKey.split(",").map(Number) : [];
    if (engineerIds.length === 0 || !daysFitCycle) return;
    const key = `${fromIso}|${toIso}|${idsKey}`;
    let active = true;
    let again: ReturnType<typeof setTimeout> | undefined;
    let failedInARow = 0;
    setRangeError(null);
    const ask = () => {
      getRouteKm(token, fromIso, toIso, engineerIds)
        .then((answer) => {
          if (!active) return;
          failedInARow = 0;
          setRangeError(null);
          setRange({ key, answer });
          // Each answer is what Payroll had time to measure. While days are
          // left, or today's are still to be read again, ask again: they fill
          // in a few at a time.
          if (answer.pending > 0 || (answer.rechecking ?? 0) > 0) again = setTimeout(ask, POLL_MS);
        })
        .catch((e) => {
          if (!active) return;
          if (isApiAuthError(e)) {
            // Stop asking: every later question would fail the same way.
            onExpired.current();
            return;
          }
          failedInARow += 1;
          const stopped = failedInARow >= MAX_FAILED_ASKS;
          setRangeError({ key, message: e instanceof Error ? e.message : "Failed to load the route km", stopped });
          // What was measured stays on screen; the rest is asked for again.
          if (!stopped) again = setTimeout(ask, POLL_MS);
        });
    };
    ask();
    return () => {
      active = false;
      if (again !== undefined) clearTimeout(again);
    };
  }, [token, fromIso, toIso, idsKey, daysFitCycle]);

  // The clicked day: its places in order, and Ola's road through them.
  useEffect(() => {
    if (!pick) return;
    let active = true;
    const { seq } = pick;
    getRouteKmDay(token, pick.engineerId, pick.day)
      .then((day) => {
        if (!active) return;
        setDayAnswer({ seq, status: "ready", day });
        // Asking for one day can measure it again -- today's, whose places
        // moved since the table was filled. The table then takes the day's
        // own answer, so the cell, the totals and the map say the same. Not a
        // failure: the cell keeps its figure, so it can be clicked to try
        // again, and the map says what went wrong.
        if (day.status === "pending" || day.status === "failed") return;
        const cell = {
          km: day.status === "ready" ? day.km : null,
          points: day.points.length,
          status: day.status,
          office: day.points.some((point) => point.office),
        };
        setRange((current) =>
          current
            ? {
                key: current.key,
                answer: {
                  ...current.answer,
                  engineers: current.answer.engineers.map((row) =>
                    row.engineer_id === day.engineer_id && day.date in row.days
                      ? { ...row, days: { ...row.days, [day.date]: cell } }
                      : row,
                  ),
                },
              }
            : current,
        );
      })
      .catch((e) => {
        if (!active) return;
        if (isApiAuthError(e)) {
          onExpired.current();
          return;
        }
        setDayAnswer({
          seq,
          status: "failed",
          message: e instanceof Error ? e.message : "Failed to load the route",
        });
      });
    return () => {
      active = false;
    };
  }, [token, pick]);

  const answer = range?.key === requestKey ? range.answer : null;
  const error = rangeError?.key === requestKey ? rangeError.message : null;
  const loading = idsKey !== "" && answer == null && error == null;
  const pending = answer?.pending ?? 0;
  const rechecking = answer?.rechecking ?? 0;
  const cellsById = useMemo(
    () => new Map((answer?.engineers ?? []).map((row) => [row.engineer_id, row.days] as const)),
    [answer],
  );
  const totals = useMemo(() => routeKmTotals(shown, days, cellsById), [shown, days, cellsById]);

  // Only the answer for THIS pick. Between a click and its answer the last
  // pick's route would otherwise stay drawn under the new name.
  const shownAnswer = pick && dayAnswer?.seq === pick.seq ? dayAnswer : null;

  // A later answer can bring the picked day a new figure -- measured again
  // since the map asked for it. The map then asks again, so it never shows
  // another route than the one the cell's km is. Only on a new answer, so a
  // day whose own answer matches the cell is never asked for twice.
  useEffect(() => {
    if (!pick || shownAnswer?.status !== "ready" || shownAnswer.day.status !== "ready") return;
    const cell = cellsById.get(pick.engineerId)?.[pick.day];
    if (cell?.status !== "ready") return;
    if (cell.km !== shownAnswer.day.km || cell.points !== shownAnswer.day.points.length) {
      pickCount.current += 1;
      setPick({ ...pick, seq: pickCount.current });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on a new answer only, see above
  }, [answer]);
  const routeDay = shownAnswer?.status === "ready" ? shownAnswer.day : null;
  const points = routeDay?.points ?? NO_POINTS;
  const googleUrl = googleMapsDirectionsUrl(points);
  // Google's map beside the table: the picked day's places, or the region.
  const mapSrc = googleMapsEmbedUrl(points) ?? GOOGLE_AREA_EMBED_URL;
  const dayAtOffice = points.some((point) => point.office);
  const dayFailed = shownAnswer?.status === "failed" || routeDay?.status === "failed";
  const routeNote =
    pick == null
      ? null
      : shownAnswer == null
        ? "Loading the route…"
        : shownAnswer.status === "failed"
          ? `Could not load the route: ${shownAnswer.message}`
          : shownAnswer.day.status === "no_points"
            ? "No route: fewer than two places marked this day."
            : shownAnswer.day.status === "failed"
              ? `Ola could not measure this day${shownAnswer.day.error ? ` (${shownAnswer.day.error})` : ""}${
                  shownAnswer.day.final ? "." : "; it is tried again later."
                }`
              : shownAnswer.day.status === "pending"
                ? "Not measured yet: Ola has not got to this day."
                : null;

  const routeKm = routeDay?.status === "ready" ? formatKm(routeDay.km) : null;
  const stops = routeDay ? routeDay.points.length : null;
  const routeLabel = pick
    ? `${pick.name} · ${weekday(pick.day)} ${fullDate(pick.day)}${
        routeKm != null ? ` · ${routeKm === "-" ? "0" : routeKm} km` : ""
      }${stops != null ? ` · ${stops} ${stops === 1 ? "stop" : "stops"}` : ""}`
    : "Click a km to see that day's route.";

  const pickDay = (engineerId: number, name: string, day: string) => {
    // Side by side the map is in view. On a narrower screen it sits under the
    // table, often below the fold, and the click would seem to do nothing --
    // also a click on the day already shown, so this comes first.
    const box = mapBox.current;
    if (box) {
      const { top, bottom, height } = box.getBoundingClientRect();
      const visible = Math.min(bottom, window.innerHeight) - Math.max(top, 0);
      // Centred, so the notes under the map come into view with it.
      if (visible < height / 2) box.scrollIntoView?.({ block: "center" });
    }
    // The day already on the map is not asked for again -- unless asking
    // failed, or Ola had not measured it or could not.
    const retry = shownAnswer?.status === "failed" || routeDay?.status === "failed" || routeDay?.status === "pending";
    if (pick && pick.engineerId === engineerId && pick.day === day && !retry) return;
    pickCount.current += 1;
    setPick({ engineerId, name, day, seq: pickCount.current });
  };

  // `pending` counts FSE-days -- one per FSE per day -- not calendar days.
  const cellsLeft = `${pending} FSE-${pending === 1 ? "day" : "days"} left`;
  const status = error
    ? rangeError?.stopped
      ? `Could not load the route km: ${error}`
      : `Could not reach Payroll just now; asking again… (${error})`
    : loading
      ? "Loading the route km…"
      : pending > 0
        ? answer?.measured_now === 0
          ? `Waiting for Ola… ${cellsLeft}. It allows a few a minute; this goes on by itself.`
          : `Measuring… ${cellsLeft}. Ola allows a few a minute, so this fills in by itself.`
        : rechecking > 0
          ? "Checking today's places for new check-ins…"
          : null;

  // What the totals leave out, said under the table rather than only in a
  // tooltip: days Ola could not measure, among the FSEs on screen -- and how
  // many of them will be tried again, which a day settled for good will not.
  let failedShown = 0;
  let failedRetried = 0;
  for (const row of shown) {
    const cells = row.engineer_id != null ? cellsById.get(row.engineer_id) : undefined;
    for (const day of days) {
      const cell = cells?.[day];
      if (cell?.status !== "failed") continue;
      failedShown += 1;
      if (!cell.final) failedRetried += 1;
    }
  }
  const officeShown = shown.some((row) => {
    const cells = row.engineer_id != null ? cellsById.get(row.engineer_id) : undefined;
    return days.some((day) => cells?.[day]?.status === "ready" && cells[day]?.office);
  });

  // One line, so the table starts level with the map beside it. What is still
  // being measured is said under the table instead, where it has room on any
  // screen and does not move the table when its count changes.
  const heading = (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "16px 0 8px", minWidth: 0 }}>
      <h3
        data-testid="route-km-title"
        style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827", whiteSpace: "nowrap" }}
      >
        ROUTE KM
      </h3>
      <span
        title={SUBTITLE}
        style={{
          fontSize: 13,
          color: "#6b7280",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          minWidth: 0,
        }}
      >
        {SUBTITLE}
      </span>
    </div>
  );

  const notes = (
    <div style={{ marginTop: 8, display: "grid", gap: 4, fontSize: 12, color: "#6b7280" }}>
      {status && (
        <div
          data-testid="route-km-status"
          // Announced only when something went wrong: the count changes on
          // every poll of a fill, and each change would be read out.
          {...(error ? { role: "status" } : {})}
          style={{ color: error ? "#dc2626" : "#6b7280" }}
        >
          {status}
        </div>
      )}
      {failedShown > 0 && (
        <div data-testid="route-km-failed-note" style={{ color: "#b91c1c" }}>
          {failedShown} {failedShown === 1 ? "day" : "days"} Ola could not measure (—) {failedShown === 1 ? "is" : "are"} not in
          the totals
          {failedRetried === 0
            ? "."
            : failedRetried === failedShown
              ? `; ${failedShown === 1 ? "it is" : "they are"} tried again later.`
              : `; ${failedRetried} of them ${failedRetried === 1 ? "is" : "are"} tried again later.`}
        </div>
      )}
      {officeShown && (
        <div data-testid="route-km-office-note">
          <span aria-hidden="true" style={{ color: "#b45309", fontWeight: 700 }}>
            •
          </span>{" "}
          {OFFICE_TITLE}, so that day&apos;s km starts or ends there.
        </div>
      )}
    </div>
  );

  // Without an Ola key Payroll measures nothing, and a table of dots would
  // look like a wait that never ends.
  if (answer && !answer.configured) {
    return (
      <div data-testid="route-km">
        {heading}
        <p style={{ color: "#b45309", margin: 0 }}>
          Payroll has no Ola Maps key, so there are no road km to show. Set OLA_MAPS_API_KEY in the Payroll
          environment.
        </p>
      </div>
    );
  }

  // The table on the left and, beside it, the map that draws whichever day is
  // clicked in it: the RTPL table's layout, so the two read alike.
  return (
    <div data-testid="route-km" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
      <div style={{ flex: "3 1 520px", minWidth: 0 }}>
        {heading}
        <div
          data-testid="route-km-grid"
          style={{
            marginTop: 0,
            overflow: "auto",
            maxHeight: "calc(100vh - 320px)",
            minHeight: 240,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#fff",
          }}
        >
          <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...cellBase, ...frozen(0, SNO_W, "#f9fafb", 4), top: 0, textAlign: "center", color: "#1d4ed8" }}>
                  S.no
                </th>
                <th style={{ ...cellBase, ...frozen(SNO_W, NAME_W, "#f9fafb", 4), top: 0, textAlign: "left", color: "#1d4ed8" }}>
                  FSE
                </th>
                <th
                  style={{
                    ...cellBase,
                    ...frozen(SNO_W + NAME_W, PLACE_W, "#f9fafb", 4),
                    top: 0,
                    textAlign: "left",
                    color: "#1d4ed8",
                  }}
                >
                  Region
                </th>
                {days.map((day) => (
                  <th
                    key={day}
                    title={fullDate(day)}
                    style={{
                      ...cellBase,
                      position: "sticky",
                      top: 0,
                      zIndex: 3,
                      minWidth: 60,
                      textAlign: "center",
                      // Sundays shaded, so a week reads as a week.
                      background: isSunday(day) ? "#f1f5f9" : "#f9fafb",
                      color: "#b45309",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{dayOfMonth(day)}</div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: "#6b7280" }}>{weekday(day)}</div>
                  </th>
                ))}
                <th style={{ ...cellBase, position: "sticky", top: 0, zIndex: 3, background: "#f9fafb", color: "#1d4ed8" }}>
                  Days
                </th>
                <th style={{ ...cellBase, position: "sticky", top: 0, zIndex: 3, background: "#f9fafb", color: "#1d4ed8" }}>
                  Total km
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row, index) => {
                const cells = row.engineer_id != null ? cellsById.get(row.engineer_id) : undefined;
                const rowTotals = routeKmRowTotals(cells, days);
                return (
                  <tr key={`${row.engineer_id ?? "x"}-${row.engineer_name}`} data-testid="route-km-row">
                    <td style={{ ...cellBase, ...frozen(0, SNO_W, "#fff", 2), textAlign: "center" }}>{index + 1}</td>
                    <td
                      style={{
                        ...cellBase,
                        ...frozen(SNO_W, NAME_W, "#fff", 2),
                        fontWeight: 600,
                        whiteSpace: "normal",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {row.engineer_name}
                    </td>
                    <td style={{ ...cellBase, ...frozen(SNO_W + NAME_W, PLACE_W, "#fff", 2) }}>{row.branch ?? "—"}</td>
                    {days.map((day) => {
                      const cell = cells?.[day];
                      const km = routeKmCellText(cell);
                      const engineerId = row.engineer_id;
                      // A measured road has a route to show; a dash, a day Ola
                      // could not route and one still waiting have none.
                      const canPick = cell?.status === "ready" && km !== "-" && engineerId != null;
                      const picked = canPick && pick?.engineerId === engineerId && pick.day === day;
                      const failed = cell?.status === "failed";
                      const waiting = cell == null || cell.status === "pending";
                      // A km that starts or ends at the office, for want of a
                      // fix: marked, so it does not pass for a GPS-placed one --
                      // a 0 km office-to-office day too, printed as a dash.
                      const atOffice = cell?.status === "ready" && Boolean(cell.office);
                      // Not tucked inside the figure for copying: the mark is
                      // left out when the number is selected and copied.
                      const officeMark = atOffice && (
                        <span
                          aria-hidden="true"
                          style={{
                            marginLeft: 2,
                            color: picked ? "#fde68a" : "#b45309",
                            fontWeight: 700,
                            userSelect: "none",
                            WebkitUserSelect: "none",
                          }}
                        >
                          •
                        </span>
                      );
                      return (
                        <td
                          key={day}
                          title={
                            failed
                              ? cell.final
                                ? FAILED_FINAL_TITLE
                                : FAILED_TITLE
                              : `${row.engineer_name} · ${fullDate(day)}${atOffice ? ` · ${OFFICE_TITLE}` : ""}`
                          }
                          // What a glyph means, for a reader that cannot see it.
                          {...(failed
                            ? { "aria-label": "could not be measured" }
                            : waiting
                              ? { "aria-label": "not measured yet" }
                              : {})}
                          // All of the cell takes the click, also where a two-line
                          // name makes it taller than the button. The button is
                          // the way in for the keyboard; its click lands here too.
                          onClick={canPick ? () => pickDay(engineerId, row.engineer_name, day) : undefined}
                          style={{
                            ...cellBase,
                            textAlign: "center",
                            background: picked ? "#1d4ed8" : isSunday(day) ? "#f8fafc" : "#fff",
                            color: canPick ? "#111827" : failed ? "#b91c1c" : "#9ca3af",
                            ...(canPick ? { padding: 0, cursor: "pointer" } : {}),
                            // The app's hovered-row grey replaces only the background;
                            // this keeps all of a taller, two-line cell blue.
                            ...(picked ? { boxShadow: "inset 0 0 0 100vmax #1d4ed8" } : {}),
                          }}
                        >
                          {canPick ? (
                            <button
                              type="button"
                              data-testid="route-km-day"
                              aria-pressed={picked}
                              aria-label={`${km} road km${atOffice ? " (from or to the office)" : ""}: show ${row.engineer_name}'s route on ${fullDate(day)}`}
                              style={{
                                ...dayButton,
                                // The fill is the button's too: the app paints a
                                // hovered row's cells grey with !important, which
                                // would leave the white figure on light grey.
                                background: picked ? "#1d4ed8" : "transparent",
                                color: picked ? "#fff" : "#111827",
                                // The cell's own weight, as before, until picked.
                                fontWeight: picked ? 700 : "inherit",
                              }}
                            >
                              {km}
                              {officeMark}
                            </button>
                          ) : (
                            <>
                              {km}
                              {officeMark}
                            </>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ ...cellBase, textAlign: "center" }}>{rowTotals.days}</td>
                    <td
                      style={{ ...cellBase, textAlign: "right", fontWeight: 700, color: "#1d4ed8" }}
                      data-testid="route-km-total"
                    >
                      {formatKm(rowTotals.km) === "-" ? "0" : formatKm(rowTotals.km)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {/* Each day's total over the FSEs on screen, and the cycle's --
                  measured days only, so while some wait these can be short. */}
              <tr data-testid="route-km-footer">
                <td
                  colSpan={3}
                  style={{
                    ...cellBase,
                    ...frozen(0, SNO_W + NAME_W + PLACE_W, "#f9fafb", 4),
                    position: "sticky",
                    bottom: 0,
                    fontWeight: 700,
                  }}
                >
                  Total
                </td>
                {days.map((day) => (
                  <td
                    key={day}
                    style={{
                      ...cellBase,
                      position: "sticky",
                      bottom: 0,
                      zIndex: 3,
                      background: "#f9fafb",
                      textAlign: "center",
                      fontWeight: 700,
                    }}
                  >
                    {formatKm(totals.byDay[day])}
                  </td>
                ))}
                <td style={{ ...cellBase, position: "sticky", bottom: 0, zIndex: 3, background: "#f9fafb" }} />
                <td
                  style={{
                    ...cellBase,
                    position: "sticky",
                    bottom: 0,
                    zIndex: 3,
                    background: "#f9fafb",
                    textAlign: "right",
                    fontWeight: 700,
                    color: "#1d4ed8",
                  }}
                >
                  {formatKm(totals.total) === "-" ? "0" : formatKm(totals.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {notes}
      </div>

      <div data-testid="route-km-route" style={{ flex: "2 1 360px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "16px 0 8px", minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827", whiteSpace: "nowrap" }}>
            Route map
          </h3>
          <span
            data-testid="route-km-label"
            // One line, so the map starts level with the table; a long name
            // can cut it short, and the whole of it is here.
            title={routeLabel}
            style={{
              fontSize: 13,
              color: pick ? "#374151" : "#6b7280",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: 0,
            }}
          >
            {routeLabel}
          </span>
          {/* The same places on Google, by bike, to set its km beside Ola's by
              hand. A link, styled here in full: the app gives links no look of
              their own. */}
          {googleUrl && (
            <a
              data-testid="route-km-google"
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={
                points.length > GOOGLE_MAX_STOPS
                  ? `Open ${GOOGLE_MAX_STOPS} of the ${points.length} places by bike in Google Maps: the first ${GOOGLE_MAX_STOPS - 1} and the last`
                  : "Open this route by bike in Google Maps"
              }
              title={
                points.length > GOOGLE_MAX_STOPS
                  ? `Google's directions take ${GOOGLE_MAX_STOPS} places at most: this opens the first ${GOOGLE_MAX_STOPS - 1} and the last, by bike, so Google's km will be shorter than Ola's`
                  : "The same places, in the same order, by bike on Google Maps"
              }
              style={{
                // Clear of the line's height, so the map does not move down a
                // pixel when a day is picked and the link appears.
                alignSelf: "center",
                margin: "-2px 0 -2px auto",
                flexShrink: 0,
                padding: "1px 8px",
                borderRadius: 6,
                border: "1px solid #bfdbfe",
                background: "#eff6ff",
                color: "#1d4ed8",
                fontSize: 12,
                fontWeight: 600,
                lineHeight: "16px",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              {points.length > GOOGLE_MAX_STOPS
                ? `Google Maps · bike (first ${GOOGLE_MAX_STOPS - 1} + last of ${points.length})`
                : "Google Maps · bike"}
            </a>
          )}
        </div>
        <div
          ref={mapBox}
          data-testid="route-km-box"
          style={{
            height: MAP_HEIGHT,
            boxSizing: "border-box",
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid #e5e7eb",
          }}
        >
          {/* Google's own map, embedded the way Google lets anyone embed one:
              no key and no billing. The picked day's places, or the region
              before one is picked. A new frame for each, not the old one
              sent elsewhere: a frame that navigates adds to the browser's
              history, and Back would then move the map instead of leaving
              the page. */}
          <iframe
            key={mapSrc}
            data-testid="route-km-google-map"
            title={pick ? `Google map: ${routeLabel}` : "Google map"}
            src={mapSrc}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
            style={{ display: "block", width: "100%", height: "100%", border: 0 }}
          />
        </div>
        {/* Under the map, not over it: Google's own card and controls sit on
            the map, and nothing here may cover them. */}
        {(routeNote || googleUrl || dayAtOffice) && (
          <div style={{ marginTop: 8, display: "grid", gap: 4, fontSize: 12, color: "#6b7280" }}>
            {routeNote && (
              <div
                data-testid="route-km-note"
                role="status"
                style={{ color: dayFailed ? "#b91c1c" : "#374151", fontSize: 12.5 }}
              >
                {routeNote}
              </div>
            )}
            {googleUrl && (
              <div data-testid="route-km-map-note">
                {`Google's own route, by car${
                  points.length > GOOGLE_MAX_STOPS
                    ? `, through the first ${GOOGLE_MAX_STOPS - 1} places and the last`
                    : ""
                }, with its own km: Google's embedded map has no bike route, so the Google Maps button opens it by bike. The km in the table is Ola's.`}
              </div>
            )}
            {/* Google draws its own markers, so the office stand-in is said
                here, in the table's words. */}
            {dayAtOffice && (
              <div data-testid="route-km-map-office">
                <span aria-hidden="true" style={{ color: "#b45309", fontWeight: 700 }}>
                  •
                </span>{" "}
                {OFFICE_TITLE}: this route starts or ends there, not at a GPS fix.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
