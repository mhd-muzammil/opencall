// The Day Report's km laid out as the office's "Day-wise KM Report": a line
// per FSE with a column per day, then a line per location (region), each with
// its total, the days present and the km a present day. Built from the Total
// km row of the Day Report (the KM Report's km), so the three agree.

import type { DayReportColumn } from "./dayReport";
import { regionKey } from "./kmReport";

/** One line of the report: an FSE, a location, or the total. */
export interface DayKmLine {
  /** The FSE's name, the location's, or "Total". */
  name: string;
  /** The FSE's location; "" on a location or total line. */
  location: string;
  /** How many FSEs the line covers: 1 for an FSE. */
  fses: number;
  /** The km of each day, in the report's day order; 0 for none. */
  km: number[];
  total: number;
  /** Days with a Login. */
  present: number;
}

export interface DayKmReport {
  /** The days across, oldest first. */
  days: string[];
  fses: DayKmLine[];
  locations: DayKmLine[];
  /** Every FSE together: each day's km, the total, the days present. */
  total: DayKmLine;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** A line's days added into another's. */
function addInto(into: DayKmLine, line: DayKmLine): void {
  line.km.forEach((km, index) => {
    into.km[index] = round2(into.km[index]! + km);
  });
  into.total = round2(into.total + line.total);
  into.present += line.present;
  into.fses += line.fses;
}

/**
 * The report for the FSE-days on screen. `locationOf` is an FSE's region as
 * the register has it; `days`, every day asked about, so a day nobody has is
 * still a column. FSEs are A-Z, locations by how many FSEs they have, then A-Z.
 */
export function buildDayKm(
  columns: DayReportColumn[],
  locationOf: (engineerId: number) => string | null | undefined,
  asked: string[] = [],
): DayKmReport {
  const days = [...new Set([...asked, ...columns.map((column) => column.day)])].sort();
  const dayIndex = new Map(days.map((day, index) => [day, index] as const));
  const blank = (name: string, location: string): DayKmLine => ({
    name,
    location,
    fses: 0,
    km: days.map(() => 0),
    total: 0,
    present: 0,
  });

  const byFse = new Map<number, DayKmLine>();
  for (const column of columns) {
    let line = byFse.get(column.engineerId);
    if (!line) {
      line = { ...blank(column.name, String(locationOf(column.engineerId) ?? "").trim()), fses: 1 };
      byFse.set(column.engineerId, line);
    }
    const km = Number(column.cell.km) || 0;
    const index = dayIndex.get(column.day)!;
    line.km[index] = round2(line.km[index]! + km);
    line.total = round2(line.total + km);
    if (column.cell.logins.length > 0) line.present += 1;
  }
  const fses = [...byFse.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  // "CHENNAI" and "Chennai " are one location, named as its first FSE has it.
  const byLocation = new Map<string, DayKmLine>();
  for (const line of fses) {
    const key = regionKey(line.location);
    let location = byLocation.get(key);
    if (!location) {
      location = blank(line.location || "No location", "");
      byLocation.set(key, location);
    }
    addInto(location, line);
  }
  const locations = [...byLocation.values()].sort(
    (a, b) => b.fses - a.fses || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  const total = blank("Total", "");
  fses.forEach((line) => addInto(total, line));
  return { days, fses, locations, total };
}

const ONE_DECIMAL = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** A day's km: "78.6", "1,069.5", "-" for none. */
export function dayKmText(km: number): string {
  return km ? ONE_DECIMAL.format(km) : "-";
}

/** A total: "1,789.1", and "0.0" for none, as the office's sheet has it. */
export function totalKmText(km: number): string {
  return ONE_DECIMAL.format(km);
}

/** The km a present day, or null with no day present. */
export function kmPerPresentDay(line: DayKmLine): number | null {
  return line.present ? line.total / line.present : null;
}

/** "81.3", or "-" with no day present. */
export function kmPerPresentDayText(line: DayKmLine): string {
  const average = kmPerPresentDay(line);
  return average == null ? "-" : ONE_DECIMAL.format(average);
}
