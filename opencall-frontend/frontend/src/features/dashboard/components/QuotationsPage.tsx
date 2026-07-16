import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  autofillQuotation,
  createQuotation,
  listQuotations,
  type CreateQuotationInput,
  type Quotation,
} from "../../../lib/quotationApiClient";
import { formatMoney } from "../../../lib/quotationFormat";
import { QuotationPrint } from "./QuotationPrint";

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
  serviceDescription: "",
  productDescription: "",
  modelNo: "",
  serialNo: "",
  baseAmount: 0,
  sgstPercent: 9,
  cgstPercent: 9,
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function QuotationsPage({ token }: Readonly<{ token: string }>) {
  const [mode, setMode] = useState<"list" | "create">("list");

  // List state
  const [items, setItems] = useState<Quotation[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState<Quotation | null>(null);

  // Form state
  const [form, setForm] = useState<CreateQuotationInput>({ ...EMPTY_FORM, quotationDate: todayIso() });
  const [autofilling, setAutofilling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listQuotations(token, { search, perPage: 50 });
      setItems(res.items);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load quotations");
    } finally {
      setLoading(false);
    }
  }, [token, search]);

  useEffect(() => {
    if (mode === "list") void load();
  }, [mode, load]);

  const set = (patch: Partial<CreateQuotationInput>) => setForm((f) => ({ ...f, ...patch }));

  async function handleAutofill() {
    if (!form.caseId && !form.orderNumber) {
      setMessage("Enter a Case ID or Order Number to auto-fill.");
      return;
    }
    setAutofilling(true);
    setMessage(null);
    try {
      const data = await autofillQuotation(token, {
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
    if (!form.customerName.trim()) {
      setMessage("Customer name is required.");
      return;
    }
    if (!(form.baseAmount > 0)) {
      setMessage("Enter a base amount greater than 0.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const created = await createQuotation(token, form);
      setForm({ ...EMPTY_FORM, quotationDate: todayIso() });
      setMode("list");
      setPrinting(created); // open the print view straight away
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const sgst = (form.baseAmount * form.sgstPercent) / 100;
  const cgst = (form.baseAmount * form.cgstPercent) / 100;
  const total = form.baseAmount + sgst + cgst;

  const field: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    fontSize: "13px",
    borderRadius: "8px",
    border: "1px solid var(--border-color, #d1d5db)",
    background: "var(--input-bg, #f9fafb)",
  };
  const label: React.CSSProperties = { fontSize: "12px", fontWeight: 600, marginBottom: "4px", display: "block" };

  return (
    <section style={{ padding: "8px 4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>Quotations</h2>
        {mode === "list" ? (
          <button type="button" onClick={() => { setMode("create"); setMessage(null); }} style={primaryBtn}>
            + New Quotation
          </button>
        ) : (
          <button type="button" onClick={() => { setMode("list"); setMessage(null); }} style={secondaryBtn}>
            ← Back to list
          </button>
        )}
      </div>

      {message && (
        <div style={{ fontSize: "12px", color: "#4f46e5", marginBottom: "12px" }}>{message}</div>
      )}

      {mode === "list" ? (
        <>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quotation no, customer, Case ID, WO…"
            style={{ ...field, maxWidth: "360px", marginBottom: "14px" }}
          />
          <div style={{ overflowX: "auto", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: "8px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "var(--th-bg, #f3f4f6)" }}>
                  <th style={th}>Quotation #</th>
                  <th style={th}>Date</th>
                  <th style={th}>Customer</th>
                  <th style={th}>Case ID</th>
                  <th style={th}>WO</th>
                  <th style={th}>Total</th>
                  <th style={{ ...th, textAlign: "center" }}>PDF</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ ...td, textAlign: "center", padding: "26px", color: "#6b7280" }}>Loading…</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={7} style={{ ...td, textAlign: "center", padding: "26px", color: "#6b7280" }}>No quotations yet.</td></tr>
                ) : (
                  items.map((q) => {
                    const t = q.baseAmount * (1 + (q.sgstPercent + q.cgstPercent) / 100);
                    return (
                      <tr key={q.id}>
                        <td style={{ ...td, fontWeight: 600 }}>{q.quotationNo}</td>
                        <td style={td}>{q.quotationDate}</td>
                        <td style={td}>{q.customerName}</td>
                        <td style={td}>{q.caseId || "-"}</td>
                        <td style={td}>{q.orderNumber || "-"}</td>
                        <td style={td}>₹{formatMoney(t)}</td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <button type="button" onClick={() => setPrinting(q)} style={linkBtn}>View / Print</button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div style={{ maxWidth: "820px" }}>
          {/* Auto-fill row */}
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "16px" }}>
            <div style={{ flex: "1 1 200px" }}>
              <label style={label}>Case ID</label>
              <input style={field} value={form.caseId} onChange={(e) => set({ caseId: e.target.value })} />
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <label style={label}>Order Number (WO)</label>
              <input style={field} value={form.orderNumber} onChange={(e) => set({ orderNumber: e.target.value })} />
            </div>
            <button type="button" onClick={() => void handleAutofill()} disabled={autofilling} style={secondaryBtn}>
              {autofilling ? "Filling…" : "Auto-fill from case"}
            </button>
          </div>

          <div style={grid2}>
            <Text label="Quotation Date" value={form.quotationDate} onChange={(v) => set({ quotationDate: v })} type="date" />
            <Text label="Customer Name *" value={form.customerName} onChange={(v) => set({ customerName: v })} />
            <Text label="Customer Phone" value={form.customerPhone} onChange={(v) => set({ customerPhone: v })} />
            <Text label="Customer Email" value={form.customerEmail} onChange={(v) => set({ customerEmail: v })} />
            <Text label="Address" value={form.customerAddress} onChange={(v) => set({ customerAddress: v })} />
            <Text label="City" value={form.customerCity} onChange={(v) => set({ customerCity: v })} />
            <Text label="State" value={form.customerState} onChange={(v) => set({ customerState: v })} />
            <Text label="Pincode" value={form.customerPincode} onChange={(v) => set({ customerPincode: v })} />
          </div>

          <div style={{ marginTop: "16px", fontWeight: 700, fontSize: "13px" }}>Line item</div>
          <div style={grid2}>
            <Text label="Service Description" value={form.serviceDescription} onChange={(v) => set({ serviceDescription: v })} />
            <Text label="Product Description" value={form.productDescription} onChange={(v) => set({ productDescription: v })} />
            <Text label="Model No" value={form.modelNo} onChange={(v) => set({ modelNo: v })} />
            <Text label="Serial No" value={form.serialNo} onChange={(v) => set({ serialNo: v })} />
          </div>

          <div style={{ marginTop: "16px", fontWeight: 700, fontSize: "13px" }}>Amount</div>
          <div style={grid2}>
            <div>
              <label style={label}>Base Amount (₹) *</label>
              <input
                style={field}
                type="number"
                min={0}
                value={form.baseAmount || ""}
                onChange={(e) => set({ baseAmount: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label style={label}>SGST %</label>
              <input style={field} type="number" min={0} value={form.sgstPercent} onChange={(e) => set({ sgstPercent: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <label style={label}>CGST %</label>
              <input style={field} type="number" min={0} value={form.cgstPercent} onChange={(e) => set({ cgstPercent: Number(e.target.value) || 0 })} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <div style={{ fontSize: "13px" }}>
                <div>SGST: ₹{formatMoney(sgst)} &nbsp; CGST: ₹{formatMoney(cgst)}</div>
                <div style={{ fontWeight: 700 }}>Total: ₹{formatMoney(total)}</div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: "20px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={() => void handleSave()} disabled={saving} style={primaryBtn}>
              {saving ? "Saving…" : "Save & generate quotation"}
            </button>
            <button type="button" onClick={() => { setMode("list"); setMessage(null); }} style={secondaryBtn}>
              Cancel
            </button>
            {message && (
              <span style={{ fontSize: "12px", color: "#dc2626", fontWeight: 600 }}>{message}</span>
            )}
          </div>
        </div>
      )}

      {printing && <PrintOverlay q={printing} onClose={() => setPrinting(null)} />}
    </section>
  );
}

function Text({
  label: lbl, value, onChange, type = "text",
}: Readonly<{ label: string; value: string; onChange: (v: string) => void; type?: string }>) {
  return (
    <div>
      <label style={{ fontSize: "12px", fontWeight: 600, marginBottom: "4px", display: "block" }}>{lbl}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 10px",
          fontSize: "13px",
          borderRadius: "8px",
          border: "1px solid var(--border-color, #d1d5db)",
          background: "var(--input-bg, #f9fafb)",
        }}
      />
    </div>
  );
}

/** Full-screen overlay hosting the printable sheet + a Print button. */
function PrintOverlay({ q, onClose }: Readonly<{ q: Quotation; onClose: () => void }>) {
  const ref = useRef<HTMLDivElement | null>(null);

  function doPrint() {
    // Print only the sheet: open its markup in a hidden iframe and print that.
    const sheet = ref.current?.querySelector(".quotationSheet");
    if (!sheet) { window.print(); return; }
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) { window.print(); return; }
    w.document.write(
      `<!doctype html><html><head><title>${q.quotationNo}</title>` +
      `<style>@page{size:A4;margin:0} body{margin:0}</style></head><body>` +
      `${(sheet as HTMLElement).outerHTML}</body></html>`,
    );
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 300);
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
        display: "flex", flexDirection: "column", alignItems: "center",
        zIndex: 1000, overflow: "auto", padding: "16px",
      }}
    >
      <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }} onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={doPrint} style={{ ...primaryBtn, background: "#4f46e5" }}>🖨 Print / Save PDF</button>
        <button type="button" onClick={onClose} style={{ ...secondaryBtn, background: "#fff" }}>Close</button>
      </div>
      <div ref={ref} onClick={(e) => e.stopPropagation()} style={{ boxShadow: "0 20px 40px rgba(0,0,0,0.3)" }}>
        <QuotationPrint q={q} />
      </div>
    </div>,
    document.body,
  );
}

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "12px",
  marginTop: "8px",
};
const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 700, textAlign: "left", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 12px", borderBottom: "1px solid #f0f1f4", whiteSpace: "nowrap" };
const primaryBtn: React.CSSProperties = { padding: "9px 16px", fontSize: "13px", fontWeight: 600, borderRadius: "8px", border: "none", background: "#4f46e5", color: "#fff", cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { padding: "9px 16px", fontSize: "13px", fontWeight: 600, borderRadius: "8px", border: "1px solid #d1d5db", background: "#f9fafb", color: "#374151", cursor: "pointer" };
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: "#2563eb", fontWeight: 600, cursor: "pointer", fontSize: "13px", textDecoration: "underline" };
