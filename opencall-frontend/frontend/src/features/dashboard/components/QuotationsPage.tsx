import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  autofillQuotation,
  createQuotation,
  updateQuotation,
  sendQuotation,
  setQuotationPayment,
  listQuotations,
  type CreateQuotationInput,
  type Quotation,
  type QuotationLineItem,
} from "../../../lib/quotationApiClient";
import { formatMoney } from "../../../lib/quotationFormat";
import { quotationTotals } from "../../../lib/quotationTotals";
import { QuotationPrint } from "./QuotationPrint";
import { quotationStage, daysSince, OVERDUE_DAYS } from "../../../lib/quotationStage";
import { getCustomerEmails, type MailboxHealth } from "../../../lib/customerEmailApiClient";

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
  // A quotation always has at least one row; the form starts on it.
  lineItems: [{ ...EMPTY_LINE_ITEM }],
  sgstPercent: 9,
  cgstPercent: 9,
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function QuotationsPage({ token }: Readonly<{ token: string }>) {
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  // The quotation being corrected. Its id is what the save goes to, and its number is
  // shown on the form so it is obvious the sheet is not being reissued under a new one.
  const [editing, setEditing] = useState<Quotation | null>(null);

  // --- Sending, and what came back ------------------------------------------------------
  //
  // The mailbox list comes from Customer Emails, because that is where the region mailboxes
  // are configured and a quotation must go out from the same address the customer already
  // corresponds with — a reply landing in an inbox nobody reads is worse than not sending.
  const [mailboxes, setMailboxes] = useState<MailboxHealth[]>([]);
  const [sending, setSending] = useState<Quotation | null>(null);
  const [sendTo, setSendTo] = useState("");
  const [sendRegion, setSendRegion] = useState("");
  const [sendNote, setSendNote] = useState("");
  const [sendBusy, setSendBusy] = useState(false);

  useEffect(() => {
    // One row is enough — the mailboxes ride along with any page of the inbox, and there
    // is no lighter endpoint for them. A failure just leaves Send asking for a mailbox.
    void getCustomerEmails(token, { limit: 1 })
      .then((res) => setMailboxes(res.mailboxes))
      .catch(() => {
        /* Send will say it needs a mailbox */
      });
  }, [token]);

  function startSend(q: Quotation) {
    setSending(q);
    setSendTo(q.customerEmail || "");
    setSendNote("");
    setSendRegion(mailboxes[0]?.regionCode ?? "");
    setMessage(null);
  }

  async function handleSend() {
    if (!sending) return;
    if (!sendRegion) {
      setMessage("Choose which mailbox to send from.");
      return;
    }
    if (!sendTo.trim()) {
      setMessage("Enter the customer's email address.");
      return;
    }
    setSendBusy(true);
    setMessage(null);
    try {
      await sendQuotation(token, sending.id, {
        regionCode: sendRegion,
        to: sendTo.trim(),
        note: sendNote.trim(),
      });
      setSending(null);
      setMessage(`Quotation sent to ${sendTo.trim()}.`);
      void load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Send failed");
    } finally {
      setSendBusy(false);
    }
  }

  /**
   * What the customer did about it — set by the person looking at their reply, never read
   * out of it. A screenshot of a transfer, a part payment and a refusal all look alike to
   * a parser, and guessing wrong marks an unpaid quotation paid.
   */
  async function handlePayment(q: Quotation, status: "PENDING" | "PAID" | "DECLINED") {
    setMessage(null);
    try {
      await setQuotationPayment(token, q.id, { status });
      void load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update payment");
    }
  }

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
      });
      // Auto-fill describes the ONE unit the case is about, so it lands on the first row
      // and leaves any rows already typed below it alone.
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

  /**
   * Load a quotation back into the form.
   *
   * `lineItems` is what the form edits, and a quotation raised before line items existed
   * has its single priced row only in the flat fields — so fall back to those rather than
   * open an empty sheet on an old quotation.
   */
  function startEdit(q: Quotation) {
    setEditing(q);
    setMessage(null);
    setForm({
      quotationDate: q.quotationDate,
      caseId: q.caseId,
      orderNumber: q.orderNumber,
      customerName: q.customerName,
      customerAddress: q.customerAddress,
      customerCity: q.customerCity,
      customerState: q.customerState,
      customerPincode: q.customerPincode,
      customerPhone: q.customerPhone,
      customerEmail: q.customerEmail,
      lineItems:
        q.lineItems && q.lineItems.length > 0
          ? q.lineItems.map((item) => ({ ...item }))
          : [
              {
                serviceDescription: q.serviceDescription,
                productDescription: q.productDescription,
                modelNo: q.modelNo,
                serialNo: q.serialNo,
                baseAmount: q.baseAmount,
              },
            ],
      sgstPercent: q.sgstPercent,
      cgstPercent: q.cgstPercent,
    });
    setMode("edit");
  }

  async function handleSave() {
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
      const saved = editing
        ? await updateQuotation(token, editing.id, form)
        : await createQuotation(token, form);
      setForm({ ...EMPTY_FORM, quotationDate: todayIso() });
      setEditing(null);
      setMode("list");
      // Reload so the list shows the corrected figures rather than the ones it fetched
      // before the edit; creating does not need this because the list refetches anyway.
      if (editing) void load();
      setPrinting(saved); // open the print view straight away
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
    // `.panel` is a CSS grid whose items default to `min-width: auto`, so without an
    // explicit `minWidth: 0` this section refuses to shrink below the table's intrinsic
    // width — the panel widens instead and the WHOLE PAGE scrolls sideways (taking the
    // page header with it) rather than the table's own scroll container. Same fix as
    // RenewalPipelinePage, which has the other wide table in the app.
    <section style={{ padding: "8px 4px", minWidth: 0, maxWidth: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>Quotations</h2>
        {mode === "list" ? (
          <button type="button" onClick={() => { setEditing(null); setForm({ ...EMPTY_FORM, quotationDate: todayIso() }); setMode("create"); setMessage(null); }} style={primaryBtn}>
            + New Quotation
          </button>
        ) : (
          <button type="button" onClick={() => { setEditing(null); setForm({ ...EMPTY_FORM, quotationDate: todayIso() }); setMode("list"); setMessage(null); }} style={secondaryBtn}>
            ← Back to list
          </button>
        )}
      </div>

      {message && (
        <div style={{ fontSize: "12px", color: "#4f46e5", marginBottom: "12px" }}>{message}</div>
      )}

      {mode === "list" ? (
        <>
          {/* What the section is actually for: not how many quotations exist, but how many
              are out with a customer, how many came back, and how many have gone quiet. */}
          {(() => {
            // Counted by the same stages the rows show, so a tile and the rows under it
            // can never disagree about what a quotation is doing.
            const stages = items.map((q) => quotationStage(q).stage);
            const count = (stage: string) => stages.filter((s) => s === stage).length;
            const paidValue = items
              .filter((q) => q.paymentStatus === "PAID")
              .reduce(
                (sum, q) => sum + q.baseAmount * (1 + (q.sgstPercent + q.cgstPercent) / 100),
                0,
              );
            const replied = count("REPLIED");
            const waiting = count("WAITING");
            const tiles = [
              { label: "Created", value: String(count("CREATED")), hint: "not sent yet", fg: "#475569" },
              { label: "Sent", value: String(count("SENT")), hint: `waiting under ${OVERDUE_DAYS} days`, fg: "#1d4ed8" },
              { label: "Waiting", value: String(waiting), hint: `quiet ${OVERDUE_DAYS}+ days`, fg: waiting > 0 ? "#9a3412" : "#94a3b8" },
              { label: "Replied", value: String(replied), hint: "read it and settle", fg: replied > 0 ? "#b91c1c" : "#94a3b8" },
              { label: "Paid", value: String(count("PAID")), hint: `₹${formatMoney(paidValue)} collected`, fg: "#166534" },
            ];
            return (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: "10px",
                  marginBottom: "14px",
                }}
              >
                {tiles.map((tile) => (
                  <div
                    key={tile.label}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "10px",
                      border: "1px solid var(--border-color, #e5e7eb)",
                      background: "var(--card-bg, #ffffff)",
                      minWidth: 0,
                    }}
                  >
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.02em" }}>
                      {tile.label}
                    </div>
                    <div style={{ fontSize: "22px", fontWeight: 800, color: tile.fg, lineHeight: 1.2 }}>
                      {tile.value}
                    </div>
                    <div style={{ fontSize: "11px", color: "#94a3b8" }}>{tile.hint}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quotation no, customer, Case ID, WO…"
            style={{ ...field, maxWidth: "360px", marginBottom: "14px" }}
          />
          <div
            style={{
              overflowX: "auto",
              minWidth: 0,
              maxWidth: "100%",
              border: "1px solid var(--border-color, #e5e7eb)",
              borderRadius: "8px",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "var(--th-bg, #f3f4f6)" }}>
                  <th style={th}>Quotation #</th>
                  <th style={th}>Date</th>
                  <th style={th}>Customer</th>
                  <th style={th}>Email</th>
                  <th style={th}>Case ID</th>
                  <th style={th}>WO</th>
                  <th style={th}>Total</th>
                  <th style={th}>Status</th>
                  <th style={{ ...th, ...stickyActions, background: "var(--th-bg, #f3f4f6)" }}>PDF</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} style={{ ...td, textAlign: "center", padding: "26px", color: "#6b7280" }}>Loading…</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={9} style={{ ...td, textAlign: "center", padding: "26px", color: "#6b7280" }}>No quotations yet.</td></tr>
                ) : (
                  items.map((q) => {
                    const t = q.baseAmount * (1 + (q.sgstPercent + q.cgstPercent) / 100);
                    return (
                      <tr key={q.id}>
                        <td style={{ ...td, fontWeight: 600 }}>{q.quotationNo}</td>
                        <td style={td}>{q.quotationDate}</td>
                        <td style={td}>{q.customerName}</td>
                        <td style={tdEmail} title={q.customerEmail || undefined}>
                          {q.customerEmail || "-"}
                        </td>
                        <td style={td}>{q.caseId || "-"}</td>
                        <td style={td}>{q.orderNumber || "-"}</td>
                        <td style={td}>₹{formatMoney(t)}</td>
                        <td style={td}>
                          {(() => {
                            const view = quotationStage(q);
                            const days = daysSince(q.sentAt);
                            return (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                {/* The stage IS the select, on every quotation. "Sent",
                                    "Waiting", "Replied" and "Created" are all still awaiting
                                    payment, so they are one option wearing the name of the
                                    moment — and one never sent from here still needs
                                    settling, whether the customer paid in cash or wrote to
                                    say so. Verifying is the only thing left to do for those,
                                    since they cannot be re-sent. */}
                                <select
                                    value={q.paymentStatus ?? "PENDING"}
                                    onChange={(e) =>
                                      void handlePayment(
                                        q,
                                        e.target.value as "PENDING" | "PAID" | "DECLINED",
                                      )
                                    }
                                    title={
                                      // `days` is null for a quotation never sent from here,
                                      // and "Sent null days ago" would be worse than saying
                                      // nothing about the send at all.
                                      (days === null
                                        ? "Not sent from here — the customer was given it another way"
                                        : `Sent ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}` +
                                          (q.sendCount && q.sendCount > 1 ? ` · ${q.sendCount} times` : "") +
                                          (q.sentTo ? ` · to ${q.sentTo}` : "")) +
                                      (q.replySeenAt ? ` · replied ${q.replySeenAt.slice(0, 10)}` : "") +
                                      (q.paymentSignalReasons ? ` · ${q.paymentSignalReasons}` : "") +
                                      (q.paidAt ? ` · paid ${q.paidAt.slice(0, 10)}` : "")
                                    }
                                    style={{
                                      fontSize: "11px",
                                      fontWeight: 700,
                                      padding: "2px 6px",
                                      borderRadius: "999px",
                                      border: "1px solid transparent",
                                      background: view.bg,
                                      color: view.fg,
                                      cursor: "pointer",
                                    }}
                                  >
                                    <option value="PENDING">{view.label}</option>
                                    <option value="PAID">Paid</option>
                                    <option value="DECLINED">Declined</option>
                                </select>
                                {days !== null ? (
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      fontWeight: view.needsAttention ? 700 : 400,
                                      color: view.needsAttention ? "#b91c1c" : "#94a3b8",
                                    }}
                                  >
                                    {days === 0 ? "today" : `${days}d`}
                                  </span>
                                ) : null}
                                {/* Set by the watcher, not by anyone here. Said plainly
                                    because a status nobody remembers setting is one nobody
                                    trusts, and the reasons are what make the select above an
                                    informed correction rather than a guess. */}
                                {q.paymentSource === "AUTO" ? (
                                  <span
                                    title={`Marked automatically from the customer's reply — ${q.paymentSignalReasons || "payment confirmed"}. Change it above if that is wrong.`}
                                    style={{
                                      fontSize: "10px",
                                      fontWeight: 700,
                                      padding: "1px 6px",
                                      borderRadius: "999px",
                                      background: "#ede9fe",
                                      color: "#5b21b6",
                                    }}
                                  >
                                    auto
                                  </span>
                                ) : null}
                              </span>
                            );
                          })()}
                        </td>
                        <td style={{ ...td, ...stickyActions }}>
                          <button type="button" onClick={() => setPrinting(q)} style={linkBtn}>View / Print</button>
                          <span style={{ color: "#d1d5db", margin: "0 6px" }}>|</span>
                          <button type="button" onClick={() => startEdit(q)} style={linkBtn}>Edit</button>
                          <span style={{ color: "#d1d5db", margin: "0 6px" }}>|</span>
                          <button type="button" onClick={() => startSend(q)} style={linkBtn}>
                            {q.sentAt ? "Re-send" : "Send"}
                          </button>
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
          {/* Which sheet is being corrected. Shown because the running number does NOT
              change on an edit — the customer's copy still carries this one, and someone
              editing needs to see that they are altering an issued document. */}
          {editing ? (
            <div
              style={{
                marginBottom: "16px",
                padding: "10px 14px",
                borderRadius: "8px",
                background: "#fffbeb",
                border: "1px solid #fde68a",
                fontSize: "13px",
                color: "#92400e",
              }}
            >
              Editing <strong>{editing.quotationNo}</strong> — the quotation number stays the
              same.
              {editing.updatedAt ? (
                <span style={{ color: "#a16207" }}>
                  {" "}Last edited {editing.updatedAt.slice(0, 10)}
                  {editing.updatedBy ? ` by ${editing.updatedBy}` : ""}.
                </span>
              ) : null}
            </div>
          ) : null}

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

          {/* Line items — one priced row each, added and removed freely. */}
          <div
            style={{
              marginTop: "16px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontWeight: 700,
              fontSize: "13px",
            }}
          >
            <span>Line items</span>
            <span style={{ fontWeight: 500, color: "#94a3b8", fontSize: "12px" }}>
              {form.lineItems.length} item{form.lineItems.length === 1 ? "" : "s"}
            </span>
          </div>

          {form.lineItems.map((item, index) => (
            <div
              key={index}
              style={{
                marginTop: "10px",
                padding: "12px 14px",
                borderRadius: "10px",
                border: "1px solid var(--border-color, #e2e8f0)",
                background: "var(--panel-soft-bg, #fbfcfe)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "8px",
                }}
              >
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
                  Item {index + 1}
                </span>
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
                      borderRadius: "8px",
                      padding: "2px 12px",
                      fontSize: "12px",
                      fontWeight: 600,
                      minHeight: "28px",
                      cursor: "pointer",
                    }}
                  >
                    × Remove
                  </button>
                )}
              </div>

              <div style={grid2}>
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
                <div>
                  <label style={label}>Amount (₹) *</label>
                  <input
                    style={field}
                    type="number"
                    min={0}
                    value={item.baseAmount || ""}
                    onChange={(e) =>
                      setLineItem(index, { baseAmount: Number(e.target.value) || 0 })
                    }
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addLineItem}
            style={{
              marginTop: "10px",
              background: "#ffffff",
              color: "#2563eb",
              border: "1px dashed #93c5fd",
              borderRadius: "10px",
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 700,
              minHeight: "38px",
              cursor: "pointer",
            }}
          >
            + Add line item
          </button>

          <div style={{ marginTop: "18px", fontWeight: 700, fontSize: "13px" }}>Amount</div>
          <div style={grid2}>
            <div>
              <label style={label}>Subtotal (₹)</label>
              <input
                style={{ ...field, background: "#f1f5f9", fontWeight: 700 }}
                value={formatMoney(subtotal)}
                readOnly
                // Derived from the rows above; typing here would let the printed sheet
                // disagree with the items it lists.
                aria-readonly="true"
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
              {saving
                ? "Saving…"
                : editing
                  ? "Save changes"
                  : "Save & generate quotation"}
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

      {/* Send. Shown as a small form rather than a one-click action because all three
          fields matter: which mailbox it leaves from decides where the reply lands, the
          address may not be the one on the sheet, and a covering line is usually wanted. */}
      {sending ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Send ${sending.quotationNo}`}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={() => (sendBusy ? null : setSending(null))}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--card-bg, #ffffff)",
              borderRadius: "12px",
              padding: "22px 24px",
              width: "min(460px, 100%)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <h3 style={{ margin: "0 0 4px 0", fontSize: "16px", fontWeight: 700 }}>
              Send {sending.quotationNo}
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "#64748b" }}>
              {sending.sentAt
                ? `Already sent ${daysSince(sending.sentAt)} day(s) ago${sending.sendCount && sending.sendCount > 1 ? ` · ${sending.sendCount} times` : ""}. This sends it again.`
                : "The quotation goes out as the body of the mail, from the region mailbox."}
            </p>

            <label style={label}>From mailbox</label>
            <select
              value={sendRegion}
              onChange={(e) => setSendRegion(e.target.value)}
              style={{ ...field, marginBottom: "12px" }}
            >
              <option value="">Choose a mailbox…</option>
              {mailboxes.map((m) => (
                <option key={m.email} value={m.regionCode}>
                  {m.regionCode} — {m.email}
                </option>
              ))}
            </select>

            <label style={label}>To</label>
            <input
              style={{ ...field, marginBottom: "12px" }}
              value={sendTo}
              onChange={(e) => setSendTo(e.target.value)}
              placeholder="customer@example.com"
            />

            <label style={label}>Covering note (optional)</label>
            <textarea
              style={{ ...field, marginBottom: "16px", minHeight: "80px", resize: "vertical" }}
              value={sendNote}
              onChange={(e) => setSendNote(e.target.value)}
              placeholder="Anything you want to say above the quotation…"
            />

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setSending(null)}
                disabled={sendBusy}
                style={secondaryBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={sendBusy}
                style={primaryBtn}
              >
                {sendBusy ? "Sending…" : "Send to customer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
/**
 * The email cell. Capped and clipped rather than left to size itself: a full address is
 * wider than every other column put together, and letting it set the table's width pushed
 * the actions off the right edge on a laptop screen. `title` keeps the whole address one
 * hover away.
 */
const tdEmail: React.CSSProperties = {
  ...td,
  maxWidth: "190px",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

/**
 * The actions column, pinned to the right edge.
 *
 * The table scrolls sideways when the window is narrow, and View / Print and Edit are the
 * only cells anyone reaches for — a row whose actions have scrolled out of sight reads as
 * a row with no actions, which is how the Edit button appeared to be missing in production
 * while it was there all along. Sticky keeps them in view at any width.
 */
const stickyActions: React.CSSProperties = {
  position: "sticky",
  right: 0,
  zIndex: 1,
  textAlign: "center",
  whiteSpace: "nowrap",
  // Opaque, or the row's text scrolls visibly underneath it.
  background: "var(--card-bg, #ffffff)",
  boxShadow: "-6px 0 6px -6px rgba(15, 23, 42, 0.18)",
};

const primaryBtn: React.CSSProperties = { padding: "9px 16px", fontSize: "13px", fontWeight: 600, borderRadius: "8px", border: "none", background: "#4f46e5", color: "#fff", cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { padding: "9px 16px", fontSize: "13px", fontWeight: 600, borderRadius: "8px", border: "1px solid #d1d5db", background: "#f9fafb", color: "#374151", cursor: "pointer" };
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: "#2563eb", fontWeight: 600, cursor: "pointer", fontSize: "13px", textDecoration: "underline" };
