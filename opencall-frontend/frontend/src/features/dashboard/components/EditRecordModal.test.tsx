import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EditRecordModal } from "./EditRecordModal";

function renderModal(
  overrides: Partial<Parameters<typeof EditRecordModal>[0]> = {},
): string {
  return renderToStaticMarkup(
    createElement(EditRecordModal, {
      editingSerialNo: 7,
      savingSerialNo: null,
      draftOutput: { "Ticket ID": "WO-035124515" },
      setDraftOutput: vi.fn(),
      engineersList: [],
      rtplStatusGroups: [],
      cancelEditing: vi.fn(),
      saveEditing: vi.fn(),
      saveError: null,
      ...overrides,
    }),
  );
}

describe("EditRecordModal", () => {
  it("renders no error box when the last save did not fail", () => {
    const html = renderModal();

    expect(html).toContain("Save Entry");
    expect(html).not.toContain("Save failed");
  });

  // The page-level message banner sits underneath the modal overlay, so a save
  // failure must be visible inside the modal — otherwise the modal appears to
  // stay open for no reason after clicking Save.
  it("shows the save failure inside the modal", () => {
    const html = renderModal({ saveError: "Unauthorized" });

    expect(html).toContain("Save failed: Unauthorized");
    expect(html).toContain('role="alert"');
  });

  it("disables the buttons and shows progress while saving", () => {
    const html = renderModal({ savingSerialNo: 7 });

    expect(html).toContain("Saving...");
    expect(html).toContain("disabled");
  });
});
