import type { DeliveryChallan } from "../../../lib/deliveryChallanApiClient";
import { challanLines, formatChallanDate } from "../../../lib/deliveryChallanFormat";

/**
 * Print-exact delivery challan, matching the owner's own Word template (the
 * "Warranty Replacement" challan): the title, the yellow "returnable" band, the bordered
 * grid, and the goods table running to the foot of ONE A4 sheet.
 *
 * Every size and position below was measured off a scan of that template rather than
 * chosen: 11.5pt bold Calibri throughout, 14.8pt for the title, 10.5pt for the band, 9.5pt
 * Arial for the customer's details, and the grid's column and row lines where the template
 * has them. (Word's 11pt Calibri prints about 5% wider than a browser's, hence 11.5.)
 *
 * The letterhead printed is the challan's own copy (`branchHeader`), not the branch as it
 * stands today — a challan already handed over must print the same tomorrow.
 *
 * Every cell sets its own font, padding and wrapping. The preview is portaled into the
 * app, whose global stylesheet styles every `td` (13px, nowrap, padding) and every `th`
 * (sticky, grey, uppercase) — so the sheet uses no `th` at all, and the print window,
 * which gets only these inline styles, comes out the same as the preview.
 */

const LINE = "1px solid #000";
const CALIBRI = "Calibri, Carlito, 'Segoe UI', Arial, Helvetica, sans-serif";
const ARIAL = "Arial, Helvetica, sans-serif";

// The template's columns, as fractions of the grid's width. Upper grid: the letterhead /
// customer half (phone | email), then the labels column and the values column.
const UPPER_COLUMNS = ["16.2%", "25.3%", "19.6%", "38.9%"];
// Goods table: S. No | Description of Goods | HSN/SAC | Qty | Rate | Per | the template's
// empty right-hand column.
const ITEM_COLUMNS = [7.2, 34.3, 8.9, 5.1, 7.7, 18.6, 18.2];
// Where the goods table's column rules fall — each column's right edge but the last,
// whose right edge is the grid's own border.
const ITEM_RULES = ITEM_COLUMNS.slice(0, -1).reduce<number[]>(
  (edges, width) => [...edges, Math.round(((edges.at(-1) ?? 0) + width) * 10) / 10],
  [],
);

/**
 * A grid cell. Lines are drawn on the right and bottom only — the grid's own border is
 * the outside edge, so no line is drawn twice. Cells in the last column pass
 * `right: false`, and the one cell the template leaves open below passes `bottom: false`.
 */
function cell(
  borders: { right?: boolean; bottom?: boolean } = {},
  style: React.CSSProperties = {},
): React.CSSProperties {
  return {
    borderTop: "none",
    borderLeft: "none",
    borderRight: borders.right === false ? "none" : LINE,
    borderBottom: borders.bottom === false ? "none" : LINE,
    padding: "0.8mm 1.2mm",
    verticalAlign: "top",
    textAlign: "left",
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    background: "#fff",
    color: "#000",
    fontFamily: CALIBRI,
    fontSize: "11.5pt",
    fontWeight: 700,
    lineHeight: 1.18,
    ...style,
  };
}

/** The customer's own details are set in the template's smaller Arial. */
const ARIAL_TEXT: React.CSSProperties = { fontFamily: ARIAL, fontSize: "9.5pt", lineHeight: 1.15 };

/** One blank line, the template's spacing between its letterhead lines and product names. */
const BLANK_LINE = "1.18em";

/**
 * Several serials, case IDs or product numbers print side by side on one line, as on the
 * template, wrapping only when there are too many for the cell.
 */
function SideBySide({ values }: Readonly<{ values: readonly string[] }>) {
  return (
    <>
      {values.map((value, index) => (
        <span key={index} style={{ display: "inline-block", margin: "0 1.5mm" }}>
          {value}
        </span>
      ))}
    </>
  );
}

