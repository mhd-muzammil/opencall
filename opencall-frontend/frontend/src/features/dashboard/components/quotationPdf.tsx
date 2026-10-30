import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { Quotation } from "../../../lib/quotationApiClient";
import { A4_PT, buildImagePdf, type PdfPageImage } from "../../../lib/imagePdf";
import { QuotationPrint } from "./QuotationPrint";

/**
 * The quotation sheet as a PDF, made in the browser from the very markup Print uses.
 *
 * The Visit mail says "Kindly make the payment as per attached estimate", and the estimate is
 * this sheet. Drawing it again on the server would be a second copy of a layout measured to a
 * fifth of a millimetre against the office's own PDF, in fonts (Book Antiqua, Calibri) a Linux
 * container does not have. The browser already lays it out exactly, so the browser draws it:
 *
 *   1. the sheet is rendered into an empty frame — no app stylesheet, only the sheet's inline
 *      styles, the same blank document the Print button writes it into. On the page itself
 *      the app's table rules (cell padding, grey text, zebra rows) reach the sheet; printing
 *      never sees them and neither may the PDF;
 *   2. its markup goes into an SVG <foreignObject>, drawn by the browser's own layout onto a
 *      canvas at three times screen resolution (288 dpi on paper);
 *   3. the canvas is cut where printing cuts it — at the sheet's own page break, and at the
 *      foot of any page that runs over — and each part becomes an A4 page.
 *
 * That works because the sheet keeps to inline styles and data-URL images, which it does for
 * the print popup already.
 */

/** Canvas pixels per CSS pixel. 3 keeps the QR code and the small terms crisp on paper. */
const SCALE = 3;
/** JPEG quality: text stays clean and an A4 page stays a few hundred KB. */
const QUALITY = 0.92;
/** A4, as the sheet is laid out and printed. */
const PAGE_MM = { width: 210, height: 297 } as const;
/** CSS pixels per millimetre. */
const PX_PER_MM = 96 / 25.4;

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("The browser could not draw the quotation"));
          return;
        }
        void blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
      },
      "image/jpeg",
      QUALITY,
    );
  });
}

/**
 * Characters XML 1.0 does not allow anywhere, even escaped. A control character pasted into
 * a customer's name is harmless on screen but makes the whole SVG unreadable, and the send
 * would fail with "the source image cannot be decoded". They print as nothing, so they go.
 */
const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

/** The sheet as an image the browser has laid out itself, at its own size in CSS pixels. */
async function sheetImage(sheet: HTMLElement, width: number, height: number): Promise<HTMLImageElement> {
  // XMLSerializer writes the element as XHTML, which is what <foreignObject> requires.
  const xhtml = new XMLSerializer().serializeToString(sheet).replace(NOT_XML, "");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">${xhtml}</foreignObject></svg>`;
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  return image;
}

/**
 * Where printing starts a new page, in CSS pixels from the top of the sheet: before each
 * element that asks for a break, and at the foot of any stretch taller than a page.
 *
 * Kept to the fraction of a pixel. Rounded, a break at 733.4 would start page 2 at 733 and
 * carry the last 0.4px of page 1 — the table's closing rule — onto its top edge.
 */
export function pageTops(height: number, breaks: readonly number[], pageHeight: number): number[] {
  const forced = breaks
    .filter((top) => top > 0.5 && top < height - 0.5)
    .sort((a, b) => a - b)
    .filter((top, index, all) => index === 0 || top - all[index - 1]! > 0.5);
  const tops: number[] = [];
  for (const [index, start] of [0, ...forced].entries()) {
    const end = forced[index] ?? height;
    for (let top = start; top < end - 1; top += pageHeight) tops.push(top);
  }
  return tops;
}

/** The PDF of a sheet element already laid out in a document without the app's styles. */
export async function sheetToPdf(sheet: HTMLElement, title: string): Promise<Blob> {
  const box = sheet.getBoundingClientRect();
  const width = Math.ceil(box.width);
  const height = Math.ceil(box.height);
  const pageHeight = (width * PAGE_MM.height) / PAGE_MM.width || PAGE_MM.height * PX_PER_MM;
  const breaks = Array.from(sheet.querySelectorAll<HTMLElement>("*"))
    .filter((el) => el.style.pageBreakBefore === "always" || el.style.breakBefore === "page")
    .map((el) => el.getBoundingClientRect().top - box.top);
  const tops = pageTops(height, breaks, pageHeight);

  const image = await sheetImage(sheet, width, height);
  const pages: PdfPageImage[] = [];
  for (const [index, top] of tops.entries()) {
    const bottom = Math.min(tops[index + 1] ?? height, top + pageHeight, height);
    const part = bottom - top;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * SCALE);
    canvas.height = Math.max(1, Math.round(part * SCALE));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The browser could not draw the quotation");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, top, width, part, 0, 0, canvas.width, canvas.height);
    pages.push({
      jpeg: await canvasToJpeg(canvas),
      widthPx: canvas.width,
      heightPx: canvas.height,
      heightShare: Math.min(1, part / pageHeight),
    });
  }
  return new Blob([buildImagePdf(pages, { ...A4_PT, title })], { type: "application/pdf" });
}

/**
 * Render the quotation's sheet out of sight, turn it into a PDF, and take it away again.
 *
 * Rendered fresh rather than borrowed from an open View / Print, so what is mailed is always
 * the quotation as saved, whatever else is or is not on screen.
 */
export async function quotationPdf(q: Quotation): Promise<Blob> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  // Off-screen but laid out at full size; wider than the sheet so nothing constrains it.
  frame.style.cssText = "position:fixed;left:-100000px;top:0;width:1000px;height:1400px;border:0;";
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument;
    if (!doc) throw new Error("The browser could not draw the quotation");
    // What the Print button writes, less @page: a blank document holding only the sheet.
    // Text autosizing off, so a phone with enlarged text measures the layout it then draws.
    doc.open();
    doc.write(
      '<!doctype html><html><head><meta charset="utf-8"><style>' +
        "html{-webkit-text-size-adjust:100%;text-size-adjust:100%} body{margin:0}" +
        "</style></head><body><div></div></body></html>",
    );
    doc.close();
    const host = doc.body.firstElementChild as HTMLElement;
    const root = createRoot(host);
    try {
      flushSync(() => root.render(<QuotationPrint q={q} />));
      const sheet = host.querySelector<HTMLElement>(".quotationSheet");
      if (!sheet) throw new Error("The quotation sheet did not render");
      // Every picture decoded and every face loaded, or the PDF would catch them half-done.
      await Promise.all(
        Array.from(sheet.querySelectorAll("img")).map((img) => img.decode().catch(() => undefined)),
      );
      await doc.fonts?.ready;
      return await sheetToPdf(sheet, q.quotationNo);
    } finally {
      root.unmount();
    }
  } finally {
    frame.remove();
  }
}
