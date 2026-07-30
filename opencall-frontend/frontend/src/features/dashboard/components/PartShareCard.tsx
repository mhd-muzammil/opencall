import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CatalogPart } from "../../../lib/partsCatalogApiClient";
import { QUOTATION_LOGO_DATA_URL } from "./quotationAssets";

/**
 * "Share this part" card for the Parts Catalog.
 *
 * Renders a branded, WhatsApp-friendly price card for one catalog part onto a <canvas>
 * and lets the user download it as a PNG or copy the same details as plain text.
 *
 * The canvas IS the preview — the image the user sees is byte-for-byte the image they
 * download, so there is no second rendering path that can drift.
 *
 * Deliberately dependency-free (no html2canvas / dom-to-image): everything is drawn with
 * the Canvas 2D API, and the logo is the genuine Renderways mark already embedded for the
 * quotation print. Read-only — it touches no API and no catalog data.
 */

/**
 * Design width in CSS px; the bitmap is rendered at 2× for a crisp image. The HEIGHT is
 * computed from the content (description wrap, number of GST lines) so the card never
 * ships with dead white space at the bottom.
 */
const CARD_W = 1000;
const SCALE = 2;

const FONT = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

const INR = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function money(value: number): string {
  return `₹ ${INR.format(value)}`;
}

/**
 * The catalog stores GST as a FRACTION ("0.18", "0.09", "0.025") and uses the literal
 * "NA" when a part carries no rate. Returns the rate as a percentage, or null when the
 * catalog has no usable value.
 */
export function parseGstRate(raw: string | null | undefined): number | null {
  const text = (raw ?? "").trim();
  if (text === "" || text.toUpperCase() === "NA") return null;
  const numeric = Number(text.replace("%", "").trim());
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  // A value of 1 or less is a fraction (0.18 -> 18%); anything larger is already a percent.
  return numeric <= 1 ? numeric * 100 : numeric;
}

type GstMode = "INTRA" | "INTER";

export interface PartPricing {
  unit: number;
  qty: number;
  subtotal: number;
  lines: Array<{ label: string; amount: number }>;
  total: number;
  /** True when the catalog carries no usable GST rate for this part. */
  gstUnavailable: boolean;
}

export function computePartPricing(
  part: CatalogPart,
  qty: number,
  mode: GstMode,
): PartPricing {
  const unit = Number(part.price) || 0;
  const safeQty = Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1;
  const subtotal = unit * safeQty;

  const lines: Array<{ label: string; amount: number }> = [];
  if (mode === "INTRA") {
    const cgst = parseGstRate(part.cgst);
    const sgst = parseGstRate(part.sgst);
    if (cgst !== null) lines.push({ label: `CGST ${cgst}%`, amount: (subtotal * cgst) / 100 });
    if (sgst !== null) lines.push({ label: `SGST ${sgst}%`, amount: (subtotal * sgst) / 100 });
  } else {
    const igst = parseGstRate(part.igst);
    if (igst !== null) lines.push({ label: `IGST ${igst}%`, amount: (subtotal * igst) / 100 });
  }

  const tax = lines.reduce((sum, line) => sum + line.amount, 0);
  return {
    unit,
    qty: safeQty,
    subtotal,
    lines,
    total: subtotal + tax,
    gstUnavailable: lines.length === 0,
  };
}

/** Today's date in IST, formatted for the card footer. */
function todayIst(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());
}

/**
 * Splits `text` into the lines it will occupy at `maxWidth`, ellipsising the last one when
 * it runs past `maxLines`. Measuring is separated from drawing so the card height can be
 * known BEFORE the canvas is sized (resizing a canvas clears it, so it cannot be a
 * draw-then-measure).
 */
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      if (lines.length === maxLines - 1) {
        let truncated = line;
        while (ctx.measureText(`${truncated}…`).width > maxWidth && truncated.length > 1) {
          truncated = truncated.slice(0, -1);
        }
        lines.push(`${truncated}…`);
        return lines;
      }
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : ["-"];
}

const DESC_LINE_H = 30;
const DESC_MAX_LINES = 3;

