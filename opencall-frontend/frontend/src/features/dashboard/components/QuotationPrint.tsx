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
 * Print-exact quotation, matching the RENDERWAYS quotation PDF. Rendered inside a
 * fixed A4-width sheet; the parent hides everything else while printing so the browser's
 * "Save as PDF" produces the two-page document. Logo / QR / signature images are dropped
 * in via the *imageUrls* prop (data URLs) once supplied; until then their slots are blank.
 */
export function QuotationPrint({
  q,
  images,
}: Readonly<{
  q: Quotation;
  images?: { logo?: string; qr?: string; sign?: string };
}>) {
  // Default to the embedded RENDERWAYS logo + QR + signature; a caller can override.
  const qrUrl = images?.qr ?? QUOTATION_QR_DATA_URL;
  const signUrl = images?.sign ?? QUOTATION_SIGN_DATA_URL;
  const logoUrl = images?.logo ?? QUOTATION_LOGO_DATA_URL;

  // Shared with both create forms, so the sheet can never disagree with the form that
  // produced it. `resolveLineItems` also covers a quotation raised before line items
  // existed, which would otherwise print blank.
  const items = resolveLineItems(q);
  const { subtotal, sgst, cgst, totalTax, total } = quotationTotals(
    items,
    q.sgstPercent,
    q.cgstPercent,
  );

  const border = "1px solid #000";
  const cell: React.CSSProperties = {
    border,
    padding: "4px 8px",
    fontSize: "11px",
    verticalAlign: "top",
  };

  return (
    <div
      className="quotationSheet"
      style={{
        width: "210mm",
        minHeight: "297mm",
        background: "#fff",
        color: "#000",
        padding: "14mm 12mm",
        margin: "0 auto",
        fontFamily: "'Times New Roman', Times, serif",
        boxSizing: "border-box",
      }}
    >
      {/* Header: logo + company on the left, big QUOTATION on the right */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ maxWidth: "60%" }}>
          {logoUrl ? (
            <img src={logoUrl} alt="" style={{ maxWidth: "260px", marginBottom: "8px" }} />
          ) : null}
          <div style={{ fontWeight: 700, fontSize: "13px" }}>{QUOTATION_COMPANY.name}</div>
          {QUOTATION_COMPANY.addressLines.map((line) => (
            <div key={line} style={{ fontSize: "11px" }}>{line}</div>
          ))}
          <div style={{ fontSize: "11px" }}>GST # {QUOTATION_COMPANY.gst}</div>
          <div style={{ fontSize: "11px" }}>{QUOTATION_COMPANY.phone}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "34px", color: "#6b7280", letterSpacing: "1px" }}>QUOTATION</div>
          <table style={{ marginLeft: "auto", marginTop: "14px", fontSize: "11px" }}>
            <tbody>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: "16px", textAlign: "left" }}>Quotation Date :</td>
                <td style={{ textAlign: "left" }}>{formatQuotationDate(q.quotationDate)}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: "16px", textAlign: "left" }}>Quotation #</td>
                <td style={{ textAlign: "left" }}>{q.quotationNo}</td>
              </tr>
              <tr><td>&nbsp;</td><td /></tr>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: "16px", textAlign: "left" }}>CASE ID</td>
                <td style={{ textAlign: "left" }}>{q.caseId || "-"}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: "16px", textAlign: "left" }}>ORDER NUMBER</td>
                <td style={{ textAlign: "left" }}>{q.orderNumber || "-"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer block */}
      <div style={{ marginTop: "18px", fontSize: "11px" }}>
        <div style={{ fontWeight: 700 }}>To:</div>
        <div>{q.customerName}</div>
        {q.customerAddress ? <div>{q.customerAddress}</div> : null}
        {q.customerCity ? <div>{q.customerCity}</div> : null}
        {q.customerState ? <div>{q.customerState}</div> : null}
        {q.customerPincode ? <div>{q.customerPincode}</div> : null}
        {q.customerPhone ? <div>{q.customerPhone}</div> : null}
        {/* The email is deliberately NOT printed. It is held so the office can reach the
            customer and so the list can be searched by it, not so it appears on a document
            that goes back to them — they know their own address. It stays on the list
            screen only. */}
      </div>

      {/* Line-item table */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "18px" }}>
        <thead>
          <tr>
            <th style={{ ...cell, fontWeight: 700, textAlign: "center", width: "78%" }}>DESCRIPTION</th>
            <th style={{ ...cell, fontWeight: 700, textAlign: "center" }}>AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {/* One priced row per line item, then a single unit table listing all of them.
              A one-item quotation prints exactly as it always did. */}
          {items.map((item, index) => (
            <tr key={index}>
              <td style={{ ...cell, textAlign: "center" }}>
                {item.serviceDescription || "Service Charge of HP Printer having details as"}
              </td>
              <td style={{ ...cell, textAlign: "right" }}>{formatMoney(item.baseAmount)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...cell, padding: 0 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...cell, fontWeight: 700, width: "60%" }}>Description</th>
                    <th style={{ ...cell, fontWeight: 700 }}>Model No</th>
                    <th style={{ ...cell, fontWeight: 700 }}>Sl.No</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={index}>
                      <td style={cell}>{item.productDescription || "-"}</td>
                      <td style={cell}>{item.modelNo || "-"}</td>
                      <td style={cell}>{item.serialNo || "-"}</td>
                    </tr>
                  ))}
                  {/* Keeps the block from collapsing onto the totals on a short sheet. */}
                  <tr><td style={{ ...cell, height: "42px" }} colSpan={3} /></tr>
                </tbody>
              </table>
            </td>
            <td style={cell} />
          </tr>
          <tr>
            <td style={{ ...cell, fontWeight: 700 }}>Total Amount</td>
            <td style={{ ...cell, textAlign: "right" }}>{formatMoney(subtotal)}</td>
          </tr>
          <tr>
            <td style={cell}>SGST @ {q.sgstPercent} %</td>
            <td style={{ ...cell, textAlign: "right" }}>{formatMoney(sgst)}</td>
          </tr>
          <tr>
            <td style={cell}>CGST @ {q.cgstPercent} %</td>
            <td style={{ ...cell, textAlign: "right" }}>{formatMoney(cgst)}</td>
          </tr>
          <tr>
            <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>Total TAX Amount</td>
            <td style={{ ...cell, textAlign: "right" }}>{formatMoney(totalTax)}</td>
          </tr>
          <tr>
            <td style={{ ...cell, fontWeight: 700, fontSize: "13px" }}>Total Quotation Value</td>
            <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontSize: "13px" }}>{formatMoney(total)}</td>
          </tr>
          <tr>
            <td style={cell} colSpan={2}>{amountInWords(total)}</td>
          </tr>
        </tbody>
      </table>

      {/* PAN / GST + signature */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "11px" }}>
        <div>
          <div>PAN # {QUOTATION_COMPANY.pan}</div>
          <div>GST # {QUOTATION_COMPANY.gst}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700 }}>For {QUOTATION_COMPANY.name}</div>
          {signUrl ? (
            <img src={signUrl} alt="" style={{ height: "84px", margin: "6px 0" }} />
          ) : (
            <div style={{ height: "60px" }} />
          )}
          <div style={{ fontWeight: 700 }}>Authorized Signatory</div>
        </div>
      </div>

      {/* Footer bank details */}
      <div style={{ marginTop: "10px", border, padding: "6px 8px", fontSize: "11px" }}>
        <div style={{ textAlign: "center", fontWeight: 700, marginBottom: "4px" }}>
          THANKS FOR YOUR BUSINESS WITH US
        </div>
        <div>
          <b>Bank:</b> {QUOTATION_COMPANY.bank.name}, <b>A/c :</b> {QUOTATION_COMPANY.bank.account}{" "}
          <b>IFSC Code:</b> {QUOTATION_COMPANY.bank.ifsc}
        </div>
        <div>
          Payments to be in advance and details of the payment to be shared on mail with us {QUOTATION_COMPANY.email}
        </div>
        <div>Please refer the Terms and Conditions as mentioned in page 2</div>
      </div>

      {/* Page 2 — terms & QR */}
      <div style={{ pageBreakBefore: "always", paddingTop: "10mm" }}>
        <div style={{ textAlign: "center", fontWeight: 700, fontSize: "11px", marginBottom: "8px" }}>
          *PLEASE SHARE YOUR GST NO AND ENTITY NAME IN CASE YOU NEED TO CLAIM THE INPUT TAX BENEFITS *
        </div>
        <div style={{ fontWeight: 700, fontSize: "11px" }}>Terms &amp; Conditions:</div>
        <ol style={{ fontSize: "11px", paddingLeft: "18px", margin: "6px 0" }}>
          {QUOTATION_TERMS.map((t, i) => (
            <li key={i} style={{ marginBottom: "3px" }}>{t}</li>
          ))}
        </ol>
        <div style={{ fontSize: "11px" }}>
          Company GSTIN No: {QUOTATION_COMPANY.gst} &nbsp; Company PAN No : {QUOTATION_COMPANY.pan}
        </div>
        {qrUrl ? (
          <div style={{ marginTop: "14px" }}>
            <div style={{ fontWeight: 700, fontSize: "11px", marginBottom: "6px" }}>Scan QR Code</div>
            <img src={qrUrl} alt="" style={{ width: "220px" }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
