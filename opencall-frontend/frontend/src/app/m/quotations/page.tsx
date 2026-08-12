"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AppBar } from "../AppBar";
import { canSeeMobileSection, isSuperAdminSession, useMobileSession } from "../session";
import {
  autofillQuotation,
  createQuotation,
  listQuotations,
  type CreateQuotationInput,
  type Quotation,
  type QuotationLineItem,
} from "../../../lib/quotationApiClient";
import { formatMoney } from "../../../lib/quotationFormat";
import { quotationTotals } from "../../../lib/quotationTotals";
import { QuotationPrint } from "../../../features/dashboard/components/QuotationPrint";

const EMPTY_LINE_ITEM: QuotationLineItem = {
  serviceDescription: "",
  productDescription: "",
  modelNo: "",
  serialNo: "",
  baseAmount: 0,
};

const EMPTY_FORM: CreateQuotationInput = {
  quotationDate: "",
  caseId: "",
  orderNumber: "",
  customerName: "",
  customerAddress: "",
  customerCity: "",
  customerState: "",
  customerPincode: "",
  customerPhone: "",
  customerEmail: "",
  // A quotation always has at least one priced row; the form starts on it.
  lineItems: [{ ...EMPTY_LINE_ITEM }],
  sgstPercent: 9,
  cgstPercent: 9,
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Quotations — full parity with the desktop section: browse the saved history, create a
 * new quotation (with Case-ID auto-fill and the same validation), and open the identical
 * RENDERWAYS print sheet. The sheet component itself is reused, so the PDF is the same
 * document the web produces.
 */
export default function MobileQuotationsPage() {
  const { session } = useMobileSession();
  const allowed =
    isSuperAdminSession(session) || canSeeMobileSection(session, "quotations");

  const [mode, setMode] = useState<"list" | "create">("list");
  const [items, setItems] = useState<Quotation[]>([]);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState<Quotation | null>(null);

  const [form, setForm] = useState<CreateQuotationInput>({
    ...EMPTY_FORM,
    quotationDate: todayIso(),
  });
  const [autofilling, setAutofilling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(async () => {
    if (!session || !allowed) return;
    setLoading(true);
    try {
      const res = await listQuotations(session.token, {
        ...(debounced ? { search: debounced } : {}),
        perPage: 50,
      });
      setItems(res.items);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load quotations");
    } finally {
      setLoading(false);
    }
  }, [session, allowed, debounced]);

  useEffect(() => {
    if (mode === "list") void load();
  }, [mode, load]);

  const set = (patch: Partial<CreateQuotationInput>) =>
    setForm((f) => ({ ...f, ...patch }));

  const setLineItem = (index: number, patch: Partial<QuotationLineItem>) =>
    setForm((f) => ({
      ...f,
      lineItems: f.lineItems.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));

  const addLineItem = () =>
    setForm((f) => ({ ...f, lineItems: [...f.lineItems, { ...EMPTY_LINE_ITEM }] }));

  /** Removing the last row would leave a quotation with nothing on it, so one always stays. */
  const removeLineItem = (index: number) =>
    setForm((f) =>
      f.lineItems.length <= 1
        ? f
        : { ...f, lineItems: f.lineItems.filter((_, i) => i !== index) },
    );

  async function handleAutofill() {
    if (!session) return;
    if (!form.caseId && !form.orderNumber) {
      setMessage("Enter a Case ID or Order Number to auto-fill.");
      return;
    }
    setAutofilling(true);
    setMessage(null);
    try {
      const data = await autofillQuotation(session.token, {
        caseId: form.caseId,
        orderNumber: form.orderNumber,
      });
      if (!data) {
        setMessage("No matching case found — you can fill the details manually.");
        return;
      }
      set({
        caseId: data.caseId || form.caseId,
        orderNumber: data.orderNumber || form.orderNumber,
        customerName: data.customerName,
        customerAddress: data.customerAddress,
        customerCity: data.customerCity,
        customerState: data.customerState,
        customerPincode: data.customerPincode,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail,
      });
      // Auto-fill describes the ONE unit the case is about: first row only.
      setLineItem(0, {
        productDescription: data.productDescription,
        modelNo: data.modelNo,
        serialNo: data.serialNo,
      });
      setMessage("Auto-filled from the case. Review and edit before saving.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Auto-fill failed");
    } finally {
      setAutofilling(false);
    }
  }

  async function handleSave() {
    if (!session) return;
    if (!form.customerName.trim()) {
      setMessage("Customer name is required.");
      return;
    }
    if (!(subtotal > 0)) {
      setMessage("Enter an amount greater than 0 on at least one line item.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const created = await createQuotation(session.token, form);
      setForm({ ...EMPTY_FORM, quotationDate: todayIso() });
      setMode("list");
      setPrinting(created); // open the print view straight away, same as the web
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // Shared with the printed sheet, so the form can never show a different number from the
  // document it produces.
  const { subtotal, sgst, cgst, total } = quotationTotals(
    form.lineItems,
    form.sgstPercent,
    form.cgstPercent,
  );

  if (!allowed) {
    return (
      <>
        <AppBar title="Quotations" back />
        <main className="mMain">
          <div className="mCard">
            <div className="mMuted">You do not have access to Quotations.</div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <AppBar
        title="Quotations"
        subtitle={mode === "list" ? `${items.length} saved` : "New quotation"}
        back
        action={
          mode === "list" ? (
            <button
              type="button"
              className="mIconBtn"
              aria-label="New quotation"
              onClick={() => {
                setMessage(null);
                setMode("create");
              }}
            >
              ＋
            </button>
          ) : (
            <button
              type="button"
              className="mIconBtn"
              aria-label="Back to list"
              onClick={() => {
                setMessage(null);
                setMode("list");
              }}
            >
              ✕
            </button>
          )
        }
      />
      <main className="mMain">
        {message && (
          <div
            className="mCard"
            style={{ marginBottom: 12, fontSize: 12.5, color: "var(--m-primary)" }}
          >
            {message}
          </div>
        )}

        {mode === "list" ? (
          <>
            <input
              className="mSearch"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search quotation no, customer, Case ID, WO…"
            />

            {loading && items.length === 0 ? (
              <div className="mCard" style={{ textAlign: "center", padding: 26, marginTop: 12 }}>
                <div className="mSpinner" />
                <div className="mMuted">Loading quotations…</div>
              </div>
            ) : items.length === 0 ? (
              <div className="mCard" style={{ marginTop: 12 }}>
                <div className="mMuted">No quotations yet.</div>
              </div>
            ) : (
              <div className="mList" style={{ marginTop: 12 }}>
                {items.map((q) => {
                  const t = q.baseAmount * (1 + (q.sgstPercent + q.cgstPercent) / 100);
                  return (
                    <button
                      key={q.id}
                      type="button"
                      className="mRow"
                      onClick={() => setPrinting(q)}
                    >
                      <div className="mRow__top">
                        <span className="mRow__title" style={{ fontWeight: 750 }}>
                          {q.quotationNo}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 800, flexShrink: 0 }}>
                          {formatMoney(t)}
                        </span>
                      </div>
                      <div className="mRow__meta">{q.customerName || "-"}</div>
                      <div className="mRow__meta" style={{ marginTop: 2 }}>
                        {q.quotationDate} · Case {q.caseId || "-"} · WO {q.orderNumber || "-"}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mSectionTitle">Auto-fill from a case</div>
            <div className="mCard">
              <Text label="Case ID" value={form.caseId} onChange={(v) => set({ caseId: v })} />
              <Text
                label="Order Number (WO)"
                value={form.orderNumber}
                onChange={(v) => set({ orderNumber: v })}
              />
              <button
                type="button"
                className="mBtn"
                style={{ marginTop: 10 }}
                disabled={autofilling}
                onClick={() => void handleAutofill()}
              >
                {autofilling ? "Fetching…" : "⤓ Auto-fill"}
              </button>
            </div>

            <div className="mSectionTitle">Customer</div>
            <div className="mCard">
              <Text
                label="Customer Name *"
                value={form.customerName}
                onChange={(v) => set({ customerName: v })}
              />
              <Text
                label="Address"
                value={form.customerAddress}
                onChange={(v) => set({ customerAddress: v })}
              />
              <Text label="City" value={form.customerCity} onChange={(v) => set({ customerCity: v })} />
              <Text label="State" value={form.customerState} onChange={(v) => set({ customerState: v })} />
              <Text
                label="Pincode"
                value={form.customerPincode}
                onChange={(v) => set({ customerPincode: v })}
              />
              <Text
                label="Phone"
                type="tel"
                value={form.customerPhone}
                onChange={(v) => set({ customerPhone: v })}
              />
              <Text
                label="Email"
                type="email"
                value={form.customerEmail}
                onChange={(v) => set({ customerEmail: v })}
              />
              <Text
                label="Quotation Date"
                type="date"
                value={form.quotationDate}
                onChange={(v) => set({ quotationDate: v })}
              />
            </div>

            <div className="mSectionTitle">
              Line items ({form.lineItems.length})
            </div>
            {form.lineItems.map((item, index) => (
              <div className="mCard" key={index} style={{ marginBottom: 10 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--m-muted, #64748b)",
                  }}
                >
                  <span>Item {index + 1}</span>
                  {form.lineItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLineItem(index)}
                      aria-label={`Remove item ${index + 1}`}
                      style={{
                        marginLeft: "auto",
                        background: "#ffffff",
                        color: "#b91c1c",
                        border: "1px solid #fecaca",
                        borderRadius: 8,
                        padding: "2px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        minHeight: 30,
                      }}
                    >
                      × Remove
                    </button>
                  )}
                </div>
                <Text
                  label="Service Description"
                  value={item.serviceDescription}
                  onChange={(v) => setLineItem(index, { serviceDescription: v })}
                />
                <Text
                  label="Product Description"
                  value={item.productDescription}
                  onChange={(v) => setLineItem(index, { productDescription: v })}
                />
                <Text
                  label="Model No"
                  value={item.modelNo}
                  onChange={(v) => setLineItem(index, { modelNo: v })}
                />
                <Text
                  label="Serial No"
                  value={item.serialNo}
                  onChange={(v) => setLineItem(index, { serialNo: v })}
                />
                <Num
                  label="Amount *"
                  value={item.baseAmount}
                  onChange={(v) => setLineItem(index, { baseAmount: v })}
                />
              </div>
            ))}

            <button
              type="button"
              onClick={addLineItem}
              style={{
                width: "100%",
                background: "#ffffff",
                color: "#2563eb",
                border: "1px dashed #93c5fd",
                borderRadius: 10,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 700,
                minHeight: 42,
              }}
            >
              + Add line item
            </button>

            <div className="mSectionTitle">Amount</div>
            <div className="mCard">
              <Num label="SGST %" value={form.sgstPercent} onChange={(v) => set({ sgstPercent: v })} />
              <Num label="CGST %" value={form.cgstPercent} onChange={(v) => set({ cgstPercent: v })} />

              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: "1px solid var(--m-border)",
                  display: "grid",
                  gap: 5,
                  fontSize: 13,
                }}
              >
                <Line label="Subtotal" value={formatMoney(subtotal)} />
                <Line label="SGST" value={formatMoney(sgst)} />
                <Line label="CGST" value={formatMoney(cgst)} />
                <Line label="Total" value={formatMoney(total)} strong />
              </div>
            </div>

            <button
              type="button"
              className="mBtn"
              style={{ marginTop: 14 }}
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? "Saving…" : "Save & Print"}
            </button>
            <button
              type="button"
              className="mBtn mBtn--ghost"
              style={{ marginTop: 8 }}
              onClick={() => {
                setMessage(null);
                setMode("list");
              }}
            >
              Cancel
            </button>
          </>
        )}
      </main>

      {printing && <PrintOverlay q={printing} onClose={() => setPrinting(null)} />}
    </>
  );
}

function Text({
  label, value, onChange, type = "text",
}: Readonly<{ label: string; value: string; onChange: (v: string) => void; type?: string }>) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label className="mLabel">{label}</label>
      <input
        className="mInput"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Num({
  label, value, onChange,
}: Readonly<{ label: string; value: number; onChange: (v: number) => void }>) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label className="mLabel">{label}</label>
      <input
        className="mInput"
        type="number"
        inputMode="decimal"
        value={value === 0 ? "" : String(value)}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  );
}

function Line({
  label, value, strong,
}: Readonly<{ label: string; value: string; strong?: boolean }>) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span className="mMuted" style={{ fontWeight: 600 }}>{label}</span>
      <span style={{ fontWeight: strong ? 800 : 600, fontSize: strong ? 15 : 13 }}>{value}</span>
    </div>
  );
}

/**
 * Full-screen print sheet. The A4 sheet is 210mm wide, so it is scaled down to fit the
 * viewport; printing removes the scale via the print stylesheet in mobile.css.
 */
function PrintOverlay({ q, onClose }: Readonly<{ q: Quotation; onClose: () => void }>) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => {
      // 210mm ≈ 794px at 96dpi; leave a small gutter.
      setScale(Math.min(1, (window.innerWidth - 16) / 794));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  function doPrint() {
    document.body.classList.add("mPrinting");
    const cleanup = () => {
      document.body.classList.remove("mPrinting");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    // Some WebViews never fire afterprint — clear the class defensively.
    setTimeout(cleanup, 2000);
  }

  return createPortal(
    <div className="mPrintOverlay">
      <div className="mPrintOverlay__chrome">
        <button type="button" className="mBtn" onClick={doPrint}>
          🖨 Print / Save PDF
        </button>
        <button type="button" className="mBtn mBtn--ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="mPrintOverlay__scroll">
        <div
          className="mPrintOverlay__scale"
          style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: 794 }}
        >
          <QuotationPrint q={q} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
