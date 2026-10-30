/**
 * A PDF made of whole-page pictures, written by hand.
 *
 * The Visit estimate is mailed as a PDF of the sheet the browser has already laid out, so all
 * the PDF has to do is hold one JPEG per page. That is a few hundred bytes of structure around
 * each picture — a catalogue, a page tree, and an image PDF reads as JPEG unchanged
 * (DCTDecode) — so it is written here rather than pulling a PDF library into the bundle for
 * one call.
 */

export interface PdfPageImage {
  /** A baseline JPEG file's bytes, embedded as they are. */
  jpeg: Uint8Array;
  /** The picture's own size, in pixels. */
  widthPx: number;
  heightPx: number;
  /**
   * How much of the page's height the picture fills, from the top: 1 for a full page, less
   * for the last part of a sheet that runs over a page.
   */
  heightShare?: number;
}

export interface ImagePdfOptions {
  /** Page size in points (1/72 inch). A4 is 595.28 × 841.89. */
  widthPt: number;
  heightPt: number;
  /** Shown as the document's title by PDF readers. */
  title?: string;
}

/** A4 in points: 210 × 297 mm. */
export const A4_PT = { widthPt: (210 * 72) / 25.4, heightPt: (297 * 72) / 25.4 } as const;

const encoder = new TextEncoder();

/** A number as PDF writes it: plain decimal, two places at most, never an exponent. */
function num(value: number): string {
  return String(Number(value.toFixed(2)));
}

/**
 * A PDF literal string. Brackets and backslashes escaped; anything outside printable ASCII
 * becomes "?", since a title is a convenience and not worth an encoding scheme.
 */
function pdfString(value: string): string {
  const ascii = value.replace(/[^\x20-\x7e]/g, "?").replace(/[\\()]/g, (c) => `\\${c}`);
  return `(${ascii})`;
}

export function buildImagePdf(
  pages: PdfPageImage[],
  options: ImagePdfOptions,
): Uint8Array<ArrayBuffer> {
  if (pages.length === 0) throw new Error("A PDF needs at least one page");

  const chunks: Uint8Array[] = [];
  /** Byte offset of each object, by its number: what the cross-reference table lists. */
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const begin = (objectNumber: number) => {
    offsets[objectNumber] = length;
    push(`${objectNumber} 0 obj\n`);
  };

  const { widthPt, heightPt } = options;
  // 1 catalogue, 2 page tree, 3 document info; then three objects per page.
  const FIRST_PAGE = 4;
  const pageObject = (index: number) => FIRST_PAGE + index * 3;

  push("%PDF-1.4\n");
  // Four bytes above 127 on the second line, so tools that sniff for text treat it as binary.
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  begin(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  begin(2);
  push(
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageObject(i)} 0 R`).join(" ")}] ` +
      `/Count ${pages.length} >>\nendobj\n`,
  );
  begin(3);
  push(`<< /Title ${pdfString(options.title ?? "")} /Producer (OpenCall) >>\nendobj\n`);

  pages.forEach((page, index) => {
    const pageNo = pageObject(index);
    const imageNo = pageNo + 1;
    const contentNo = pageNo + 2;
    const share = Math.min(1, Math.max(0, page.heightShare ?? 1));
    const drawHeight = heightPt * share;

    begin(pageNo);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(widthPt)} ${num(heightPt)}] ` +
        `/Resources << /XObject << /Im0 ${imageNo} 0 R >> >> /Contents ${contentNo} 0 R >>\nendobj\n`,
    );

    begin(imageNo);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${page.widthPx} /Height ${page.heightPx} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\n` +
        "stream\n",
    );
    push(page.jpeg);
    push("\nendstream\nendobj\n");

    // The picture fills the page's width and its share of the height, hung from the top.
    const draw = `q ${num(widthPt)} 0 0 ${num(drawHeight)} 0 ${num(heightPt - drawHeight)} cm /Im0 Do Q`;
    begin(contentNo);
    push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream\nendobj\n`);
  });

  const objectCount = FIRST_PAGE + pages.length * 3;
  const xrefAt = length;
  push(`xref\n0 ${objectCount}\n0000000000 65535 f \n`);
  for (let n = 1; n < objectCount; n += 1) {
    // Each entry is exactly 20 bytes: ten digits, space, five digits, space, "n", space, LF.
    push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${objectCount} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
