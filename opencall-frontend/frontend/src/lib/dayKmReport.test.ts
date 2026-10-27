import { describe, expect, it } from "vitest";
import type { DayReportCell } from "./payrollTrackingApiClient";
import type { DayReportColumn } from "./dayReport";
import { buildDayKm, dayKmText, kmPerPresentDayText, totalKmText } from "./dayKmReport";
import { buildDayKmWorkbook } from "./dayReportExcel";

/**
 * The Day-wise KM Report: the Day Report's km per FSE and per location, a
 * column a day, with the totals, the days present and the km a present day --
 * on screen and in the sheet alike.
 */

function cell(km: number, loggedIn = true): DayReportCell {
  return {
    logins: loggedIn ? [{ at: "2026-10-06T09:30:00+05:30", address: null, latitude: null, longitude: null }] : [],
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
    km,
  };
}

const column = (day: string, engineerId: number, name: string, km: number, loggedIn = true): DayReportColumn => ({
  day,
  engineerId,
  name,
  cell: cell(km, loggedIn),
});

const D1 = "2026-10-06";
const D2 = "2026-10-07";
// Asked about, but nobody has a column for it.
const D3 = "2026-10-08";

const COLUMNS = [
  column(D1, 1, "Jaikumar J", 78.6),
  column(D1, 2, "Lava kumar V", 23.2),
  column(D1, 3, "Raghav", 0),
  column(D1, 4, "samim", 70.4),
  column(D1, 5, "Kausar Basha", 132.9),
  column(D2, 1, "Jaikumar J", 90.9),
  column(D2, 2, "Lava kumar V", 110.25),
  column(D2, 3, "Raghav", 0),
  column(D2, 4, "samim", 0, false),
  column(D2, 5, "Kausar Basha", 0, false),
  column(D2, 6, "Nobody's", 5),
];

const LOCATION: Record<number, string | null> = {
  1: "Dharmapuri",
  2: "Chennai",
  3: "Chennai",
  4: "CHENNAI ",
  5: "Hosur",
  6: null,
};

const report = () => buildDayKm(COLUMNS, (id) => LOCATION[id], [D1, D2, D3]);