/** A text field as printed: never "null" or "undefined" on a customer's document. */
function text(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

export function DeliveryChallanPrint({ c }: Readonly<{ c: DeliveryChallan }>) {
  const header = c.branchHeader ?? {
    companyLine: "",
    addressLines: "",
    gstin: "",
    contact: "",
    email: "",
  };
  const serials = challanLines(c.productSerials);
  const caseIds = challanLines(c.caseIds);
  const productNumbers = challanLines(c.productNumbers);
  const productNames = challanLines(c.productNames);

  // A label with what was typed for it underneath, in the same cell — the template's
  // cells hold only the label, so a challan with these left blank prints exactly as it.
  const labelled = (label: string, value: string) => (
    <>
      <div>{label}</div>
      {text(value) ? <div style={{ whiteSpace: "pre-line" }}>{text(value)}</div> : null}
    </>
  );

  const itemCell = (style: React.CSSProperties = {}): React.CSSProperties =>
    cell({ right: false, bottom: false }, { padding: "0.8mm 0.9mm 4.7mm", ...style });

  return (
    <div
      className="deliveryChallanSheet"
      style={{
        width: "210mm",
        // A hair under A4, so the browser never spills an empty second page.
        minHeight: "296mm",
        background: "#fff",
        color: "#000",
        padding: "15.6mm 5mm 12.5mm",
        margin: "0 auto",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        fontFamily: CALIBRI,
        fontSize: "11.5pt",
        fontWeight: 700,
        lineHeight: 1.18,
      }}
    >
      {/* The template reads "DELEVERY"; the typo is not carried over. */}
      <div data-testid="dc-title" style={{ textAlign: "center", fontSize: "14.8pt", lineHeight: 1.2 }}>
        DELIVERY CHALLAN (Warranty Replacement)
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginTop: "4.1mm", marginBottom: "0.75mm" }}>
        <span
          data-testid="dc-band"
          style={{
            background: "#ffff00",
            fontSize: "10.5pt",
            lineHeight: 1.2,
            padding: "0 1.7mm",
            // Browsers drop background colours when printing unless told otherwise, and
            // the band is the one thing on the sheet that must not lose its colour.
            WebkitPrintColorAdjust: "exact",
            printColorAdjust: "exact",
          }}
        >
          Defective parts should be returnable
        </span>
      </div>

      {/* The grid: one box from under the band to the foot of the page. */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", border: LINE }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            {UPPER_COLUMNS.map((width, index) => (
              <col key={index} style={{ width }} />
            ))}
          </colgroup>
          <tbody>
            {/* Letterhead on the left; number, date and references on the right. */}
            <tr style={{ height: "10.4mm" }}>
              <td
                colSpan={2}
                rowSpan={4}
                data-testid="dc-header"
                style={cell({}, { textAlign: "center", padding: "1mm 0.5mm" })}
              >
                <div>{text(header.companyLine)}</div>
                {challanLines(header.addressLines).map((line, index) => (
                  <div key={index}>{line}</div>
                ))}
                <div style={{ marginTop: BLANK_LINE }}>GSTIN/UIN: {text(header.gstin)}</div>
                <div style={{ marginTop: BLANK_LINE }}>Contact: {text(header.contact)}</div>
                <div style={{ marginTop: BLANK_LINE }}>E-Mail: {text(header.email)}</div>
              </td>
              <td data-testid="dc-number" style={cell({}, { padding: "0.8mm 1.2mm 0 7.5mm" })}>
                <div>DC No. {c.dcSeq}</div>
                <div>{c.finYear}</div>
              </td>
              <td data-testid="dc-date" style={cell({ right: false }, { textAlign: "center" })}>
                Date: {formatChallanDate(c.challanDate)}
              </td>
            </tr>
            <tr style={{ height: "7.2mm" }}>
              <td style={cell()} />
              <td data-testid="dc-mode-terms" style={cell({ right: false }, { textAlign: "center" })}>
                {labelled("Mode/Terms of Payment", c.modeTerms)}
              </td>
            </tr>
            <tr style={{ height: "7.1mm" }}>
              <td data-testid="dc-ref-no-date" style={cell({}, { paddingLeft: "3.5mm" })}>
                {labelled("Ref No. & Date.", c.refNoDate)}
              </td>
              <td
                data-testid="dc-other-references"
                style={cell({ right: false }, { textAlign: "center" })}
              >
                {labelled("Other References", c.otherReferences)}
              </td>
            </tr>
            <tr style={{ height: "21.4mm" }}>
              <td style={cell({}, { textAlign: "center", paddingTop: "4mm" })}>
                {/* As small as the template has it. */}
                <div style={{ fontFamily: ARIAL, fontSize: "5.6pt", lineHeight: 1.2 }}>
                  Product Serial
                </div>
              </td>
              <td
                data-testid="dc-serials"
                style={cell({ right: false }, { textAlign: "center", paddingTop: "3.4mm" })}
              >
                <SideBySide values={serials} />
              </td>
            </tr>

            {/* Customer on the left; the cases and products on the right. */}
            <tr style={{ height: "6.7mm" }}>
              <td
                colSpan={2}
                data-testid="dc-customer-name"
                style={cell({}, { ...ARIAL_TEXT, fontWeight: 400, padding: "0.7mm 1.5mm" })}
              >
                Name :{text(c.customerName)}
              </td>
              {/* Open at the bottom: "Case ID" and "Product Number" share one box. */}
              <td
                rowSpan={2}
                style={cell({ bottom: false }, { ...ARIAL_TEXT, textAlign: "center", paddingTop: "1.4mm" })}
              >
                Case ID
              </td>
              <td
                rowSpan={2}
                data-testid="dc-case-ids"
                style={cell({ right: false }, { textAlign: "center", paddingTop: "0.3mm" })}
              >
                <SideBySide values={caseIds} />
              </td>
            </tr>
            <tr style={{ height: "7.8mm" }}>
              <td
                data-testid="dc-customer-phone"
                style={cell({}, { ...ARIAL_TEXT, padding: "0.3mm 1mm" })}
              >
                {text(c.customerPhone)}
              </td>
              <td
                data-testid="dc-customer-email"
                style={cell({}, { ...ARIAL_TEXT, padding: "0.3mm 1mm" })}
              >
                {text(c.customerEmail)}
              </td>
            </tr>
            <tr style={{ height: "5.2mm" }}>
              <td colSpan={2} rowSpan={2} style={cell()} />
              <td style={cell({}, { ...ARIAL_TEXT, textAlign: "center", verticalAlign: "middle", padding: "0.3mm 0.5mm" })}>
                Product Number
              </td>
              <td
                data-testid="dc-product-numbers"
                style={cell({ right: false }, { textAlign: "center", verticalAlign: "middle", padding: "0 1.2mm" })}
              >
                <SideBySide values={productNumbers} />
              </td>
            </tr>
            <tr style={{ height: "8.4mm" }}>
              <td
                colSpan={2}
                rowSpan={2}
                data-testid="dc-product-names"
                style={cell({ right: false }, { textAlign: "center", paddingTop: "9.9mm" })}
              >
                {productNames.map((name, index) => (
                  <div key={index} style={{ marginTop: index === 0 ? 0 : BLANK_LINE }}>
                    {name}
                  </div>
                ))}
              </td>
            </tr>
            <tr style={{ height: "31.4mm" }}>
              <td
                colSpan={2}
                data-testid="dc-customer-address"
                style={cell({}, { ...ARIAL_TEXT, lineHeight: 1.1, textAlign: "center", whiteSpace: "pre-line", padding: "3mm 2mm 1mm" })}
              >
                {text(c.customerAddress).toUpperCase()}
              </td>
            </tr>
          </tbody>
        </table>

        {/* The goods. Rows have no lines between them; the column rules run from the
            heading to the foot of the page however few rows there are, as on the template. */}
        <div style={{ flex: 1, position: "relative" }}>
          <table
            data-testid="dc-items"
            style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}
          >
            <colgroup>
              {ITEM_COLUMNS.map((width, index) => (
                <col key={index} style={{ width: `${width}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr style={{ height: "9.9mm" }}>
                {["S. No", "Description of Goods", "HSN/\nSAC", "Qty", "Rate", "Per", ""].map(
                  (heading, index) => (
                    <td
                      key={index}
                      style={cell(
                        { right: false },
                        { textAlign: "center", verticalAlign: "middle", whiteSpace: "pre-line", padding: "0.5mm" },
                      )}
                    >
                      {heading}
                    </td>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {(c.items ?? []).map((item, index) => (
                <tr key={index} data-testid="dc-item-row">
                  <td style={itemCell({ textAlign: "center" })}>{index + 1}</td>
                  <td style={itemCell()}>{item.description}</td>
                  {/* Snug to the rules, as the template has it: an 8-digit HSN code only just
                      fits the column, and must not break in the middle. */}
                  <td style={itemCell({ paddingLeft: "0.4mm", paddingRight: "0.2mm" })}>{item.hsnSac}</td>
                  <td style={itemCell({ textAlign: "center" })}>{item.qty}</td>
                  <td style={itemCell({ textAlign: "center" })}>{item.rate}</td>
                  <td style={itemCell({ textAlign: "center" })}>{item.per}</td>
                  <td style={itemCell()} />
                </tr>
              ))}
            </tbody>
          </table>
          <div aria-hidden="true" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, pointerEvents: "none" }}>
            {ITEM_RULES.map((edge) => (
              <div
                key={edge}
                style={{ position: "absolute", top: 0, bottom: 0, left: `${edge}%`, borderLeft: LINE }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
