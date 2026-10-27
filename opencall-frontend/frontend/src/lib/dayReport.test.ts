import { describe, expect, it } from "vitest";
import type { DayReportCell } from "./payrollTrackingApiClient";
import {
  DAY_REPORT_GROUPS,
  DAY_REPORT_ROWS,
  DAY_SUMMARY_ROWS,
  clockTime,
  dayReportTotals,
  dayTimeline,
  initials,
  longDate,
  dayCount,
  dayReportColumns,
  dayReportFilename,
  hoursWords,
  placeLine,
  sheetDate,
  sheetText,
  type DayReportColumn,
} from "./dayReport";
import { buildDayReportWorkbook } from "./dayReportExcel";

/**
 * The Day Report's rows and wording: the office's own order and words, each
 * cell Payroll's answer as it came, and the sheet saying what the screen says.
 */

function cell(overrides: Partial<DayReportCell> = {}): DayReportCell {
  return {
    logins: [],
    logouts: [],
    on_duty: false,
    check_ins: [],
    check_outs: [],
    assigned: null,
    attended: null,
    closed: null,
    waiting_minutes: 0,
    waits: [],
    gps_off_minutes: 0,
    gps_offs: [],
    gps_ons: [],
    net_off_minutes: 0,
    net_offs: [],
    net_ons: [],
    km: 0,
    ...overrides,
  };
}

const at = (hhmm: string) => `2026-10-10T${hhmm}:00+05:30`;
const here = { address: "12, Gandhi Street, Hosur", latitude: 12.75, longitude: 77.75 };
const bare = { address: null, latitude: 12.7, longitude: 77.7 };

const FULL = cell({
  logins: [{ at: at("10:00"), ...bare }],
  logouts: [{ at: at("18:30"), auto: false, ...bare }],
  check_ins: [
    { at: at("10:05"), case_number: "OC-1", case_ref: "WO-1", ...here },
    { at: at("12:40"), case_number: "OC-2", case_ref: null, ...bare },
  ],
  check_outs: [{ at: at("10:25"), case_number: "OC-1", case_ref: "WO-1", ...here }],
  assigned: 6,
  attended: 3,
  closed: 3,
  waiting_minutes: 185,
  waits: [{ at: at("10:00"), minutes: 185, case_number: "OC-1", ...here }],
  gps_off_minutes: 180,
  gps_offs: [{ at: at("11:00"), ...bare }],
  gps_ons: [{ at: at("14:00"), ...bare }],
  net_off_minutes: 10,
  net_offs: [{ at: at("12:00"), address: null, latitude: null, longitude: null }],
  net_ons: [{ at: at("12:10"), ...here }],
  km: 65.39,
});

const column = (overrides: Partial<DayReportColumn> = {}): DayReportColumn => ({
  day: "2026-10-10",
  engineerId: 7,
  name: "PRASANTH",
  cell: FULL,
  ...overrides,
});

const linesOf = (key: string, c = column()) =>
  DAY_REPORT_ROWS.find((row) => row.key === key)!.lines(c).map((line) => line.text);

describe("wording", () => {
  it("clock times in India, 12-hour", () => {
    expect(clockTime("2026-10-10T04:30:00Z")).toBe("10:00 AM");
    expect(clockTime("2026-10-10T13:05:00+00:00")).toBe("6:35 PM");
  });

  it("dates the office's way, and hours in words", () => {
    expect(sheetDate("2026-10-10")).toBe("10-10-2026");
    expect([0, 45, 60, 185].map(hoursWords)).toEqual(["-", "45 min", "1h", "3h 5m"]);
  });

  it("a place is its address, else a Google Maps link, else says so", () => {
    expect(placeLine({ at: at("10:00"), ...here })).toEqual({
      text: "12, Gandhi Street, Hosur",
      href: "https://maps.google.com/?q=12.750000,77.750000",
    });
    expect(placeLine({ at: at("10:00"), ...bare })).toEqual({
      text: "12.70000, 77.70000",
      href: "https://maps.google.com/?q=12.700000,77.700000",
      sheet: "https://maps.google.com/?q=12.700000,77.700000",
    });
    expect(placeLine({ at: at("10:00"), address: null, latitude: null, longitude: null })).toEqual({
      text: "Place not recorded",
      tone: "muted",
    });
  });
});

