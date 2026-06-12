// Pure date/time utilities extracted from app/page.tsx (Phase 3).
// Moved verbatim — no behavior changes.
import { MANUAL_ENTRY_REQUIRED } from "../constants";

export function todayIsoDate(): string {
  return dateIsoInIst(new Date());
}

export function dateIsoInIst(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const partValue = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${partValue("year")}-${partValue("month")}-${partValue("day")}`;
}

export function formatDisplayDateOnly(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  const day = date.getDate();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[date.getMonth()];

  let suffix = "th";
  if (day === 1 || day === 21 || day === 31) suffix = "st";
  else if (day === 2 || day === 22) suffix = "nd";
  else if (day === 3 || day === 23) suffix = "rd";

  return `${day}${suffix} ${month}`;
}

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDisplayDateTime(value: string | number | null | undefined): string | number {
  if (value === null || value === undefined || value === "") {
    return MANUAL_ENTRY_REQUIRED;
  }

  if (typeof value === "number") {
    return value;
  }

  const normalizedValue = value.includes(" ") && /[+-]\d{2}:?\d{2}$/.test(value)
    ? value.replace(" ", "T")
    : value;
  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const partValue = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hour = pad2(Number(partValue("hour")));
  const dayPeriod = partValue("dayPeriod").toUpperCase();

  return `${partValue("day")}-${partValue("month")}-${partValue("year")} ${hour}:${partValue("minute")}:${partValue("second")} ${dayPeriod}`;
}

export function formatRtplChangeTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function parseEditableDateTime(value: string): number {
  const displayDateTime = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(value.trim());

  if (displayDateTime) {
    const [, day, month, year, hour, minute, second = "0", meridiem] = displayDateTime;
    let normalizedHour = Number(hour);
    const normalizedMeridiem = String(meridiem).toUpperCase();

    if (normalizedMeridiem === "AM" && normalizedHour === 12) {
      normalizedHour = 0;
    } else if (normalizedMeridiem === "PM" && normalizedHour < 12) {
      normalizedHour += 12;
    }

    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      normalizedHour,
      Number(minute),
      Number(second),
    ).getTime();
  }

  return Date.parse(value);
}
