import { describe, expect, it } from "vitest";
import type { AcerCallPreview } from "../../lib/brandCallApiClient";
import { actionLabel, onFileKind, onFileStatus, saveButtonLabel } from "./AcerCallsPasteModal";

/**
 * What the Acer paste screen says about a call that is already on file (25 Nov 2026):
 * the office pasted yesterday's call again and saw "closed or deleted before — tick to
 * reopen", with the reason behind a "!" they had to hover over.
 */

function call(existing: AcerCallPreview["existing"]): AcerCallPreview {
  return { caseId: "1913621C", existing } as unknown as AcerCallPreview;
}

const NEW = call(null);
const OPEN = call({ createdAt: "2026-11-24T04:26:34Z", closedAt: null, deletedAt: null });
const CLOSED = call({ createdAt: "2026-11-19T04:26:34Z", closedAt: "2026-11-24T04:40:53Z", deletedAt: null });
const DELETED = call({ createdAt: "2026-11-19T04:26:34Z", closedAt: null, deletedAt: "2026-11-24T04:00:24Z" });

describe("a pasted call that is already on file", () => {
  it("is told apart: new, still open, closed, deleted", () => {
    expect([NEW, OPEN, CLOSED, DELETED].map(onFileKind)).toEqual(["new", "open", "closed", "deleted"]);
  });

  it("says plainly when it is already added and still open", () => {
    const status = onFileStatus(OPEN, false);
    expect(status.tag).toBe("Already added");
    expect(status.text).toMatch(/^Added on 24 Nov 2026 and still open\. Nothing to do\.$/);
    expect(actionLabel("open")).toBe("Skip");
  });

  it("names the closed date and when to reopen, and confirms once ticked", () => {
    expect(onFileStatus(CLOSED, false).text).toBe(
      "Closed on 24 Nov 2026. Tick Reopen only if the customer needs another visit.",
    );
    expect(onFileStatus(CLOSED, true).text).toBe("Will be reopened with these details.");
    expect(actionLabel("closed")).toBe("Reopen");
  });

  it("offers to add a deleted call back", () => {
    expect(onFileStatus(DELETED, false).text).toBe("Deleted on 24 Nov 2026. Tick Add back to add it again.");
    expect(actionLabel("deleted")).toBe("Add back");
  });

  it("calls a new call new", () => {
    expect(onFileStatus(NEW, true)).toEqual({ tag: "New", text: "Will be added." });
    expect(actionLabel("new")).toBe("Add");
  });
});

describe("the save button", () => {
  it("says what it will do", () => {
    expect(
      saveButtonLabel([
        { include: true, kind: "new" },
        { include: true, kind: "new" },
        { include: true, kind: "closed" },
        { include: false, kind: "closed" },
        { include: false, kind: "open" },
      ]),
    ).toBe("Add 2 · Reopen 1");
    expect(saveButtonLabel([{ include: true, kind: "deleted" }])).toBe("Add back 1");
    expect(saveButtonLabel([{ include: false, kind: "open" }])).toBe("Nothing to save");
  });
});
