// The Day Report's rows and wording, kept out of the component so the screen
// and the downloaded sheet are built from one place and tested on their own.
// Every figure is Payroll's answer for the FSE-day, as the Live Tracking day
// panel shows it -- never worked out again here.

import type { DayReportCell, DayReportMoment, DayReportResult } from "./payrollTrackingApiClient";
import { formatKm } from "./kmReport";

/** The most days one report may cover; the backend refuses more. */
export const MAX_DAY_REPORT_DAYS = 31;

/** One FSE on one day: a column of the report. */
export interface DayReportColumn {
  day: string;
  engineerId: number;
  name: string;
  cell: DayReportCell;
}

/**
 * One line of a cell. `href` makes it a link on screen; `sheet` is what the
 * downloaded sheet says instead of `text`, when the two differ.
 */
export interface DayReportLine {
  text: string;
  href?: string;
  sheet?: string;
}

const CLOCK = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

/** "2026-10-10T04:30:00Z" -> "10:00 AM", on the clock in India. */
export function clockTime(iso: string): string {
  // Newer ICU puts a narrow no-break space before AM/PM; a plain one reads the same.
  return CLOCK.format(new Date(iso)).replace(/ /g, " ");
}

const INDIA_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });

/** The day in India a moment falls on: "2026-09-03". */
export function indiaDay(iso: string): string {
  return INDIA_DAY.format(new Date(iso));
}