describe("rows", () => {
  it("are the office's, in its order", () => {
    expect(DAY_REPORT_ROWS.map((row) => row.label)).toEqual([
      "Date",
      "Name",
      "Login",
      "Login location",
      "Logout",
      "Logout location",
      "Check in",
      "Check in locations",
      "Check out",
      "Check out locations",
      "Assigned",
      "Attended",
      "Closed",
      "Waiting hours",
      "Waiting locations",
      "GPS off hours",
      "GPS on locations",
      "GPS off locations",
      "Net off hours",
      "Net on locations",
      "Net off locations",
      "Total km",
    ]);
  });

  it("each says what Payroll answered, numbered when there is more than one", () => {
    expect(linesOf("date")).toEqual(["10-10-2026"]);
    expect(linesOf("name")).toEqual(["PRASANTH"]);
    expect(linesOf("login")).toEqual(["10:00 AM"]);
    expect(linesOf("login_location")).toEqual(["12.70000, 77.70000"]);
    expect(linesOf("logout")).toEqual(["6:30 PM"]);
    expect(linesOf("check_in")).toEqual(["1. 10:05 AM · OC-1", "2. 12:40 PM · OC-2"]);
    expect(linesOf("check_in_location")).toEqual(["1. 12, Gandhi Street, Hosur", "2. 12.70000, 77.70000"]);
    expect(linesOf("check_out")).toEqual(["10:25 AM · OC-1"]);
    expect(linesOf("check_out_location")).toEqual(["12, Gandhi Street, Hosur"]);
    expect([linesOf("assigned"), linesOf("attended"), linesOf("closed")]).toEqual([["6"], ["3"], ["3"]]);
    expect(linesOf("waiting")).toEqual(["3h 5m"]);
    expect(linesOf("waiting_location")).toEqual(["10:00 AM · 3h 5m · 12, Gandhi Street, Hosur"]);
    expect(linesOf("gps")).toEqual(["3h"]);
    expect(linesOf("gps_on_location")).toEqual(["2:00 PM · 12.70000, 77.70000"]);
    expect(linesOf("gps_off_location")).toEqual(["11:00 AM · 12.70000, 77.70000"]);
    expect(linesOf("net")).toEqual(["10 min"]);
    expect(linesOf("net_on_location")).toEqual(["12:10 PM · 12, Gandhi Street, Hosur"]);
    expect(linesOf("net_off_location")).toEqual(["12:00 PM · Place not recorded"]);
    expect(linesOf("km")).toEqual(["65.39"]);
  });

  it("a Logout the app closed says so, a duty still running says On duty, and a day with nothing says dashes", () => {
    const auto = column({
      cell: cell({ logouts: [{ at: at("23:30"), auto: true, ...bare }], on_duty: true }),
    });
    expect(linesOf("logout", auto)).toEqual(["11:30 PM (auto, no Logout)", "On duty"]);
    const pastMidnight = column({
      day: "2026-09-02",
      cell: cell({ logouts: [{ at: "2026-09-03T05:50:40+05:30", auto: false, ...bare }] }),
    });
    expect(linesOf("logout", pastMidnight)).toEqual(["5:50 AM (03-09-2026)"]);
    const empty = column({ cell: cell() });
    expect(linesOf("login", empty)).toEqual([]);
    expect(linesOf("assigned", empty)).toEqual(["-"]);
    expect(linesOf("waiting", empty)).toEqual(["-"]);
    expect(linesOf("km", empty)).toEqual(["-"]);
  });

  it("sit in bands on screen, each band's rows together, in order", () => {
    const groups = DAY_REPORT_ROWS.map((row) => row.group);
    expect(groups.slice(0, 2)).toEqual(["", ""]);
    const bands = groups.slice(2).filter((group, index, all) => group !== all[index - 1]);
    expect(bands).toEqual([...DAY_REPORT_GROUPS]);
  });

  it("the screen sets each time in bold and colours what needs a look; the sheet is the same words", () => {
    const line = (key: string, c = column()) => DAY_REPORT_ROWS.find((row) => row.key === key)!.lines(c);
    expect(line("check_in").map((l) => l.lead)).toEqual(["1. 10:05 AM", "2. 12:40 PM"]);
    expect(line("check_out")[0]).toMatchObject({ text: "10:25 AM · OC-1", lead: "10:25 AM" });
    expect(line("gps_on_location")[0]).toMatchObject({ lead: "2:00 PM" });
    expect(line("waiting_location")[0]).toMatchObject({ lead: "10:00 AM · 3h 5m" });
    expect(line("gps")[0]).toMatchObject({ text: "3h", tone: "alert" });
    expect(line("net")[0]).toMatchObject({ text: "10 min", tone: "alert" });
    expect(line("gps", column({ cell: cell() }))[0]).toEqual({ text: "-" });
    expect(line("net_off_location")[0]).toMatchObject({ text: "12:00 PM · Place not recorded", tone: "muted" });
    const auto = column({ cell: cell({ logouts: [{ at: at("23:30"), auto: true, ...bare }], on_duty: true }) });
    expect(line("logout", auto)).toEqual([
      { text: "11:30 PM (auto, no Logout)", lead: "11:30 PM", tone: "warn" },
      { text: "On duty", tone: "good" },
    ]);
    expect(DAY_REPORT_ROWS.filter((row) => row.chip).map((row) => row.key)).toEqual(["assigned", "attended", "closed"]);
  });

  it("the tiles add up the columns on screen", () => {
    expect(
      dayReportTotals([
        column(),
        column({ engineerId: 8, cell: cell({ km: 12.25 }) }),
        column({ day: "2026-10-11", cell: cell({ km: 0.1 }) }),
      ]),
    ).toEqual({ km: 77.74, fses: 2, checkIns: 2, closed: 3 });
    expect(dayReportTotals([])).toEqual({ km: 0, fses: 0, checkIns: 0, closed: 0 });
  });

  it("a card's day: every moment in the order it happened, each with its time and place", () => {
    const moments = dayTimeline(column());
    expect(moments.map((m) => [m.kind, m.title, m.time])).toEqual([
      ["login", "Login", "10:00 AM"],
      ["wait", "Waiting · 3h 5m", "10:00 AM"],
      ["check_in", "Check in · OC-1", "10:05 AM"],
      ["check_out", "Check out · OC-1", "10:25 AM"],
      ["gps_off", "GPS off", "11:00 AM"],
      ["net_off", "Net off", "12:00 PM"],
      ["net_on", "Net on", "12:10 PM"],
      ["check_in", "Check in · OC-2", "12:40 PM"],
      ["gps_on", "GPS on", "2:00 PM"],
      ["logout", "Logout", "6:30 PM"],
    ]);
    expect(moments[2]!.place).toEqual({
      text: "12, Gandhi Street, Hosur",
      href: "https://maps.google.com/?q=12.750000,77.750000",
    });
    expect(moments[5]!.place).toEqual({ text: "Place not recorded", tone: "muted" });
    expect(moments.some((m) => m.auto)).toBe(false);
  });

  it("an auto logout says so, and one after midnight gives its date", () => {
    const late = column({
      day: "2026-09-02",
      cell: cell({
        logins: [{ at: "2026-09-02T09:00:00+05:30", ...bare }],
        logouts: [{ at: "2026-09-03T05:50:40+05:30", auto: true, ...bare }],
      }),
    });
    expect(dayTimeline(late).map((m) => [m.title, m.time, m.auto ?? false])).toEqual([
      ["Login", "9:00 AM", false],
      ["Auto logout", "5:50 AM (03-09-2026)", true],
    ]);
    expect(dayTimeline(column({ cell: cell() }))).toEqual([]);
  });

  it("names and dates for the cards", () => {
    expect(["Arun Kumar", "samim", "Lava kumar  V", ""].map(initials)).toEqual(["AK", "S", "LV", "?"]);
    expect(longDate("2026-10-25")).toBe("Sun, 25 Oct 2026");
  });

  it("the sheet writes a coordinate as its Google Maps link, one line each, and a dash for none", () => {
    const rows = Object.fromEntries(DAY_REPORT_ROWS.map((row) => [row.key, sheetText(row.lines(column()))]));
    expect(rows.login_location).toBe("https://maps.google.com/?q=12.700000,77.700000");
    expect(rows.check_in_location).toBe(
      "1. 12, Gandhi Street, Hosur\n2. https://maps.google.com/?q=12.700000,77.700000",
    );
    expect(rows.gps_off_location).toBe("11:00 AM · https://maps.google.com/?q=12.700000,77.700000");
    expect(sheetText([])).toBe("-");
  });
});