describe("the Day-wise KM Report", () => {
  it("a line per FSE, A-Z: each day's km, the total, and the days present", () => {
    const { days, fses } = report();
    expect(days).toEqual([D1, D2, D3]);
    expect(fses.map((line) => [line.name, line.location, line.km, line.total, line.present])).toEqual([
      ["Jaikumar J", "Dharmapuri", [78.6, 90.9, 0], 169.5, 2],
      ["Kausar Basha", "Hosur", [132.9, 0, 0], 132.9, 1],
      ["Lava kumar V", "Chennai", [23.2, 110.25, 0], 133.45, 2],
      ["Nobody's", "", [0, 5, 0], 5, 1],
      // Logged in both days and went nowhere: present, with no km.
      ["Raghav", "Chennai", [0, 0, 0], 0, 2],
      ["samim", "CHENNAI", [70.4, 0, 0], 70.4, 1],
    ]);
  });

  it("a day with km is a day present, with or without a Login on it", () => {
    // Prasanth, 25-26 Oct 2026: a duty begun on the Saturday evening ran into
    // the Sunday, so the Sunday has 53 km and no Login of its own.
    const { fses, total } = buildDayKm(
      [
        column("2026-10-25", 7, "Prasanth", 53, false),
        column("2026-10-26", 7, "Prasanth", 95.5),
        column("2026-10-27", 7, "Prasanth", 0, false),
      ],
      () => "Salem",
    );
    expect(fses.map((line) => [line.km, line.total, line.present, kmPerPresentDayText(line)])).toEqual([
      [[53, 95.5, 0], 148.5, 2, "74.3"],
    ]);
    expect(total.present).toBe(2);
  });

  it("a line per location, the most FSEs first; one place however it is written", () => {
    expect(report().locations.map((line) => [line.name, line.fses, line.km, line.total, line.present])).toEqual([
      ["Chennai", 3, [93.6, 110.25, 0], 203.85, 5],
      ["Dharmapuri", 1, [78.6, 90.9, 0], 169.5, 2],
      ["Hosur", 1, [132.9, 0, 0], 132.9, 1],
      ["No location", 1, [0, 5, 0], 5, 1],
    ]);
  });

  it("the Total line: every FSE together", () => {
    const { total } = report();
    expect([total.name, total.fses, total.km, total.total, total.present]).toEqual(["Total", 6, [305.1, 206.15, 0], 511.25, 9]);
  });

  it("writes km as the office's sheet does", () => {
    expect(dayKmText(0)).toBe("-");
    expect(dayKmText(0.6)).toBe("0.6");
    expect(dayKmText(1069.54)).toBe("1,069.5");
    expect(totalKmText(0)).toBe("0.0");
    expect(totalKmText(23330.06)).toBe("23,330.1");
    const [jaikumar, , , , raghav] = report().fses;
    expect(kmPerPresentDayText(jaikumar!)).toBe("84.8");
    expect(kmPerPresentDayText(raghav!)).toBe("0.0");
    expect(kmPerPresentDayText({ ...raghav!, present: 0 })).toBe("-");
  });

  it("as Excel: both tables, the days shaded, a bar under each total km, the names frozen", async () => {
    const bytes = await buildDayKmWorkbook(report());
    const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
    const sheet = workbook.getWorksheet("KM Report")!;
    const values = (row: number, from = 1, to = 9) =>
      Array.from({ length: to - from + 1 }, (_, index) => sheet.getRow(row).getCell(from + index).value);

    expect(sheet.getCell("A1").value).toBe("Day-wise KM Report (Engineer-wise)");
    expect(values(3)).toEqual([
      "S.No",
      "Engineer",
      "Location",
      "06-10-2026",
      "07-10-2026",
      "08-10-2026",
      "Total KM",
      "Days Present",
      "Avg KM / Present Day",
    ]);
    expect(sheet.getCell("D3").alignment?.textRotation).toBe(90);
    expect(values(4)).toEqual([1, "Jaikumar J", "Dharmapuri", 78.6, 90.9, "-", 169.5, 2, 84.8]);
    expect(values(8)).toEqual([5, "Raghav", "Chennai", "-", "-", "-", 0, 2, 0]);
    expect(values(10)).toEqual([null, "Total KM (day)", null, 305.1, 206.15, "-", 511.25, 9, 56.8]);
    expect(sheet.getCell("G4").numFmt).toBe("#,##0.0");

    expect(sheet.getCell("A12").value).toBe("Location-wise KM per Day");
    expect(values(13, 2)).toEqual([
      "Location",
      "Engineers",
      "06-10-2026",
      "07-10-2026",
      "08-10-2026",
      "Total KM",
      "Days Present",
      "Avg KM / Present Day",
    ]);
    expect(values(14, 2)).toEqual(["Chennai", 3, 93.6, 110.25, "-", 203.85, 5, 40.8]);
    expect(values(18, 2)).toEqual(["Total", 6, 305.1, 206.15, "-", 511.25, 9, 56.8]);

    // exceljs reads the formats back, though its types leave them out.
    const formats = (sheet as unknown as { conditionalFormattings: { ref: string; rules: { type: string }[] }[] })
      .conditionalFormattings;
    const rules = formats.map((format) => [format.ref, format.rules.map((rule) => rule.type)]);
    // Raghav's 0 (row 8) gets no bar.
    expect(rules).toEqual([
      ["D4:F9", ["colorScale"]],
      ["G4:G7 G9", ["dataBar"]],
      ["G14:G17", ["dataBar"]],
    ]);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", xSplit: 3, ySplit: 3 });
  }, 60_000);
});