function drawCard(
  canvas: HTMLCanvasElement,
  part: CatalogPart,
  pricing: PartPricing,
  mode: GstMode,
  logo: HTMLImageElement | null,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // ── Pass 1: measure ────────────────────────────────────────────────────────
  // Sizing the canvas clears it, so every variable-height piece is measured first.
  ctx.font = `400 21px ${FONT}`;
  const descLines = wrapLines(ctx, part.description || "-", CARD_W - 96, DESC_MAX_LINES);

  const descBottom = 286 + descLines.length * DESC_LINE_H;
  const chipsTop = descBottom + 14;
  const dividerY = chipsTop + 36 + 34;
  const detailsLabelY = dividerY + 40;
  const boxY = detailsLabelY + 74;

  const priceRowCount = 2 + pricing.lines.length;
  const naNoteH = pricing.gstUnavailable ? 34 : 0;
  const boxH = 110 + priceRowCount * 42 + naNoteH;
  const boxBottom = boxY + boxH;
  const cardH = boxBottom + 128;

  // ── Pass 2: draw ───────────────────────────────────────────────────────────
  canvas.width = CARD_W * SCALE;
  canvas.height = cardH * SCALE;
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.textBaseline = "alphabetic";

  // Card surface.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CARD_W, cardH);

  // ── Header band ────────────────────────────────────────────────────────────
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, CARD_W, 132);
  ctx.fillStyle = "#4f46e5";
  ctx.fillRect(0, 0, CARD_W, 6);

  if (logo && logo.naturalWidth > 0) {
    const logoH = 60;
    const logoW = (logo.naturalWidth / logo.naturalHeight) * logoH;
    ctx.drawImage(logo, 48, 40, logoW, logoH);
  } else {
    ctx.fillStyle = "#0f172a";
    ctx.font = `700 34px ${FONT}`;
    ctx.fillText("Renderways", 48, 82);
  }

  ctx.textAlign = "right";
  ctx.fillStyle = "#64748b";
  ctx.font = `700 15px ${FONT}`;
  ctx.fillText("SPARE PART — PRICE DETAILS", CARD_W - 48, 62);
  ctx.fillStyle = "#94a3b8";
  ctx.font = `400 15px ${FONT}`;
  ctx.fillText(todayIst(), CARD_W - 48, 88);
  ctx.textAlign = "left";

  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 132);
  ctx.lineTo(CARD_W, 132);
  ctx.stroke();

  // ── Part identity ──────────────────────────────────────────────────────────
  ctx.fillStyle = "#94a3b8";
  ctx.font = `700 15px ${FONT}`;
  ctx.fillText("PART NUMBER", 48, 200);

  ctx.fillStyle = "#0f172a";
  ctx.font = `700 42px ${FONT}`;
  ctx.fillText(part.partNumber || "-", 48, 246);

  ctx.fillStyle = "#475569";
  ctx.font = `400 21px ${FONT}`;
  descLines.forEach((line, index) => {
    ctx.fillText(line, 48, 286 + index * DESC_LINE_H);
  });

  // ── Attribute chips ────────────────────────────────────────────────────────
  let y = chipsTop;
  const chips = [
    part.category ? { text: part.category, bg: "#eef2ff", fg: "#3730a3" } : null,
    part.partsStatus ? { text: part.partsStatus, bg: "#dcfce7", fg: "#166534" } : null,
    part.eoslFlag
      ? {
          text: `EOSL: ${part.eoslFlag}`,
          bg: /^y/i.test(part.eoslFlag) ? "#fee2e2" : "#f1f5f9",
          fg: /^y/i.test(part.eoslFlag) ? "#991b1b" : "#475569",
        }
      : null,
  ].filter(Boolean) as Array<{ text: string; bg: string; fg: string }>;

  let chipX = 48;
  ctx.font = `700 16px ${FONT}`;
  for (const chip of chips) {
    const w = ctx.measureText(chip.text).width + 28;
    ctx.fillStyle = chip.bg;
    ctx.beginPath();
    ctx.roundRect(chipX, y, w, 36, 18);
    ctx.fill();
    ctx.fillStyle = chip.fg;
    ctx.fillText(chip.text, chipX + 14, y + 24);
    chipX += w + 10;
  }

  // ── Reference details ──────────────────────────────────────────────────────
  ctx.strokeStyle = "#e2e8f0";
  ctx.beginPath();
  ctx.moveTo(48, dividerY);
  ctx.lineTo(CARD_W - 48, dividerY);
  ctx.stroke();

  const details: Array<[string, string]> = [
    ["HSN CODE", part.hsnCode || "-"],
    ["VALIDITY", part.validity || "-"],
  ];
  let detailX = 48;
  for (const [label, value] of details) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = `700 14px ${FONT}`;
    ctx.fillText(label, detailX, detailsLabelY);
    ctx.fillStyle = "#0f172a";
    ctx.font = `600 22px ${FONT}`;
    ctx.fillText(value, detailX, detailsLabelY + 32);
    detailX += 300;
  }

  // ── Price block ────────────────────────────────────────────────────────────
  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.roundRect(48, boxY, CARD_W - 96, boxH, 16);
  ctx.fill();
  ctx.strokeStyle = "#e2e8f0";
  ctx.stroke();

  const labelX = 80;
  const valueX = CARD_W - 80;
  let rowY = boxY + 50;

  const row = (label: string, value: string, strong = false) => {
    ctx.fillStyle = strong ? "#0f172a" : "#475569";
    ctx.font = `${strong ? 700 : 400} 20px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(label, labelX, rowY);
    ctx.textAlign = "right";
    ctx.fillStyle = strong ? "#0f172a" : "#0f172a";
    ctx.font = `${strong ? 700 : 600} 20px ${FONT}`;
    ctx.fillText(value, valueX, rowY);
    ctx.textAlign = "left";
    rowY += 42;
  };

  row("Unit price", money(pricing.unit));
  row(`Quantity × ${pricing.qty}`, money(pricing.subtotal), true);

  for (const line of pricing.lines) {
    row(line.label, money(line.amount));
  }

  if (pricing.gstUnavailable) {
    ctx.fillStyle = "#b45309";
    ctx.font = `400 16px ${FONT}`;
    ctx.fillText(
      mode === "INTRA"
        ? "CGST / SGST not available in the catalog for this part"
        : "IGST not available in the catalog for this part",
      labelX,
      rowY,
    );
    rowY += 34;
  }

  // Total strip.
  ctx.strokeStyle = "#cbd5e1";
  ctx.beginPath();
  ctx.moveTo(labelX, rowY - 16);
  ctx.lineTo(valueX, rowY - 16);
  ctx.stroke();
  rowY += 26;

  ctx.fillStyle = "#0f172a";
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText("TOTAL", labelX, rowY);
  ctx.textAlign = "right";
  ctx.fillStyle = "#4f46e5";
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText(money(pricing.total), valueX, rowY + 4);
  ctx.textAlign = "left";

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footY = cardH - 74;
  ctx.strokeStyle = "#e2e8f0";
  ctx.beginPath();
  ctx.moveTo(48, footY - 26);
  ctx.lineTo(CARD_W - 48, footY - 26);
  ctx.stroke();

  ctx.fillStyle = "#64748b";
  ctx.font = `600 16px ${FONT}`;
  ctx.fillText("Renderways · Authorised HP Service Partner", 48, footY + 4);
  ctx.fillStyle = "#94a3b8";
  ctx.font = `400 14px ${FONT}`;
  ctx.fillText(
    `Indicative price from the parts catalog · ${
      mode === "INTRA" ? "Intra-state (CGST + SGST)" : "Inter-state (IGST)"
    }`,
    48,
    footY + 30,
  );
}

/** The same details as plain text, for pasting into WhatsApp / email. */
export function buildShareText(
  part: CatalogPart,
  pricing: PartPricing,
  mode: GstMode,
): string {
  const lines = [
    `*${part.partNumber}*`,
    part.description || "",
    "",
    `Category : ${part.category || "-"}`,
    `HSN      : ${part.hsnCode || "-"}`,
    `EOSL     : ${part.eoslFlag || "-"}`,
    `Validity : ${part.validity || "-"}`,
    `Status   : ${part.partsStatus || "-"}`,
    "",
    `Unit price : ${money(pricing.unit)}`,
    `Quantity   : ${pricing.qty}`,
    `Subtotal   : ${money(pricing.subtotal)}`,
  ];
  for (const line of pricing.lines) {
    lines.push(`${line.label.padEnd(11)}: ${money(line.amount)}`);
  }
  if (pricing.gstUnavailable) {
    lines.push(
      mode === "INTRA"
        ? "(CGST / SGST not available in the catalog)"
        : "(IGST not available in the catalog)",
    );
  }
  lines.push(
    `*TOTAL     : ${money(pricing.total)}*`,
    "",
    `Renderways · Authorised HP Service Partner`,
    `Indicative price · ${todayIst()}`,
  );
  return lines.join("\n");
}

export function PartShareCard({
  part,
  onClose,
}: Readonly<{ part: CatalogPart; onClose: () => void }>) {
  const [qtyInput, setQtyInput] = useState("1");
  const [mode, setMode] = useState<GstMode>("INTRA");
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const qty = Math.max(1, Math.floor(Number(qtyInput) || 1));
  const pricing = useMemo(() => computePartPricing(part, qty, mode), [part, qty, mode]);

  // Load the branded logo once; the card still renders (with a text wordmark) if it fails.
  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setLogo(image);
    };
    image.onerror = () => {
      if (!cancelled) setLogo(null);
    };
    image.src = QUOTATION_LOGO_DATA_URL;
    return () => {
      cancelled = true;
    };
  }, []);

  // Redraw whenever anything the card shows changes. The canvas is both preview and export.
  useEffect(() => {
    if (canvasRef.current) {
      drawCard(canvasRef.current, part, pricing, mode, logo);
    }
  }, [part, pricing, mode, logo]);

  // Escape closes, matching the other modals.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const safeName = (part.partNumber || "part").replace(/[^a-zA-Z0-9._-]/g, "_");
      link.download = `${safeName}-price.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [part.partNumber]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildShareText(part, pricing, mode));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [part, pricing, mode]);

  const btn = (primary: boolean): React.CSSProperties => ({
    padding: "9px 16px",
    fontSize: "13px",
    fontWeight: 600,
    borderRadius: "8px",
    border: primary ? "1px solid #4f46e5" : "1px solid #d1d5db",
    background: primary ? "#4f46e5" : "#ffffff",
    color: primary ? "#ffffff" : "#374151",
    cursor: "pointer",
    whiteSpace: "nowrap",
  });

  const modeBtn = (active: boolean): React.CSSProperties => ({
    padding: "7px 14px",
    fontSize: "12px",
    fontWeight: 600,
    borderRadius: "999px",
    border: `1px solid ${active ? "#4f46e5" : "#d1d5db"}`,
    background: active ? "#4f46e5" : "#ffffff",
    color: active ? "#ffffff" : "#374151",
    cursor: "pointer",
  });

  // Portalled to <body>: `.panel` sets backdrop-filter, which would otherwise become the
  // containing block for this fixed-position overlay.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Share part ${part.partNumber}`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "16px",
        overflow: "auto",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          background: "#ffffff",
          borderRadius: "14px",
          padding: "20px",
          width: "min(620px, 100%)",
          maxHeight: "92vh",
          overflowY: "auto",
          boxShadow: "0 24px 48px rgba(15, 23, 42, 0.3)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "12px",
            marginBottom: "14px",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Share part details</h3>
            <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#6b7280" }}>
              Download as an image or copy as text — exactly what you see below.
            </p>
          </div>
          <button type="button" onClick={onClose} style={btn(false)}>
            Close
          </button>
        </div>

        {/* Controls */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
            marginBottom: "14px",
          }}
        >
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>Qty</label>
          <input
            type="number"
            min={1}
            value={qtyInput}
            onChange={(event) => setQtyInput(event.target.value)}
            style={{
              width: "80px",
              padding: "7px 10px",
              fontSize: "13px",
              borderRadius: "8px",
              border: "1px solid #d1d5db",
            }}
          />
          <span style={{ width: "1px", height: "22px", background: "#e5e7eb" }} />
          <button type="button" onClick={() => setMode("INTRA")} style={modeBtn(mode === "INTRA")}>
            CGST + SGST
          </button>
          <button type="button" onClick={() => setMode("INTER")} style={modeBtn(mode === "INTER")}>
            IGST
          </button>
        </div>

        {/* Live preview — this canvas is the downloaded PNG. */}
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "auto",
            display: "block",
            borderRadius: "12px",
            border: "1px solid #e5e7eb",
          }}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            marginTop: "16px",
            flexWrap: "wrap",
          }}
        >
          <button type="button" onClick={() => void handleCopy()} style={btn(false)}>
            {copied ? "Copied ✓" : "Copy as text"}
          </button>
          <button type="button" onClick={handleDownload} style={btn(true)}>
            ⬇ Download image
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
