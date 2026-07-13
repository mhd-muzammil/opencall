import { describe, expect, it } from "vitest";
import { formatSessionUploadedAt } from "./ReportHistoryPanel";

describe("formatSessionUploadedAt", () => {
  it("shows the upload time on a 12-hour clock with AM/PM", () => {
    const morning = formatSessionUploadedAt(
      new Date(2026, 6, 13, 9, 5).toISOString(),
    );
    const afternoon = formatSessionUploadedAt(
      new Date(2026, 6, 13, 16, 35).toISOString(),
    );

    // Uppercase AM/PM regardless of the locale's own casing.
    expect(morning).toMatch(/\b9:05\s?AM$/);
    expect(afternoon).toMatch(/\b4:35\s?PM$/);
  });

  it("keeps the date alongside the time", () => {
    const formatted = formatSessionUploadedAt(
      new Date(2026, 6, 13, 16, 35).toISOString(),
    );
    const date = new Date(2026, 6, 13).toLocaleDateString();

    expect(formatted.startsWith(`${date}, `)).toBe(true);
  });

  // Several reports are uploaded per day; the date alone cannot tell them apart.
  it("distinguishes two uploads made on the same day", () => {
    const first = formatSessionUploadedAt(
      new Date(2026, 6, 13, 9, 5).toISOString(),
    );
    const second = formatSessionUploadedAt(
      new Date(2026, 6, 13, 16, 35).toISOString(),
    );

    expect(first).not.toBe(second);
  });

  it("renders midnight and noon without a zero or 24-hour hour", () => {
    expect(
      formatSessionUploadedAt(new Date(2026, 6, 13, 0, 0).toISOString()),
    ).toMatch(/\b12:00\s?AM$/);
    expect(
      formatSessionUploadedAt(new Date(2026, 6, 13, 12, 0).toISOString()),
    ).toMatch(/\b12:00\s?PM$/);
  });

  it("returns an empty string for an unparseable timestamp", () => {
    expect(formatSessionUploadedAt("not-a-date")).toBe("");
  });
});
