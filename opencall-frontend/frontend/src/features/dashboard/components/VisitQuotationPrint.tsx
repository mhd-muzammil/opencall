import type { Quotation } from "../../../lib/quotationApiClient";
import {
  QUOTATION_COMPANY,
  QUOTATION_TERMS,
  amountInWords,
  formatMoney,
  formatQuotationDate,
} from "../../../lib/quotationFormat";
import { quotationTotals, resolveLineItems } from "../../../lib/quotationTotals";
import {
  QUOTATION_LOGO_DATA_URL,
  QUOTATION_QR_DATA_URL,
  QUOTATION_SIGN_DATA_URL,
} from "./quotationAssets";

/**
 * The Visit quotation sheet, laid out as the office's own visit quotation (5166159539.pdf,
 * made in Excel): every row, rule, font and size below is read off that PDF, in mm, so the
 * sheet prints the way the customer is used to seeing it.
 *
 * Only the Excel slips are left behind: terms cut off at the cell edge, "metioned" and
 * "FourtyNine". The terms and the amount in words are the Part sheet's own.
 *
 * Inline styles and data-URL images only, on a root that keeps the `quotationSheet` class:
 * the print popup copies nothing but this element's markup.
 */

const BOOK = "'Book Antiqua', 'Palatino Linotype', Palatino, serif";
const ARIAL = "Arial, Helvetica, sans-serif";
const CALIBRI = "Calibri, Carlito, 'Segoe UI', Arial, sans-serif";

/** Excel's "White, darker 5%", on the cells the sample shades. Printed even with backgrounds off. */
const SHADE: React.CSSProperties = {
  background: "#f2f2f2",
  WebkitPrintColorAdjust: "exact",
  printColorAdjust: "exact",
};

const RULE = "0.3mm solid #000";

/** The four Excel columns under the table: Description, Model No, Sl.No, Amount. */
const COLUMNS = ["78.8mm", "30.1mm", "31.9mm", "39.2mm"];

/**
 * How far a face's baseline sits below the top of its box at line-height 1, as a share of
 * the font size, measured in Chrome against the sample. Fixed text in the header is placed
 * by its baseline, as the sample gives it.
 */
const RISE = { book: 0.793, bookBold: 0.715, arial: 0.847 } as const;

/** One line of the header, its baseline `baseline` mm from the top of the page. */
function HeaderLine({
  left,
  right,
  center,
  baseline,
  face,
  sizePt,
  bold,
  color,
  children,
}: Readonly<{
  left?: number;
  right?: number;
  /** Centre the text on this span (from, to) of the content width. */
  center?: [number, number];
  baseline: number;
  face: keyof typeof RISE;
  sizePt: number;
  bold?: boolean;
  color?: string;
  children: React.ReactNode;
}>) {
  const sizeMm = (sizePt * 25.4) / 72;
  const top = baseline - RISE[face] * sizeMm;
  return (
    <div
      style={{
        position: "absolute",
        top: `${top.toFixed(2)}mm`,
        ...(left !== undefined ? { left: `${left}mm` } : {}),
        ...(right !== undefined ? { right: `${right}mm` } : {}),
        ...(center
          ? { left: `${center[0]}mm`, width: `${center[1] - center[0]}mm`, textAlign: "center" as const }
          : {}),
        fontFamily: face === "arial" ? ARIAL : BOOK,
        fontSize: `${sizePt}pt`,
        fontWeight: bold || face === "bookBold" ? 700 : 400,
        lineHeight: 1,
        whiteSpace: "pre",
        color: color ?? "#000",
      }}
    >
      {children}
    </div>
  );
}

