import { afterEach, describe, expect, it } from "vitest";
import { setCustomBodEodRows, setStatusBucketMap } from "@opencall/shared";
import { CARD_TONES, statusCardTone } from "./statusCardTone";

afterEach(() => {
  setStatusBucketMap([]);
  setCustomBodEodRows([]);
});

describe("statusCardTone: three groups by BOD/EOD row", () => {
  it("planned, closed and pending follow the row chosen for the status", () => {
    setStatusBucketMap([
      { name: "Scheduled", bucket: "SCHEDULED" },
      { name: "To Be Scheduled", bucket: "TO_BE_SCHEDULE" },
      { name: "Onsite", bucket: "ONSITE" },
      { name: "Engineer Delay", bucket: "ENGINEER_DELAY" },
      { name: "Case-Closed", bucket: "CLOSED" },
      { name: "SSC Pending", bucket: "SSC_PENDING" },
      { name: "Visit Estimate", bucket: "OTHER" },
    ]);
    expect(statusCardTone("Scheduled")).toBe(CARD_TONES.planned);
    expect(statusCardTone("To Be Scheduled")).toBe(CARD_TONES.planned);
    expect(statusCardTone("Onsite")).toBe(CARD_TONES.planned);
    expect(statusCardTone("Engineer Delay")).toBe(CARD_TONES.planned);
    expect(statusCardTone("Case-Closed")).toBe(CARD_TONES.closed);
    expect(statusCardTone("SSC Pending")).toBe(CARD_TONES.pending);
    expect(statusCardTone("Visit Estimate")).toBe(CARD_TONES.pending);
  });

  it("moving a status to another row moves it to that row's group", () => {
    setStatusBucketMap([{ name: "Awaiting Slot", bucket: "CX_RESCHEDULE" }]);
    expect(statusCardTone("Awaiting Slot")).toBe(CARD_TONES.pending);
    setStatusBucketMap([{ name: "Awaiting Slot", bucket: "TO_BE_SCHEDULE" }]);
    expect(statusCardTone("Awaiting Slot")).toBe(CARD_TONES.planned);
  });

  it("statuses not in the admin list follow the old keyword row; anything else is pending", () => {
    expect(statusCardTone("WO-closed")).toBe(CARD_TONES.closed);
    expect(statusCardTone("ssc pedning")).toBe(CARD_TONES.pending);
    expect(statusCardTone("Manual Entry Required")).toBe(CARD_TONES.pending);
  });

  it("a custom row is planned only when its calls count as still to be scheduled", () => {
    setCustomBodEodRows([
      { key: "C_plan000001", label: "Slot Requested", productivityBucket: "SCHEDULED", afterRow: "TO_BE_SCHEDULE", sortOrder: 1, isActive: true },
      { key: "C_wait000001", label: "HP Approval", productivityBucket: "CX_RESCHEDULE", afterRow: "CX_RESCHEDULE", sortOrder: 2, isActive: true },
    ]);
    setStatusBucketMap([
      { name: "Slot Requested", bucket: "C_plan000001" },
      { name: "Waiting HP", bucket: "C_wait000001" },
    ]);
    expect(statusCardTone("Slot Requested")).toBe(CARD_TONES.planned);
    expect(statusCardTone("Waiting HP")).toBe(CARD_TONES.pending);
  });
});