/** "2026-10-10" -> "10-10-2026", the way the office writes a date. */
export function sheetDate(iso: string): string {
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

/** 0 -> "-", 45 -> "45 min", 185 -> "3h 5m", 180 -> "3h". */
export function hoursWords(minutes: number): string {
  if (!minutes) return "-";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** Google Maps at a coordinate, or nothing without one. */
export function mapsLink(latitude: number | null, longitude: number | null): string | undefined {
  if (latitude == null || longitude == null) return undefined;
  return `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

/**
 * Where a moment happened: its address when Payroll has one, else its
 * coordinates -- a Google Maps link on screen, the link itself in the sheet.
 */
export function placeLine(moment: DayReportMoment): DayReportLine {
  const href = mapsLink(moment.latitude, moment.longitude);
  if (moment.address) return href ? { text: moment.address, href } : { text: moment.address };
  if (href) {
    return {
      text: `${moment.latitude!.toFixed(5)}, ${moment.longitude!.toFixed(5)}`,
      href,
      sheet: href,
    };
  }
  return { text: "Place not recorded" };
}

/** Numbered when there is more than one, so a time row and its place row line up. */
function numbered(lines: DayReportLine[]): DayReportLine[] {
  if (lines.length < 2) return lines;
  return lines.map((line, index) => {
    const prefix = `${index + 1}. `;
    return line.sheet != null
      ? { ...line, text: prefix + line.text, sheet: prefix + line.sheet }
      : { ...line, text: prefix + line.text };
  });
}

const single = (text: string): DayReportLine[] => [{ text }];
const count = (value: number | null) => single(value == null ? "-" : String(value));
const call = (number: string | null) => (number ? ` · ${number}` : "");

/** The rows, in the office's order, and how each column fills them. */
export const DAY_REPORT_ROWS: {
  key: string;
  label: string;
  /** A list, one line per moment; else one value, centred. */
  list?: boolean;
  lines: (column: DayReportColumn) => DayReportLine[];
}[] = [
  { key: "date", label: "Date", lines: (c) => single(sheetDate(c.day)) },
  { key: "name", label: "Name", lines: (c) => single(c.name) },
  {
    key: "login",
    label: "Login",
    list: true,
    lines: (c) => numbered(c.cell.logins.map((m) => ({ text: clockTime(m.at) }))),
  },
  { key: "login_location", label: "Login location", list: true, lines: (c) => numbered(c.cell.logins.map(placeLine)) },
  {
    key: "logout",
    label: "Logout",
    list: true,
    lines: (c) => [
      ...numbered(
        c.cell.logouts.map((m) => {
          // A duty that ran past midnight ended on another day, and says which.
          const day = indiaDay(m.at);
          const date = day !== c.day ? ` (${sheetDate(day)})` : "";
          return { text: `${clockTime(m.at)}${date}${m.auto ? " (auto, no Logout)" : ""}` };
        }),
      ),
      ...(c.cell.on_duty ? single("On duty") : []),
    ],
  },
  { key: "logout_location", label: "Logout location", list: true, lines: (c) => numbered(c.cell.logouts.map(placeLine)) },
  {
    key: "check_in",
    label: "Check in",
    list: true,
    lines: (c) => numbered(c.cell.check_ins.map((m) => ({ text: `${clockTime(m.at)}${call(m.case_number)}` }))),
  },
  { key: "check_in_location", label: "Check in locations", list: true, lines: (c) => numbered(c.cell.check_ins.map(placeLine)) },
  {
    key: "check_out",
    label: "Check out",
    list: true,
    lines: (c) => numbered(c.cell.check_outs.map((m) => ({ text: `${clockTime(m.at)}${call(m.case_number)}` }))),
  },
  { key: "check_out_location", label: "Check out locations", list: true, lines: (c) => numbered(c.cell.check_outs.map(placeLine)) },
  { key: "assigned", label: "Assigned", lines: (c) => count(c.cell.assigned) },
  { key: "attended", label: "Attended", lines: (c) => count(c.cell.attended) },
  { key: "closed", label: "Closed", lines: (c) => count(c.cell.closed) },
  { key: "waiting", label: "Waiting hours", lines: (c) => single(hoursWords(c.cell.waiting_minutes)) },
  {
    key: "waiting_location",
    label: "Waiting locations",
    list: true,
    lines: (c) =>
      numbered(
        c.cell.waits.map((m) => {
          const place = placeLine(m);
          const head = `${clockTime(m.at)} · ${hoursWords(m.minutes)} · `;
          return { ...place, text: head + place.text, sheet: head + (place.sheet ?? place.text) };
        }),
      ),
  },
  { key: "gps", label: "GPS off hours", lines: (c) => single(hoursWords(c.cell.gps_off_minutes)) },
  { key: "gps_on_location", label: "GPS on locations", list: true, lines: (c) => numbered(timedPlaces(c.cell.gps_ons)) },
  { key: "gps_off_location", label: "GPS off locations", list: true, lines: (c) => numbered(timedPlaces(c.cell.gps_offs)) },
  { key: "net", label: "Net off hours", lines: (c) => single(hoursWords(c.cell.net_off_minutes)) },
  { key: "net_on_location", label: "Net on locations", list: true, lines: (c) => numbered(timedPlaces(c.cell.net_ons)) },
  { key: "net_off_location", label: "Net off locations", list: true, lines: (c) => numbered(timedPlaces(c.cell.net_offs)) },
  { key: "km", label: "Total km", lines: (c) => single(formatKm(c.cell.km)) },
];

/** "11:30 AM · <place>" for each moment: when the GPS or the network came and went. */
function timedPlaces(moments: DayReportMoment[]): DayReportLine[] {
  return moments.map((m) => {
    const place = placeLine(m);
    const head = `${clockTime(m.at)} · `;
    return { ...place, text: head + place.text, sheet: head + (place.sheet ?? place.text) };
  });
}

/** What a cell says in the downloaded sheet: one line per entry, "-" for none. */
export function sheetText(lines: DayReportLine[]): string {
  return lines.length ? lines.map((line) => line.sheet ?? line.text).join("\n") : "-";
}

/**
 * The report's columns: each day, oldest first, and within it each FSE by
 * name -- the sheet the office reads a day from, one day after another.
 */
export function dayReportColumns(
  result: Pick<DayReportResult, "days" | "engineers">,
  nameById: Map<number, string>,
): DayReportColumn[] {
  const rows = [...result.engineers]
    .map((row) => ({ ...row, name: nameById.get(row.engineer_id) ?? `#${row.engineer_id}` }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const columns: DayReportColumn[] = [];
  for (const day of result.days) {
    for (const row of rows) {
      const cell = row.days[day];
      if (cell) columns.push({ day, engineerId: row.engineer_id, name: row.name, cell });
    }
  }
  return columns;
}

/** Days from `from` to `to` inclusive, or null when they are not a period of 1 to MAX_DAY_REPORT_DAYS days. */
export function dayCount(from: string, to: string): number | null {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  const days = Math.round((end - start) / 86_400_000) + 1;
  return days <= MAX_DAY_REPORT_DAYS ? days : null;
}

/** "Day_Report_Hosur_2026-10-01_to_2026-10-26.xlsx", one day named once. */
export function dayReportFilename(scope: string, from: string, to: string): string {
  const who = scope.trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "All_Regions";
  const when = from === to ? from : `${from}_to_${to}`;
  return `Day_Report_${who}_${when}.xlsx`;
}
