import { describe, expect, it } from "vitest";
import { hasBrandCalls, listForBrand } from "./productivityByBrand";
import { reportForBrand, rowBrand } from "./brandRecords";
import type { GeneratedReportResponse } from "../../lib/apiClient";

const sriram = {
  name: "Sriram",
  assigned: 3,
  assignedTickets: ["WO-1", "ACER-1877563C", "ACER-1877696C"],
  attended: 2,
  attendedTickets: ["WO-1", "ACER-1877696C"],
  closed: 1,
  closedTickets: ["ACER-1877696C"],
  partOrdered: 1,
  partOrderedTickets: ["WO-1"],
  underObservation: 0,
  underObservationTickets: [],
  cxReschedule: 0,
  cxRescheduleTickets: [],
  engineerDelay: 0,
  engineerDelayTickets: [],
};
const hpOnly = { ...sriram, name: "Lava", assigned: 1, assignedTickets: ["WO-2"], attended: 0, attendedTickets: [], closed: 0, closedTickets: [], partOrdered: 0, partOrderedTickets: [] };

describe("productivity by brand", () => {
  it("counts only the brand's tickets", () => {
    const [acer] = listForBrand([sriram], "ACER");
    expect(acer).toMatchObject({ assigned: 2, attended: 1, closed: 1, partOrdered: 0 });

    const [hp] = listForBrand([sriram], "HP");
    expect(hp).toMatchObject({ assigned: 1, attended: 1, closed: 0, partOrdered: 1 });
  });

  it("drops engineers with no call of the brand and keeps everything for All", () => {
    expect(listForBrand([sriram, hpOnly], "ACER").map((entry) => entry.name)).toEqual(["Sriram"]);
    expect(listForBrand([sriram, hpOnly], "ALL")).toHaveLength(2);
  });

  it("knows whether the period has Acer calls", () => {
    expect(hasBrandCalls([hpOnly], "ACER")).toBe(false);
    expect(hasBrandCalls([sriram, hpOnly], "ACER")).toBe(true);
  });
});

describe("records by brand", () => {
  const row = (ticket: string) => ({ output: { "Ticket ID": ticket } });

  it("reads the brand from the ticket id", () => {
    expect(rowBrand(row("ACER-1877563C"))).toBe("ACER");
    expect(rowBrand(row("WO-034769854"))).toBe("HP");
  });

  it("splits the report and leaves it alone when nothing is filtered", () => {
    const report = { rows: [row("WO-1"), row("ACER-1")] } as unknown as GeneratedReportResponse;
    expect(reportForBrand(report, "ACER")?.rows).toHaveLength(1);
    expect(reportForBrand(report, "HP")?.rows).toHaveLength(1);
    expect(reportForBrand(report, null)).toBe(report);
  });
});