describe("the short sheet", () => {
  const summaryOf = (c: DayReportColumn) =>
    Object.fromEntries(DAY_SUMMARY_ROWS.map((row) => [row.label, sheetText(row.lines(c))]));

  it("has the office's sample's rows, in its order and words", () => {
    expect(DAY_SUMMARY_ROWS.map((row) => row.label)).toEqual([
      "DATE",
      "NAME",
      "Login Time",
      "Login Location",
      "Logout Time",
      "Logout Location",
      "Assigned",
      "Attended",
      "Closed",
      "GPS Off Hrs",
      "Total Km",
    ]);
    expect(DAY_SUMMARY_ROWS.every((row) => row.group === "")).toBe(true);
  });

  it("is the first Login and the last Logout with where, the counts, GPS off and the km", () => {
    expect(summaryOf(column())).toEqual({
      DATE: "10-10-2026",
      NAME: "PRASANTH",
      "Login Time": "10:00 AM",
      "Login Location": "https://maps.google.com/?q=12.700000,77.700000",
      "Logout Time": "6:30 PM",
      "Logout Location": "https://maps.google.com/?q=12.700000,77.700000",
      Assigned: "6",
      Attended: "3",
      Closed: "3",
      "GPS Off Hrs": "3h",
      "Total Km": "65.39",
    });
    const two = column({
      cell: cell({
        logins: [{ at: at("09:00"), ...here }, { at: at("14:00"), ...bare }],
        logouts: [{ at: at("12:00"), auto: false, ...bare }, { at: at("19:15"), auto: false, ...here }],
      }),
    });
    expect([summaryOf(two)["Login Time"], summaryOf(two)["Login Location"]]).toEqual(["9:00 AM", here.address]);
    expect([summaryOf(two)["Logout Time"], summaryOf(two)["Logout Location"]]).toEqual(["7:15 PM", here.address]);
  });

  it("a duty still running, one the app closed, one past midnight, and a day with nothing", () => {
    const running = column({ cell: cell({ logins: [{ at: at("09:00"), ...bare }], on_duty: true }) });
    expect([summaryOf(running)["Logout Time"], summaryOf(running)["Logout Location"]]).toEqual(["On duty", "-"]);
    const auto = column({
      day: "2026-09-02",
      cell: cell({ logouts: [{ at: "2026-09-03T05:50:40+05:30", auto: true, ...bare }] }),
    });
    expect(summaryOf(auto)["Logout Time"]).toBe("5:50 AM (03-09-2026) (auto)");
    expect(summaryOf(column({ cell: cell() }))).toMatchObject({
      "Login Time": "-",
      "Login Location": "-",
      "Logout Time": "-",
      "Logout Location": "-",
      Assigned: "-",
      "GPS Off Hrs": "-",
      "Total Km": "-",
    });
  });

  it("downloads under its own name", () => {
    expect(dayReportFilename("Hosur", "2026-10-25", "2026-10-25", "summary")).toBe("Day_Summary_Hosur_2026-10-25.xlsx");
    expect(dayReportFilename("Hosur", "2026-10-06", "2026-10-24", "km")).toBe("Day_KM_Hosur_2026-10-06_to_2026-10-24.xlsx");
  });

  it("as Excel: its eleven rows down, the FSE-days across", async () => {
    const columns = [column(), column({ engineerId: 8, name: "JAYAKUMAR", cell: cell({ km: 12 }) })];
    const bytes = await buildDayReportWorkbook(columns, DAY_SUMMARY_ROWS);
    const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
    const sheet = workbook.getWorksheet("Day Report")!;
    expect(sheet.rowCount).toBe(11);
    DAY_SUMMARY_ROWS.forEach((row, index) => {
      expect(sheet.getRow(index + 1).getCell(1).value).toBe(row.label);
      columns.forEach((c, columnIndex) => {
        expect(sheet.getRow(index + 1).getCell(columnIndex + 2).value).toBe(sheetText(row.lines(c)));
      });
    });
    expect(sheet.getRow(11).getCell(3).value).toBe("12");
  }, 60_000);
});

