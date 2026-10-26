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
 * downloaded sheet says instead of `text`, when the two differ. `lead` -- the
 * start of `text`, its time -- and `tone` are for the screen only; the sheet
 * is plain.
 */
export interface DayReportLine {
  text: string;
  href?: string;
  sheet?: string;
  lead?: string;
  tone?: "alert" | "warn" | "good" | "muted";
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
  return CLOCK.format(new Date(iso)).replace(/\u202f/g, " ");
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
  return { text: "Place not recorded", tone: "muted" };
}

/** Numbered when there is more than one, so a time row and its place row line up. */
function numbered(lines: DayReportLine[]): DayReportLine[] {
  if (lines.length < 2) return lines;
  return lines.map((line, index) => {
    const prefix = `${index + 1}. `;
    const out: DayReportLine = { ...line, text: prefix + line.text };
    if (line.sheet != null) out.sheet = prefix + line.sheet;
    if (line.lead != null) out.lead = prefix + line.lead;
    return out;
  });
}

const single = (text: string): DayReportLine[] => [{ text }];
const count = (value: number | null) => single(value == null ? "-" : String(value));
const call = (number: string | null) => (number ? ` · ${number}` : "");
/** A stretch off, red on screen when there was any. */
const offFor = (minutes: number): DayReportLine[] =>
  minutes ? [{ text: hoursWords(minutes), tone: "alert" }] : single("-");

/** The bands the rows are grouped under on screen, in order. */
export const DAY_REPORT_GROUPS = ["Duty", "Calls", "OpenCall", "Waiting", "GPS", "Network", "Distance"] as const;

/** The rows, in the office's order, and how each column fills them. */
export const DAY_REPORT_ROWS: {
  key: string;
  label: string;
  /** The band it sits under on screen; "" for the Date and Name heading rows. */
  group: "" | (typeof DAY_REPORT_GROUPS)[number];
  /** A list, one line per moment; else one value, centred. */
  list?: boolean;
  /** A count shown on screen as a pill in this colour. */
  chip?: { accent: string; tint: string };
  lines: (column: DayReportColumn) => DayReportLine[];
}[] = [
  { key: "date", label: "Date", group: "", lines: (c) => single(sheetDate(c.day)) },
  { key: "name", label: "Name", group: "", lines: (c) => single(c.name) },
  {
    key: "login",
    label: "Login",
    group: "Duty",
    list: true,
    lines: (c) =>
      numbered(
        c.cell.logins.map((m) => {
          const time = clockTime(m.at);
          return { text: time, lead: time };
        }),
      ),
  },
  {
    key: "login_location",
    label: "Login location",
    group: "Duty",
    list: true,
    lines: (c) => numbered(c.cell.logins.map(placeLine)),
  },
  {
    key: "logout",
    label: "Logout",
    group: "Duty",
    list: true,
    lines: (c) => [
      ...numbered(
        c.cell.logouts.map((m): DayReportLine => {
          // A duty that ran past midnight ended on another day, and says which.
          const day = indiaDay(m.at);
          const date = day !== c.day ? ` (${sheetDate(day)})` : "";
          const time = clockTime(m.at);
          const text = `${time}${date}${m.auto ? " (auto, no Logout)" : ""}`;
          return m.auto ? { text, lead: time, tone: "warn" } : { text, lead: time };
        }),
      ),
      ...(c.cell.on_duty ? [{ text: "On duty", tone: "good" as const }] : []),
    ],
  },
  {
    key: "logout_location",
    label: "Logout location",
    group: "Duty",
    list: true,
    lines: (c) => numbered(c.cell.logouts.map(placeLine)),
  },
  {
    key: "check_in",
    label: "Check in",
    group: "Calls",
    list: true,
    lines: (c) => numbered(c.cell.check_ins.map((m) => timedCall(m.at, m.case_number))),
  },
  {
    key: "check_in_location",
    label: "Check in locations",
    group: "Calls",
    list: true,
    lines: (c) => numbered(c.cell.check_ins.map(placeLine)),
  },
  {
    key: "check_out",
    label: "Check out",
    group: "Calls",
    list: true,
    lines: (c) => numbered(c.cell.check_outs.map((m) => timedCall(m.at, m.case_number))),
  },
  {
    key: "check_out_location",
    label: "Check out locations",
    group: "Calls",
    list: true,
    lines: (c) => numbered(c.cell.check_outs.map(placeLine)),
  },
  {
    key: "assigned",
    label: "Assigned",
    group: "OpenCall",
    chip: { accent: "#2563eb", tint: "#eff6ff" },
    lines: (c) => count(c.cell.assigned),
  },
  {
    key: "attended",
    label: "Attended",
    group: "OpenCall",
    chip: { accent: "#15803d", tint: "#f0fdf4" },
    lines: (c) => count(c.cell.attended),
  },
  {
    key: "closed",
    label: "Closed",
    group: "OpenCall",
    chip: { accent: "#7c3aed", tint: "#f5f3ff" },
    lines: (c) => count(c.cell.closed),
  },
  { key: "waiting", label: "Waiting hours", group: "Waiting", lines: (c) => single(hoursWords(c.cell.waiting_minutes)) },
  {
    key: "waiting_location",
    label: "Waiting locations",
    group: "Waiting",
    list: true,
    lines: (c) =>
      numbered(
        c.cell.waits.map((m) => {
          const place = placeLine(m);
          // The time and how long, in bold; the place after them.
          const lead = `${clockTime(m.at)} · ${hoursWords(m.minutes)}`;
          const head = `${lead} · `;
          return { ...place, text: head + place.text, sheet: head + (place.sheet ?? place.text), lead };
        }),
      ),
  },
  { key: "gps", label: "GPS off hours", group: "GPS", lines: (c) => offFor(c.cell.gps_off_minutes) },
  {
    key: "gps_on_location",
    label: "GPS on locations",
    group: "GPS",
    list: true,
    lines: (c) => numbered(timedPlaces(c.cell.gps_ons)),
  },
  {
    key: "gps_off_location",
    label: "GPS off locations",
    group: "GPS",
    list: true,
    lines: (c) => numbered(timedPlaces(c.cell.gps_offs)),
  },
  { key: "net", label: "Net off hours", group: "Network", lines: (c) => offFor(c.cell.net_off_minutes) },
  {
    key: "net_on_location",
    label: "Net on locations",
    group: "Network",
    list: true,
    lines: (c) => numbered(timedPlaces(c.cell.net_ons)),
  },
  {
    key: "net_off_location",
    label: "Net off locations",
    group: "Network",
    list: true,
    lines: (c) => numbered(timedPlaces(c.cell.net_offs)),
  },
  { key: "km", label: "Total km", group: "Distance", lines: (c) => single(formatKm(c.cell.km)) },
];

