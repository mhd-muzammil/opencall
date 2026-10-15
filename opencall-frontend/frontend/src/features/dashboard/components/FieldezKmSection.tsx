"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { isApiAuthError } from "../../../lib/api/http";
import {
  getFieldezKm,
  getFieldezKmDay,
  type EngineerKmDays,
  type FieldezKmCell,
  type FieldezKmDay,
  type FieldezKmMissing,
  type FieldezKmRange,
  type RouteKmCell,
  type RouteKmPoint,
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
import { CasesLine, CasesTotal, KmLabel, casesRowTotal, casesTotals, casesWords, type CasesById } from "./KmCases";

/**
 * FIELDEZ: under ROUTE KM, the same FSEs, days and road, with one difference.
 * A Check-in is not where the app was when it was pressed but where FieldEZ
 * recorded its work order's "Problem Resolution" -- the Login, those places,
 * the Logout, in time order, as Ola Maps measures the road between them.
 *
 * A check-in FieldEZ has no such place for is left out, never put back at the
 * app's position, and its day is marked. FieldEZ's places come in as the
 * FieldEZ tool reads the work orders, so a day can wait for it before Ola
 * measures it; the table asks again until none are left, as ROUTE KM does.
 */

// Ola allows a few routes a minute; asking more often would only find the same
// days still waiting.
const POLL_MS = 15_000;

// While the only days left wait for the FieldEZ tool -- which reads work orders
// every half hour -- asking every 15 s would find the same days. Asked this
// often instead, so an open report still fills in when the tool has read them.
const FIELDEZ_POLL_MS = 5 * 60_000;

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

const SUBTITLE = "Login → Problem Resolution places (FieldEZ) → Logout · road km by Ola Maps";

/** What the "*" on a day says: check-ins left out of it for want of a FieldEZ place. */
const missingTitle = (count: number) =>
  `${count} check-${count === 1 ? "in" : "ins"} had no FieldEZ Problem Resolution location`;

/** Why a check-in was left out of its day, in words. */
const MISSING_REASON: Record<FieldezKmMissing["reason"], string> = {
  no_wo: "the case has no WO",
  not_in_fieldez: "WO not found in FieldEZ",
  no_problem_resolution: "no Problem Resolution location in FieldEZ",
  fieldez_failed: "FieldEZ could not be read for this WO",
  not_read: "not read from FieldEZ in time (over 31 days old)",
};

/**
 * A FIELDEZ day in ROUTE KM's terms, so ROUTE KM's own helpers print it and
 * add it up: a day waiting for FieldEZ is, like one Ola has not got to, not
 * measured yet -- it reads "…" and adds nothing.
 */
const asRouteCell = (cell: FieldezKmCell): RouteKmCell => ({
  ...cell,
  status: cell.status === "waiting" ? "pending" : cell.status,
});

/**
 * How many check-ins a day left out -- on a km, a dash or a day Ola could not
 * route alike: each says so. A day not yet measured (pending, or waiting for
 * FieldEZ) has not decided anything to leave out.
 */
const leftOut = (cell: FieldezKmCell | undefined) =>
  cell && cell.status !== "pending" && cell.status !== "waiting" ? Number(cell.missing) || 0 : 0;

// Nothing picked, or its answer not here yet.
const NO_POINTS: RouteKmPoint[] = [];
// Nothing picked, or Payroll's answer before it read anything (no Ola key).
const NO_MISSING: FieldezKmMissing[] = [];

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
  | { seq: number; status: "ready"; day: FieldezKmDay }
  | { seq: number; status: "failed"; message: string };

export interface FieldezKmSectionProps {
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
  /**
   * Each FSE's cases per day, asked by the panel: a line under each day's km
   * and a Cases column after Total km. Without it the table is as it was.
   */
  cases?: CasesById;
}

export default function FieldezKmSection({
  token,
  fromIso,
  toIso,
  days,
  engineers,
  shown,
  onSessionExpired,
  cases,
}: FieldezKmSectionProps) {
  // Answers are kept with the question they answer, so one for another cycle,
  // or for other FSEs, is never shown under this one.
  const [range, setRange] = useState<{ key: string; answer: FieldezKmRange } | null>(null);
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
      getFieldezKm(token, fromIso, toIso, engineerIds)
        .then((answer) => {
          if (!active) return;
          failedInARow = 0;
          setRangeError(null);
          setRange({ key, answer });
          // Each answer is what Payroll had time to measure, from the places
          // the FieldEZ tool had read. While days are left for Ola, or today's
          // are still to be read again, ask again soon: they fill in a few at a
          // time. Days waiting only for the FieldEZ tool: ask again slowly.
          if (answer.pending > 0 || (answer.rechecking ?? 0) > 0) {
            again = setTimeout(ask, POLL_MS);
          } else if ((answer.waiting ?? 0) > 0) {
            again = setTimeout(ask, FIELDEZ_POLL_MS);
          }
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
          setRangeError({ key, message: e instanceof Error ? e.message : "Failed to load the FieldEZ km", stopped });
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
    getFieldezKmDay(token, pick.engineerId, pick.day)
      .then((day) => {
        if (!active) return;
        setDayAnswer({ seq, status: "ready", day });
        // Asking for one day can measure it again -- today's, whose places
        // moved since the table was filled. The table then takes the day's
        // own answer, so the cell, the totals and the map say the same. Not a
        // failure, nor a day now waiting for FieldEZ: the cell keeps its
        // figure, so it can be clicked to try again, and the map says why.
        if (day.status === "pending" || day.status === "failed" || day.status === "waiting") return;
        const cell: FieldezKmCell = {
          km: day.status === "ready" ? day.km : null,
          points: day.points.length,
          status: day.status,
          office: day.points.some((point) => point.office),
          missing: day.missing?.length ?? 0,
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
  const waitingDays = answer?.waiting ?? 0;
  // Each FSE's days as Payroll sent them, for what only FIELDEZ has: the days
  // waiting for FieldEZ and the check-ins left out.
  const fieldezCellsById = useMemo(
    () => new Map((answer?.engineers ?? []).map((row) => [row.engineer_id, row.days] as const)),
    [answer],
  );
  // The same days in ROUTE KM's terms, for its helpers to print and add up.
  const cellsById = useMemo(
    () =>
      new Map(
        Array.from(fieldezCellsById, ([engineerId, fieldezDays]) => {
          const routeDays: Record<string, RouteKmCell> = {};
          for (const [day, cell] of Object.entries(fieldezDays)) routeDays[day] = asRouteCell(cell);
          return [engineerId, routeDays] as const;
        }),
      ),
    [fieldezCellsById],
  );
  const totals = useMemo(() => routeKmTotals(shown, days, cellsById), [shown, days, cellsById]);
  const caseTotals = useMemo(() => (cases ? casesTotals(shown, days, cases) : null), [cases, shown, days]);

  // Only the answer for THIS pick. Between a click and its answer the last
  // pick's route would otherwise stay drawn under the new name.
  const shownAnswer = pick && dayAnswer?.seq === pick.seq ? dayAnswer : null;

  // A later answer can bring the picked day a new figure -- measured again
  // since the map asked for it. The map then asks again, so it never shows
  // another route than the one the cell's km is, nor another list of the
  // check-ins left out. Only on a new answer, so a day whose own answer
  // matches the cell is never asked for twice.
  // So does a picked day that turned waiting -- a check-in today whose work
  // order the FieldEZ tool has not read -- or stopped waiting.
  useEffect(() => {
    if (!pick || shownAnswer?.status !== "ready") return;
    const cell = fieldezCellsById.get(pick.engineerId)?.[pick.day];
    const was = shownAnswer.day.status;
    const turned =
      (was === "ready" && cell?.status === "waiting") || (was === "waiting" && cell?.status === "ready");
    const moved =
      was === "ready" &&
      cell?.status === "ready" &&
      (cell.km !== shownAnswer.day.km ||
        cell.points !== shownAnswer.day.points.length ||
        leftOut(cell) !== (shownAnswer.day.missing?.length ?? 0));
    if (turned || moved) {
      pickCount.current += 1;
      setPick({ ...pick, seq: pickCount.current });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on a new answer only, see above
  }, [answer]);
  const routeDay = shownAnswer?.status === "ready" ? shownAnswer.day : null;
  const points = routeDay?.points ?? NO_POINTS;
  const missingList = routeDay?.missing ?? NO_MISSING;
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
            ? "No route: fewer than two places this day."
            : shownAnswer.day.status === "failed"
              ? `Ola could not measure this day${shownAnswer.day.error ? ` (${shownAnswer.day.error})` : ""}${
                  shownAnswer.day.final ? "." : "; it is tried again later."
                }`
              : shownAnswer.day.status === "pending"
                ? "Not measured yet: Ola has not got to this day."
                : shownAnswer.day.status === "waiting"
                  ? `Waiting for FieldEZ: the FieldEZ tool has not read ${
                      (shownAnswer.day.waiting ?? 0) > 0 ? `${shownAnswer.day.waiting} of ` : ""
                    }this day's work orders yet.`
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
    // failed, Ola had not measured it or could not, or FieldEZ's places for
    // it were not in yet.
    const retry =
      shownAnswer?.status === "failed" ||
      routeDay?.status === "failed" ||
      routeDay?.status === "pending" ||
      routeDay?.status === "waiting";
    if (pick && pick.engineerId === engineerId && pick.day === day && !retry) return;
    pickCount.current += 1;
    setPick({ engineerId, name, day, seq: pickCount.current });
  };

  // `pending` counts FSE-days -- one per FSE per day -- not calendar days.
  const cellsLeft = `${pending} FSE-${pending === 1 ? "day" : "days"} left`;
  const measuring =
    pending > 0
      ? answer?.measured_now === 0
        ? `Waiting for Ola… ${cellsLeft}. It allows a few a minute; this goes on by itself.`
        : `Measuring… ${cellsLeft}. Ola allows a few a minute, so this fills in by itself.`
      : rechecking > 0
        ? "Checking today's places for new check-ins…"
        : null;
  // Said beside Ola's, not instead of it: the two wait on different things.
  const waitingForFieldez =
    waitingDays > 0
      ? `Waiting for FieldEZ… ${waitingDays} FSE-${
          waitingDays === 1 ? "day" : "days"
        }: the FieldEZ tool has not read their work orders yet.`
      : null;
  const status = error
    ? rangeError?.stopped
      ? `Could not load the FieldEZ km: ${error}`
      : `Could not reach Payroll just now; asking again… (${error})`
    : loading
      ? "Loading the FieldEZ km…"
      : [measuring, waitingForFieldez].filter(Boolean).join(" ") || null;

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
  const missingShown = shown.some((row) => {
    const cells = row.engineer_id != null ? fieldezCellsById.get(row.engineer_id) : undefined;
    return days.some((day) => leftOut(cells?.[day]) > 0);
  });

  // One line, so the table starts level with the map beside it. What is still
  // being measured is said under the table instead, where it has room on any
  // screen and does not move the table when its count changes.
  const heading = (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "16px 0 8px", minWidth: 0 }}>
      <h3
        data-testid="fieldez-km-title"
        style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827", whiteSpace: "nowrap" }}
      >
        FIELDEZ
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
          data-testid="fieldez-km-status"
          // Announced only when something went wrong: the count changes on
          // every poll of a fill, and each change would be read out.
          {...(error ? { role: "status" } : {})}
          style={{ color: error ? "#dc2626" : "#6b7280" }}
        >
          {status}
        </div>
      )}
      {failedShown > 0 && (
        <div data-testid="fieldez-km-failed-note" style={{ color: "#b91c1c" }}>
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
        <div data-testid="fieldez-km-office-note">
          <span aria-hidden="true" style={{ color: "#b45309", fontWeight: 700 }}>
            •
          </span>{" "}
          {OFFICE_TITLE}, so that day&apos;s km starts or ends there.
        </div>
      )}
      {missingShown && (
        <div data-testid="fieldez-km-missing-note">
          <span aria-hidden="true" style={{ color: "#9ca3af", fontWeight: 700 }}>
            *
          </span>{" "}
          A check-in with no FieldEZ Problem Resolution location is left out of that day&apos;s km, never put at the
          app&apos;s check-in place instead. Click a km to see which.
        </div>
      )}
    </div>
  );

  // Without an Ola key Payroll measures nothing, and a table of dots would
  // look like a wait that never ends.
  if (answer && !answer.configured) {
    return (
      <div data-testid="fieldez-km">
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
    <div data-testid="fieldez-km" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
      <div style={{ flex: "3 1 520px", minWidth: 0 }}>
        {heading}
        <div
          data-testid="fieldez-km-grid"
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
                {cases && (
                  <th style={{ ...cellBase, position: "sticky", top: 0, zIndex: 3, background: "#f9fafb", color: "#1d4ed8" }}>
                    Cases
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, index) => {
                const cells = row.engineer_id != null ? cellsById.get(row.engineer_id) : undefined;
                const fieldezCells = row.engineer_id != null ? fieldezCellsById.get(row.engineer_id) : undefined;
                const rowTotals = routeKmRowTotals(cells, days);
                return (
                  <tr key={`${row.engineer_id ?? "x"}-${row.engineer_name}`} data-testid="fieldez-km-row">
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
                      // A km with check-ins left out for want of a FieldEZ
                      // place: marked, so it does not pass for the whole day's.
                      const missing = leftOut(fieldezCells?.[day]);
                      // A measured road has a route to show; so does any day
                      // that left a check-in out -- its list, under the map. A
                      // plain dash, a day Ola could not route and one still
                      // waiting have neither.
                      const canPick = engineerId != null && ((cell?.status === "ready" && km !== "-") || missing > 0);
                      const picked = canPick && pick?.engineerId === engineerId && pick.day === day;
                      const failed = cell?.status === "failed";
                      // Not measured yet: Ola has not got to it, or the FieldEZ
                      // tool has not read its work orders.
                      const waiting = cell == null || cell.status === "pending";
                      const forFieldez = fieldezCells?.[day]?.status === "waiting";
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
                      const missingMark = missing > 0 && (
                        <span
                          aria-hidden="true"
                          title={missingTitle(missing)}
                          style={{
                            marginLeft: 2,
                            color: picked ? "#cbd5e1" : "#9ca3af",
                            fontSize: 11,
                            fontWeight: 700,
                            userSelect: "none",
                            WebkitUserSelect: "none",
                          }}
                        >
                          *
                        </span>
                      );
                      // The day's cases, on a line under its km and in words.
                      const dayCases = engineerId != null ? cases?.get(engineerId)?.[day] : undefined;
                      const caseWords = casesWords(dayCases);
                      return (
                        <td
                          key={day}
                          title={
                            (failed
                              ? cell.final
                                ? FAILED_FINAL_TITLE
                                : FAILED_TITLE
                              : `${row.engineer_name} · ${fullDate(day)}${atOffice ? ` · ${OFFICE_TITLE}` : ""}${
                                  missing > 0 ? ` · ${missingTitle(missing)}` : ""
                                }`) + (caseWords ? ` · ${caseWords}` : "")
                          }
                          // What a glyph means, for a reader that cannot see it.
                          {...(failed
                            ? { "aria-label": `could not be measured${caseWords ? `, ${caseWords}` : ""}` }
                            : forFieldez
                              ? { "aria-label": `waiting for FieldEZ${caseWords ? `, ${caseWords}` : ""}` }
                              : waiting
                                ? { "aria-label": `not measured yet${caseWords ? `, ${caseWords}` : ""}` }
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
                              data-testid="fieldez-km-day"
                              aria-pressed={picked}
                              aria-label={`${km} road km${atOffice ? " (from or to the office)" : ""}${
                                missing > 0 ? ` (${missingTitle(missing)})` : ""
                              }${caseWords ? `, ${caseWords}` : ""}: show ${row.engineer_name}'s route on ${fullDate(day)}`}
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
                              <KmLabel picked={picked} />
                              {km}
                              {officeMark}
                              {missingMark}
                              <CasesLine cell={dayCases} picked={picked} />
                            </button>
                          ) : (
                            <>
                              <KmLabel />
                              {km}
                              {officeMark}
                              {missingMark}
                              {/* Read as it is unless the cell's label says it. */}
                              <CasesLine cell={dayCases} labelled={failed || forFieldez || waiting} />
                            </>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ ...cellBase, textAlign: "center" }}>{rowTotals.days}</td>
                    <td
                      style={{ ...cellBase, textAlign: "right", fontWeight: 700, color: "#1d4ed8" }}
                      data-testid="fieldez-km-total"
                    >
                      {formatKm(rowTotals.km) === "-" ? "0" : formatKm(rowTotals.km)}
                    </td>
                    {cases && (
                      <td style={{ ...cellBase, textAlign: "right" }} data-testid="fieldez-km-cases-total">
                        <CasesTotal total={casesRowTotal(row.engineer_id != null ? cases.get(row.engineer_id) : undefined, days)} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {/* Each day's total over the FSEs on screen, and the cycle's --
                  measured days only, so while some wait these can be short. */}
              <tr data-testid="fieldez-km-footer">
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
                {cases && (
                  <td
                    style={{
                      ...cellBase,
                      position: "sticky",
                      bottom: 0,
                      zIndex: 3,
                      background: "#f9fafb",
                      textAlign: "right",
                      fontWeight: 700,
                    }}
                  >
                    <CasesTotal total={caseTotals} />
                  </td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
        {notes}
      </div>

      <div data-testid="fieldez-km-route" style={{ flex: "2 1 360px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "16px 0 8px", minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827", whiteSpace: "nowrap" }}>
            Route map
          </h3>
          <span
            data-testid="fieldez-km-label"
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
              data-testid="fieldez-km-google"
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
          data-testid="fieldez-km-box"
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
            data-testid="fieldez-km-google-map"
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
        {(routeNote || googleUrl || dayAtOffice || missingList.length > 0) && (
          <div style={{ marginTop: 8, display: "grid", gap: 4, fontSize: 12, color: "#6b7280" }}>
            {routeNote && (
              <div
                data-testid="fieldez-km-note"
                role="status"
                style={{ color: dayFailed ? "#b91c1c" : "#374151", fontSize: 12.5 }}
              >
                {routeNote}
              </div>
            )}
            {googleUrl && (
              <div data-testid="fieldez-km-map-note">
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
              <div data-testid="fieldez-km-map-office">
                <span aria-hidden="true" style={{ color: "#b45309", fontWeight: 700 }}>
                  •
                </span>{" "}
                {OFFICE_TITLE}: this route starts or ends there, not at a GPS fix.
              </div>
            )}
            {/* The check-ins this day's route leaves out, and why: the "*"
                in the table, named. */}
            {missingList.length > 0 && (
              <div data-testid="fieldez-km-missing">
                {`${missingList.length} check-${missingList.length === 1 ? "in" : "ins"} left out of this route:`}
                <ul style={{ margin: "2px 0 0", paddingLeft: 18 }}>
                  {missingList.map((item, index) => (
                    // By place in the list: one case can be checked in twice in
                    // a day, and a check-in need not have a case number.
                    <li key={index}>
                      {`${item.case_number ?? "—"} · ${item.wo ?? "—"} · ${MISSING_REASON[item.reason] ?? item.reason}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
