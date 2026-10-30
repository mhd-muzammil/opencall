import { describe, expect, it } from "vitest";
import { A4_PT, buildImagePdf } from "./imagePdf";

/**
 * The PDF the Visit estimate is mailed as. A reader that finds one offset wrong may refuse
 * the whole file, so the structure is checked the way a reader walks it: from `startxref` to
 * the table, from each entry to its object.
 */

/** A stand-in JPEG: its bytes only have to arrive in the file unchanged. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 250, 251, 0xff, 0xd9]);

const latin1 = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join("");

function walk(pdf: Uint8Array) {
  const text = latin1(pdf);
  const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)?.[1]);
  expect(text.slice(startxref, startxref + 5)).toBe("xref\n");
  const [, , countText] = /^xref\n(\d+) (\d+)\n/.exec(text.slice(startxref)) ?? [];
  const count = Number(countText);
  const entries = text.slice(startxref).split("\n").slice(3, 3 + count - 1);
  // Every entry exactly 20 bytes, and every one pointing at the object it numbers.
  entries.forEach((entry, index) => {
    expect(`${entry}\n`).toHaveLength(20);
    const offset = Number(entry.slice(0, 10));
    expect(text.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`);
  });
  return { text, count };
}

describe("buildImagePdf", () => {
  it("writes a PDF a reader can walk, with the picture's bytes unchanged", () => {
    const pdf = buildImagePdf([{ jpeg: JPEG, widthPx: 2382, heightPx: 3368 }], { ...A4_PT, title: "RTPL/26-27/QEV/7" });
    const { text, count } = walk(pdf);

    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(count).toBe(7); // the free entry, catalogue, page tree, info, then page, image, content
    expect(text).toContain("/Type /Pages /Kids [4 0 R] /Count 1");
    expect(text).toContain("/MediaBox [0 0 595.28 841.89]");
    expect(text).toContain("/Width 2382 /Height 3368 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length 11");
    expect(text).toContain("/Title (RTPL/26-27/QEV/7)");
    // The picture fills the page.
    expect(text).toContain("q 595.28 0 0 841.89 0 0 cm /Im0 Do Q");
    expect(text).toContain(`stream\n${latin1(JPEG)}\nendstream`);
  });

  it("hangs a part-page picture from the top of its page", () => {
    const pdf = buildImagePdf(
      [
        { jpeg: JPEG, widthPx: 10, heightPx: 10 },
        { jpeg: JPEG, widthPx: 10, heightPx: 5, heightShare: 0.5 },
      ],
      A4_PT,
    );
    const { text, count } = walk(pdf);
    expect(count).toBe(10);
    expect(text).toContain("/Kids [4 0 R 7 0 R] /Count 2");
    expect(text).toContain("q 595.28 0 0 420.94 0 420.94 cm /Im0 Do Q");
  });

  it("keeps the title a PDF string whatever it contains", () => {
    const text = latin1(buildImagePdf([{ jpeg: JPEG, widthPx: 1, heightPx: 1 }], { ...A4_PT, title: "a(b)\\c — ₹" }));
    expect(text).toContain("/Title (a\\(b\\)\\\\c ? ?)");
  });

  it("refuses to write a PDF with no pages", () => {
    expect(() => buildImagePdf([], A4_PT)).toThrow();
  });
});