/** "10:05 AM · OC-2501": a check in or out, its time first. */
function timedCall(at: string, caseNumber: string | null): DayReportLine {
  const time = clockTime(at);
  return { text: `${time}${call(caseNumber)}`, lead: time };
}

/** "11:30 AM · <place>" for each moment: when the GPS or the network came and went. */
function timedPlaces(moments: DayReportMoment[]): DayReportLine[] {
  return moments.map((m) => {
    const place = placeLine(m);
    const time = clockTime(m.at);
    const head = `${time} · `;
    return { ...place, text: head + place.text, sheet: head + (place.sheet ?? place.text), lead: time };
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

/** The tiles above the report: what the FSE-days on screen add up to. */
export function dayReportTotals(columns: DayReportColumn[]): {
  km: number;
  fses: number;
  checkIns: number;
  closed: number;
} {
  const km = columns.reduce((sum, column) => sum + (Number(column.cell.km) || 0), 0);
  return {
    km: Math.round(km * 100) / 100,
    fses: new Set(columns.map((column) => column.engineerId)).size,
    checkIns: columns.reduce((sum, column) => sum + column.cell.check_ins.length, 0),
    closed: columns.reduce((sum, column) => sum + (column.cell.closed ?? 0), 0),
  };
}

export type TimelineKind =
  | "login"
  | "logout"
  | "check_in"
  | "check_out"
  | "wait"
  | "gps_off"
  | "gps_on"
  | "net_off"
  | "net_on";

/** One moment of an FSE-day on its card, in the order the day happened. */
export interface TimelineEntry {
  at: string;
  kind: TimelineKind;
  /** "Login", "Check in · OC-2501", "Waiting · 50 min", "Auto logout", ... */
  title: string;
  /** "9:12 AM", with its date when it fell on another day. */
  time: string;
  place: DayReportLine;
  /** A Logout the app closed, not the engineer. */
  auto?: boolean;
}

/** Every Login, Logout, check in and out, wait, and GPS and Net off and on of the day, oldest first. */
export function dayTimeline(column: DayReportColumn): TimelineEntry[] {
  const { cell, day } = column;
  const entry = (
    moment: DayReportMoment,
    kind: TimelineKind,
    title: string,
    place: DayReportLine = placeLine(moment),
  ): TimelineEntry => {
    const on = indiaDay(moment.at);
    return {
      at: moment.at,
      kind,
      title,
      time: `${clockTime(moment.at)}${on !== day ? ` (${sheetDate(on)})` : ""}`,
      place,
    };
  };
  const entries: TimelineEntry[] = [
    ...cell.logins.map((m) => entry(m, "login", "Login")),
    ...cell.logouts.map((m) =>
      m.auto ? { ...entry(m, "logout", "Auto logout"), auto: true } : entry(m, "logout", "Logout"),
    ),
    ...cell.check_ins.map((m) => entry(m, "check_in", `Check in${call(m.case_number)}`)),
    ...cell.check_outs.map((m) => entry(m, "check_out", `Check out${call(m.case_number)}`)),
    ...cell.waits.map((m) => entry(m, "wait", `Waiting · ${hoursWords(m.minutes)}`)),
    ...cell.gps_offs.map((m) => entry(m, "gps_off", "GPS off")),
    ...cell.gps_ons.map((m) => entry(m, "gps_on", "GPS on")),
    ...cell.net_offs.map((m) => entry(m, "net_off", "Net off")),
    ...cell.net_ons.map((m) => entry(m, "net_on", "Net on")),
  ];
  return entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sun, 25 Oct 2026" -- a date heading, spelt the same in every browser. */
export function longDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${WEEKDAYS[date.getUTCDay()]}, ${day} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "Arun Kumar" -> "AK", "samim" -> "S": the avatar on a card. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? words[0]!.slice(0, 1) : words[0]!.slice(0, 1) + words[words.length - 1]!.slice(0, 1);
  return letters.toUpperCase();
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