describe("columns", () => {
  it("each day in turn, and in it each FSE by name; a day Payroll did not answer is left out", () => {
    const columns = dayReportColumns(
      {
        days: ["2026-10-09", "2026-10-10"],
        engineers: [
          { engineer_id: 8, days: { "2026-10-09": cell({ km: 1 }), "2026-10-10": cell({ km: 2 }) } },
          { engineer_id: 7, days: { "2026-10-10": cell({ km: 3 }) } },
        ],
      },
      new Map([
        [7, "Arun"],
        [8, "Bala"],
      ]),
    );
    expect(columns.map((c) => [c.day, c.name, c.cell.km])).toEqual([
      ["2026-10-09", "Bala", 1],
      ["2026-10-10", "Arun", 3],
      ["2026-10-10", "Bala", 2],
    ]);
  });

  it("a period of 1 to 31 days, from on or before to", () => {
    expect(dayCount("2026-10-10", "2026-10-10")).toBe(1);
    expect(dayCount("2026-10-01", "2026-10-31")).toBe(31);
    expect(dayCount("2026-10-01", "2026-11-01")).toBeNull();
    expect(dayCount("2026-10-11", "2026-10-10")).toBeNull();
    expect(dayCount("", "2026-10-10")).toBeNull();
  });

  it("names the file for who and when", () => {
    expect(dayReportFilename("All Regions", "2026-10-01", "2026-10-26")).toBe(
      "Day_Report_All_Regions_2026-10-01_to_2026-10-26.xlsx",
    );
    expect(dayReportFilename("Lava kumar V", "2026-10-26", "2026-10-26")).toBe(
      "Day_Report_Lava_kumar_V_2026-10-26.xlsx",
    );
  });
});

