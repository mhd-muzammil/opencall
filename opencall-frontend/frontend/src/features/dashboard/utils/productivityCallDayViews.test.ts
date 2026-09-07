import { describe, expect, it } from "vitest";
import type { ProductivityBucket, ProductivityCallDayDetail } from "@opencall/shared";
import {
  detailSheetRows,
  distinctCallCount,
  DETAIL_SHEET_HEADERS,
  uniqueCallRows,
  uniqueSheetRows,
  UNIQUE_SHEET_HEADERS,
} from "./productivityCallDayViews";

function callDay(input: {
  date: string;
  ticketId: string;
  engineer?: string;
  bucket?: ProductivityBucket;
  bookingIndex?: number;
  bookingCount?: number;
}): ProductivityCallDayDetail {
  return {
    date: input.date,
    engineer: input.engineer ?? "Jeeva CH",
    regionCode: "ASPS01461",
    regionName: "CHENNAI",
    regionId: "region-1",
    ticketId: input.ticketId,
    bucket: input.bucket ?? "SCHEDULED",
    woOtcCode: "OTC-1",
    customerName: "Ramesh",
    location: "Adyar",
    product: "LaserJet",
    segment: "Consumer",
    caseCreatedTime: "2026-07-20T04:30:00.000Z",
    wipAging: "5",
    tat: null,
    flexStatus: "Open",
    rtplStatus: "Scheduled",
    eveningStatus: "",
    bookingIndex: input.bookingIndex ?? 1,
    bookingCount: input.bookingCount ?? 1,
  };
}

// The same WO booked three days: the case that reads as duplicated data until
// the Booking column explains it.
const THREE_BOOKINGS = [
  callDay({ date: "2026-07-27", ticketId: "WO-1", bookingIndex: 1, bookingCount: 3 }),
  callDay({
    date: "2026-07-28",
    ticketId: "WO-1",
    bucket: "PART_ORDER",
    bookingIndex: 2,
    bookingCount: 3,
  }),
  callDay({
    date: "2026-07-29",
    ticketId: "WO-1",
    bucket: "CLOSED",
    bookingIndex: 3,
    bookingCount: 3,
  }),
];

describe("detailSheetRows", () => {
  it("writes one row per call-day, each naming which booking it is", () => {
    const rows = detailSheetRows(THREE_BOOKINGS);
    const bookingColumn = DETAIL_SHEET_HEADERS.indexOf("Booking");
    const outcomeColumn = DETAIL_SHEET_HEADERS.indexOf("Outcome");

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row[bookingColumn])).toEqual([
      "1 of 3",
      "2 of 3",
      "3 of 3",
    ]);
    expect(rows.map((row) => row[outcomeColumn])).toEqual([
      "Booked - no outcome",
      "Part ordered",
      "Closed",
    ]);
  });

  it("writes dates the way the rest of the app shows them", () => {
    const [row] = detailSheetRows([callDay({ date: "2026-07-27", ticketId: "WO-1" })]);
    expect(row?.[DETAIL_SHEET_HEADERS.indexOf("Date")]).toBe("27-07-2026");
    expect(row?.[DETAIL_SHEET_HEADERS.indexOf("Case Created")]).toBe("20-07-2026");
  });

  it("keeps a column for every header", () => {
    const [row] = detailSheetRows(THREE_BOOKINGS);
    expect(row).toHaveLength(DETAIL_SHEET_HEADERS.length);
  });
});

describe("uniqueCallRows", () => {
  it("collapses three bookings into one call booked three times", () => {
    const [row] = uniqueCallRows(THREE_BOOKINGS);

    expect(uniqueCallRows(THREE_BOOKINGS)).toHaveLength(1);
    expect(row?.timesBooked).toBe(3);
    // Booked three days, worked two of them: the third day's Part order and the
    // closure. The first day was booked and never touched.
    expect(row?.daysAttended).toBe(2);
    expect(row?.firstBooked).toBe("2026-07-27");
    expect(row?.lastBooked).toBe("2026-07-29");
    expect(row?.finalOutcome).toBe("CLOSED");
    expect(row?.closedInCycle).toBe(true);
  });

  // A handover is two engineers' work on one call. Collapsing it to a single
  // row would erase one engineer's booking from their own productivity.
  it("keeps a reassigned call as one row per engineer", () => {
    const rows = uniqueCallRows([
      callDay({ date: "2026-07-27", ticketId: "WO-1", engineer: "Jeeva CH" }),
      callDay({ date: "2026-07-28", ticketId: "WO-1", engineer: "kannan" }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.engineer).sort()).toEqual(["Jeeva CH", "kannan"]);
    // ...while the call itself is still ONE call. This gap is exactly why the
    // header quotes distinctCallCount and not the row count.
    expect(
      distinctCallCount([
        callDay({ date: "2026-07-27", ticketId: "WO-1", engineer: "Jeeva CH" }),
        callDay({ date: "2026-07-28", ticketId: "WO-1", engineer: "kannan" }),
      ]),
    ).toBe(1);
  });

  it("stays closed for the cycle when a closed call is rebooked after", () => {
    const [row] = uniqueCallRows([
      callDay({ date: "2026-07-27", ticketId: "WO-1", bucket: "CLOSED" }),
      callDay({ date: "2026-08-04", ticketId: "WO-1", bucket: "SCHEDULED" }),
    ]);

    expect(row?.closedInCycle).toBe(true);
    // The revisit is still the latest thing that happened to it.
    expect(row?.finalOutcome).toBe("SCHEDULED");
    expect(row?.timesBooked).toBe(2);
  });

  it("keeps a column for every header", () => {
    const [row] = uniqueSheetRows(uniqueCallRows(THREE_BOOKINGS));
    expect(row).toHaveLength(UNIQUE_SHEET_HEADERS.length);
  });
});

describe("the two views against each other", () => {
  // The reconciliation the whole feature rests on: the detail sheet's row count
  // is the number that was clicked, and the unique sheet is a different, smaller
  // number that must never be mistaken for a correction of it.
  it("counts bookings in one view and calls in the other", () => {
    const callDays = [
      ...THREE_BOOKINGS,
      callDay({ date: "2026-07-30", ticketId: "WO-2", bucket: "CLOSED" }),
    ];

    expect(detailSheetRows(callDays)).toHaveLength(4);
    expect(uniqueCallRows(callDays)).toHaveLength(2);
    expect(distinctCallCount(callDays)).toBe(2);
  });
});