export function VisitQuotationPrint({
  q,
  images,
}: Readonly<{
  q: Quotation;
  images?: { logo?: string; qr?: string; sign?: string };
}>) {
  // The Visit sheet carries the Bank of Baroda poster, as the office's visit quotation does.
  const qrUrl = images?.qr ?? QUOTATION_QR_DATA_URL;
  const signUrl = images?.sign ?? QUOTATION_SIGN_DATA_URL;
  const logoUrl = images?.logo ?? QUOTATION_LOGO_DATA_URL;

  // Shared with the forms, so the sheet can never disagree with the form that produced it.
  const items = resolveLineItems(q);
  const { subtotal, sgst, cgst, totalTax, total } = quotationTotals(
    items,
    q.sgstPercent,
    q.cgstPercent,
  );

  // The template keeps two rows for units; a second unit takes the empty one, more add rows.
  const unitRows = Math.max(items.length, 2);

  const cell: React.CSSProperties = {
    borderLeft: RULE,
    borderRight: RULE,
    padding: "0 0.4mm 0.35mm",
    verticalAlign: "bottom",
    fontSize: "7.44pt",
    // A description longer than its column wraps and the row grows, rather than being cut
    // off the customer's copy the way Excel cuts it.
    lineHeight: 1,
    overflowWrap: "anywhere",
  };
  const ruled: React.CSSProperties = { borderTop: RULE, borderBottom: RULE };
  const amount: React.CSSProperties = { ...cell, textAlign: "right", paddingRight: "1.25mm" };
  // Bold Book Antiqua stands about 0.35mm taller in Chrome than in Excel; on the cell floor
  // it lands on the sample's baseline.
  const bold: React.CSSProperties = { fontWeight: 700, paddingBottom: 0 };

  const customerLines = [
    q.customerName,
    q.customerAddress,
    q.customerCity,
    q.customerState,
    q.customerPincode,
    q.customerPhone,
    q.customerEmail,
  ];

  return (
    <div
      className="quotationSheet"
      style={{
        width: "210mm",
        minHeight: "297mm",
        background: "#fff",
        color: "#000",
        padding: "0 15mm",
        margin: "0 auto",
        fontFamily: BOOK,
        fontSize: "7.44pt",
        boxSizing: "border-box",
      }}
    >
      {/* Header: fixed text, each line where the sample has it. */}
      <div style={{ position: "relative", height: "67.4mm" }}>
        {logoUrl ? (
          // The sample shows the logo trimmed to its cell; the trim is kept.
          <div
            style={{
              position: "absolute",
              left: "-0.3mm",
              top: "19.1mm",
              width: "64.2mm",
              height: "12.3mm",
              overflow: "hidden",
            }}
          >
            <img
              src={logoUrl}
              alt=""
              style={{ position: "absolute", left: "-5.6mm", top: "-1.2mm", width: "69.8mm", height: "13.5mm" }}
            />
          </div>
        ) : null}
        <HeaderLine right={2.8} baseline={26.8} face="arial" sizePt={23.28} color="#808080">
          QUOTATION
        </HeaderLine>
        <HeaderLine left={0.5} baseline={32.3} face="arial" sizePt={9.12} bold>
          {QUOTATION_COMPANY.name}
        </HeaderLine>
        {QUOTATION_COMPANY.addressLines.map((line, i) => (
          <HeaderLine key={line} left={0.4} baseline={36.1 + i * 3.8} face="book" sizePt={7.44}>
            {line}
          </HeaderLine>
        ))}
        <HeaderLine left={0.4} baseline={47.4} face="book" sizePt={7.44}>
          GST # {QUOTATION_COMPANY.gst}
        </HeaderLine>
        <HeaderLine left={0.4} baseline={51.2} face="book" sizePt={7.44}>
          {QUOTATION_COMPANY.phone}
        </HeaderLine>

        <HeaderLine left={109.2} baseline={39.9} face="bookBold" sizePt={7.44}>
          Quotation Date :
        </HeaderLine>
        <HeaderLine left={141.1} baseline={39.9} face="book" sizePt={7.44}>
          {formatQuotationDate(q.quotationDate)}
        </HeaderLine>
        <HeaderLine left={109.2} baseline={43.7} face="bookBold" sizePt={7.44}>
          Quotation #
        </HeaderLine>
        <HeaderLine left={141.7} baseline={43.7} face="book" sizePt={6.6}>
          {q.quotationNo}
        </HeaderLine>
        <HeaderLine left={109.2} baseline={58.6} face="bookBold" sizePt={7.44}>
          CASE ID
        </HeaderLine>
        <HeaderLine center={[140.8, 180]} baseline={58.7} face="arial" sizePt={8.28}>
          {q.caseId}
        </HeaderLine>
        <HeaderLine left={0.4} baseline={62.5} face="bookBold" sizePt={7.44}>
          To:
        </HeaderLine>
        <HeaderLine left={109.2} baseline={62.5} face="bookBold" sizePt={7.44}>
          ORDER NUMBER
        </HeaderLine>
        <HeaderLine center={[140.8, 180]} baseline={62.7} face="arial" sizePt={8.28}>
          {q.orderNumber}
        </HeaderLine>
      </div>

      {/* The customer, a row each like the template's, the email included. A long line
          wraps rather than run off the sheet. */}
      <div style={{ fontSize: "7.44pt", lineHeight: "3.77mm", paddingLeft: "0.4mm", maxWidth: "140mm" }}>
        {customerLines.map((line, i) => (
          <div key={i} style={{ minHeight: "3.77mm" }}>
            {line}
          </div>
        ))}
      </div>

      {/* The sample's rules sit just outside the text column, so the table steps left by one. */}
      <table
        style={{
          width: "180mm",
          tableLayout: "fixed",
          borderCollapse: "collapse",
          marginTop: "3.5mm",
          marginLeft: "-0.3mm",
        }}
      >
        <colgroup>
          {COLUMNS.map((width, i) => (
            <col key={i} style={{ width }} />
          ))}
        </colgroup>
        <tbody>
          <tr style={{ height: "3.6mm" }}>
            <td colSpan={3} style={{ ...cell, ...ruled, ...SHADE, ...bold, padding: 0 }}>
              <div style={{ width: COLUMNS[0], textAlign: "center" }}>DESCRIPTION</div>
            </td>
            <td style={{ ...cell, ...ruled, ...SHADE, ...bold, textAlign: "center" }}>AMOUNT</td>
          </tr>
          <tr style={{ height: "3.8mm" }}>
            <td colSpan={3} style={{ ...cell, ...ruled, textAlign: "center" }}>
              Service Charge of HP Printer having details as
            </td>
            <td style={{ ...cell, ...ruled, ...SHADE }} />
          </tr>
          <tr style={{ height: "3.6mm" }}>
            <td style={{ ...cell, ...ruled }}>Description</td>
            <td style={{ ...cell, ...ruled }}>Model No</td>
            <td style={{ ...cell, ...ruled }}>Sl.No</td>
            <td style={{ ...cell, ...ruled }} />
          </tr>
          {Array.from({ length: unitRows }, (_, index) => {
            const item = items[index];
            if (!item) {
              return (
                <tr key={index} style={{ height: "3.8mm" }}>
                  <td style={{ ...cell, ...ruled, ...SHADE }} />
                  <td style={{ ...cell, ...ruled }} />
                  <td style={{ ...cell, ...ruled }} />
                  <td style={{ ...cell, ...ruled }} />
                </tr>
              );
            }
            const unit = { ...cell, ...ruled, ...SHADE, paddingLeft: "1mm" };
            return (
              <tr key={index} style={{ height: "3.7mm" }}>
                <td style={unit}>{item.productDescription}</td>
                <td style={unit}>{item.modelNo}</td>
                <td style={unit}>{item.serialNo}</td>
                <td style={{ ...amount, ...ruled, ...SHADE }}>{formatMoney(item.baseAmount)}</td>
              </tr>
            );
          })}
          {/* The template's blank rows, with its staggered rule on the right as drawn. */}
          <tr style={{ height: "3.8mm" }}>
            <td colSpan={3} rowSpan={2} style={{ ...cell, ...ruled }} />
            <td style={{ ...cell, ...ruled, ...SHADE }} />
          </tr>
          <tr style={{ height: "3.6mm" }}>
            <td rowSpan={2} style={{ ...cell, ...ruled }} />
          </tr>
          <tr style={{ height: "3.6mm" }}>
            <td colSpan={3} style={{ ...cell, ...ruled }} />
          </tr>
          <tr style={{ height: "3.6mm" }}>
            <td colSpan={3} style={{ ...cell, ...ruled }} />
            <td style={{ ...cell, ...ruled }} />
          </tr>
          <tr style={{ height: "3.6mm" }}>
            <td colSpan={3} style={{ ...cell, ...ruled }} />
            <td style={{ ...cell, ...ruled }} />
          </tr>

          <tr style={{ height: "3.6mm" }}>
            <td colSpan={3} style={{ ...cell, ...ruled }}>Total Amount</td>
            <td style={{ ...amount, ...ruled, ...bold }}>{formatMoney(subtotal)}</td>
          </tr>
          {/* SGST, CGST and the tax total share one ruled block, as on the sample. */}
          <tr style={{ height: "3.6mm" }}>
            <td colSpan={3} style={{ ...cell, borderTop: RULE }}>SGST @ {q.sgstPercent} %</td>
            <td style={{ ...amount, borderTop: RULE }}>{formatMoney(sgst)}</td>
          </tr>
          <tr style={{ height: "3.6mm" }}>
            <td colSpan={3} style={cell}>CGST @ {q.cgstPercent} %</td>
            <td style={amount}>{formatMoney(cgst)}</td>
          </tr>
          <tr style={{ height: "3.6mm" }}>
            <td colSpan={3} style={{ ...cell, borderBottom: RULE }}>Total TAX Amount</td>
            <td style={{ ...amount, borderBottom: RULE }}>{formatMoney(totalTax)}</td>
          </tr>
          <tr style={{ height: "4.1mm" }}>
            <td colSpan={3} style={{ ...cell, borderTop: RULE, fontSize: "9.12pt", fontWeight: 700 }}>
              Total Quotation Value
            </td>
            <td style={{ ...amount, borderTop: RULE, fontSize: "9.12pt", fontWeight: 700, paddingRight: "1.5mm" }}>
              {formatMoney(total)}
            </td>
          </tr>
          <tr style={{ height: "3.8mm" }}>
            <td colSpan={3} style={{ ...cell, borderBottom: RULE, fontSize: "8.28pt" }}>
              {amountInWords(total)}
            </td>
            <td style={{ ...cell, borderBottom: RULE }} />
          </tr>

          {/* PAN and the signature, inside the same border. */}
          <tr style={{ height: "22.6mm" }}>
            <td colSpan={4} style={{ ...cell, ...ruled, padding: 0, position: "relative" }}>
              <PanBlockLine left={0.4} baseline={2.7}>PAN # {QUOTATION_COMPANY.pan}</PanBlockLine>
              <PanBlockLine left={0.4} baseline={6.5}>GST # {QUOTATION_COMPANY.gst}</PanBlockLine>
              <PanBlockLine right={0.5} baseline={2.75} bold>
                For {QUOTATION_COMPANY.name}
              </PanBlockLine>
              {signUrl ? (
                <img
                  src={signUrl}
                  alt=""
                  style={{ position: "absolute", right: "3.2mm", top: "3.6mm", width: "27.6mm", height: "13.8mm" }}
                />
              ) : null}
              <PanBlockLine right={0.5} baseline={21.6} bold>
                Authorized Signatory
              </PanBlockLine>
            </td>
          </tr>
          <tr style={{ height: "3.8mm" }}>
            <td colSpan={4} style={{ ...cell, ...ruled, ...bold, textAlign: "center" }}>
              THANKS FOR YOUR BUSINESS WITH US
            </td>
          </tr>
          <tr style={{ height: "3.77mm" }}>
            <td colSpan={4} style={{ ...cell, borderTop: RULE, whiteSpace: "pre" }}>
              A. <b>Bank:</b> {QUOTATION_COMPANY.bank.name},{" "}
              <b>
                A/c : {QUOTATION_COMPANY.bank.account}   IFSC Code: {QUOTATION_COMPANY.bank.ifsc}
              </b>
            </td>
          </tr>
          <tr style={{ height: "3.77mm" }}>
            <td colSpan={4} style={cell}>
              B. Payments to be in advance and details of the payment to be shared on mail with us{" "}
              {QUOTATION_COMPANY.email}
            </td>
          </tr>
          <tr style={{ height: "3.76mm" }}>
            <td colSpan={4} style={{ ...cell, borderBottom: RULE }}>
              C. Please refer the Terms and Conditions as mentioned in page 2
            </td>
          </tr>
        </tbody>
      </table>

      {/* Page 2 — the GST note above and below the terms, then the QR. */}
      <div
        style={{
          pageBreakBefore: "always",
          paddingTop: "22.7mm",
          fontFamily: CALIBRI,
          fontSize: "8.28pt",
          lineHeight: "3.77mm",
        }}
      >
        <div style={{ textAlign: "center", fontSize: "9.12pt", lineHeight: "4.2mm" }}>
          *<b>PLEASE SHARE YOUR GST NO AND ENTITY NAME IN CASE YOU NEED TO CLAIM THE INPUT TAX BENEFITS</b> *
        </div>
        <div style={{ paddingLeft: "0.4mm" }}>
          <div>Terms &amp; Conditions:</div>
          {QUOTATION_TERMS.map((term, i) => (
            <div key={i}>
              {i + 1}. {term}
            </div>
          ))}
          <div style={{ whiteSpace: "pre" }}>
            Company GSTIN No: {QUOTATION_COMPANY.gst}   Company PAN No   : {QUOTATION_COMPANY.pan}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          *<b>PLEASE SHARE YOUR GST NO AND ENTITY NAME IN CASE YOU NEED TO CLAIM THE INPUT TAX BENEFITS</b> *
        </div>
        {qrUrl ? (
          <>
            <div
              style={{
                marginTop: "3.77mm",
                paddingLeft: "0.4mm",
                fontSize: "9.12pt",
                fontWeight: 700,
                lineHeight: "3.9mm",
              }}
            >
              Scan QR Code
            </div>
            <img
              src={qrUrl}
              alt=""
              style={{ display: "block", marginTop: "0.9mm", marginLeft: "-0.3mm", width: "49.5mm", height: "82.4mm" }}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

/** A line inside the PAN / signature cell, its baseline `baseline` mm below the cell's top. */
function PanBlockLine({
  left,
  right,
  baseline,
  bold,
  children,
}: Readonly<{ left?: number; right?: number; baseline: number; bold?: boolean; children: React.ReactNode }>) {
  const sizeMm = (7.44 * 25.4) / 72;
  const top = baseline - (bold ? RISE.bookBold : RISE.book) * sizeMm;
  return (
    <div
      style={{
        position: "absolute",
        top: `${top.toFixed(2)}mm`,
        ...(left !== undefined ? { left: `${left}mm` } : {}),
        ...(right !== undefined ? { right: `${right}mm` } : {}),
        fontWeight: bold ? 700 : 400,
        lineHeight: 1,
        whiteSpace: "pre",
      }}
    >
      {children}
    </div>
  );
}