describe("the Excel sheet", () => {
  it("is the rows down and the FSE-days across, each cell what the screen says, boxed and wrapped", async () => {
    const columns = [column(), column({ engineerId: 8, name: "JAYAKUMAR", cell: cell({ km: 12 }) })];
    const bytes = await buildDayReportWorkbook(columns);

    const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
    const sheet = workbook.getWorksheet("Day Report")!;
    expect(sheet.rowCount).toBe(DAY_REPORT_ROWS.length);
    DAY_REPORT_ROWS.forEach((row, index) => {
      expect(sheet.getRow(index + 1).getCell(1).value).toBe(row.label);
      columns.forEach((c, columnIndex) => {
        expect(sheet.getRow(index + 1).getCell(columnIndex + 2).value).toBe(sheetText(row.lines(c)));
      });
    });
    expect(sheet.getRow(1).getCell(2).value).toBe("10-10-2026");
    expect(sheet.getRow(2).getCell(3).value).toBe("JAYAKUMAR");
    const checkIns = sheet.getRow(8).getCell(2);
    expect(checkIns.alignment).toMatchObject({ wrapText: true, horizontal: "left", vertical: "top" });
    expect(checkIns.border?.top?.style).toBe("thin");
    expect(sheet.getRow(11).getCell(2).alignment).toMatchObject({ horizontal: "center" });
    // exceljs takes a while to load the first time.
  }, 60_000);
});
