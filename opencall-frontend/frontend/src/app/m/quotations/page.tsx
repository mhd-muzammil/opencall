"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppBar } from "../AppBar";
import { canSeeMobileSection, isSuperAdminSession, useMobileSession } from "../session";
import {
  autofillQuotation,
  createQuotation,
  updateQuotation,
  getQuotation,
  getQuotationSendDefaults,
  sendQuotation,
  setQuotationPayment,
  listQuotations,
  type CreateQuotationInput,
  type Quotation,
  type QuotationKind,
  type QuotationLineItem,
  type QuotationSendDefaults,
} from "../../../lib/quotationApiClient";
import { formatMoney } from "../../../lib/quotationFormat";
import { quotationStage, daysSince } from "../../../lib/quotationStage";
import { quotationTotals } from "../../../lib/quotationTotals";
import { QuotationPrint } from "../../../features/dashboard/components/QuotationPrint";
import { quotationPdf } from "../../../features/dashboard/components/quotationPdf";

/** Every quotation leaves from the trade desk, trade@renderways.in, whatever the branch. */
const DESK_FROM_MAILBOX = "TRADE";

const EMPTY_LINE_ITEM: QuotationLineItem = {
  serviceDescription: "",
  productDescription: "",
  modelNo: "",
  serialNo: "",
  baseAmount: 0,
};

const EMPTY_FORM: Omit<CreateQuotationInput, "kind"> = {
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

/** A blank form for a new quotation of this kind, dated today. */
function freshForm(kind: QuotationKind): CreateQuotationInput {
  return { ...EMPTY_FORM, kind, quotationDate: todayIso(), lineItems: [{ ...EMPTY_LINE_ITEM }] };
}

/** The two options of the section, in the order the desktop shows them. */
const KINDS: { kind: QuotationKind; label: string }[] = [
  { kind: "VISIT", label: "Visit Quotation" },
  { kind: "PART", label: "Part Quotation" },
];

/**
 * Quotations — full parity with the desktop section: browse the saved history, create a
 * new quotation (with Case-ID auto-fill and the same validation), and open the identical
 * RENDERWAYS print sheet. The sheet component itself is reused, so the PDF is the same
 * document the web produces. Visit and Part quotations are the two options of the list,
 * as they are the two tabs on the desktop.
 */
export default function MobileQuotationsPage() {
  const { session } = useMobileSession();
  const allowed =
    isSuperAdminSession(session) || canSeeMobileSection(session, "quotations");

  const [kind, setKind] = useState<QuotationKind>("VISIT");
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  // The quotation being corrected. Its id is where the save goes; its number is shown on
  // the form because an edit does NOT reissue it.
  const [editing, setEditing] = useState<Quotation | null>(null);

  // Every quotation, Visit or Part, goes out as the trade desk's own mail: from trade@,
  // copied to the desk's two and the customer's branch, the sheet attached as a PDF. The
  // server says what that comes to; the CC stays editable.
  const [sending, setSending] = useState<Quotation | null>(null);
  const [sendTo, setSendTo] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendDefaults, setSendDefaults] = useState<QuotationSendDefaults | null>(null);
  const [sendDefaultsFailed, setSendDefaultsFailed] = useState(false);
  const [sendCc, setSendCc] = useState("");
  const sendDefaultsSeq = useRef(0);
  // Said inside the sheet as well: the page's own message line is behind it.
  const [sendError, setSendError] = useState<string | null>(null);

  function startSend(q: Quotation) {
    setSending(q);
    setSendTo(q.customerEmail || "");
    setSendDefaults(null);
    setSendDefaultsFailed(false);
    setSendCc("");
    setSendError(null);
    setMessage(null);
    const seq = ++sendDefaultsSeq.current;
    if (!session) return;
    void getQuotationSendDefaults(session.token, q.id)
      .then((defaults) => {
        if (seq !== sendDefaultsSeq.current) return;
        setSendDefaults(defaults);
        setSendCc(defaults.cc.join(", "));
      })
      .catch(() => {
        // Sending still works: without a CC from here, the server copies its own list.
        if (seq === sendDefaultsSeq.current) setSendDefaultsFailed(true);
      });
  }

  async function handleSend() {
    if (!sending || !session) return;
    const refuse = (text: string) => {
      setMessage(text);
      setSendError(text);
    };
    if (!sendTo.trim()) return refuse("Enter the customer's email address.");
    if (sendDefaults?.canSend === false) {
      setSendError(sendDefaults.blockedReason ?? "This login cannot send quotations.");
      return;
    }
    setSendBusy(true);
    setMessage(null);
    setSendError(null);
    try {
      // The sheet goes with it as a PDF, made here from the same sheet Print shows — drawn
      // from the quotation as it is on file now, not as this page loaded it. The server
      // checks the two are the same.
      const fresh = await getQuotation(session.token, sending.id);
      const pdf = await quotationPdf(fresh);
      await sendQuotation(
        session.token,
        sending.id,
        {
          regionCode: DESK_FROM_MAILBOX,
          to: sendTo.trim(),
          ...(sendDefaults ? { cc: sendCc.trim() } : {}),
          renderedVersion: fresh.updatedAt ?? fresh.createdAt,
        },
        { pdf, filename: sendDefaults?.attachmentName ?? "quotation.pdf" },
      );
      setSending(null);
      setMessage(`Sent to ${sendTo.trim()}.`);
      void load();
    } catch (error) {
      refuse(error instanceof Error ? error.message : "Send failed");
    } finally {
      setSendBusy(false);
    }
  }

  async function handlePayment(q: Quotation, status: "PENDING" | "PAID" | "DECLINED") {
    if (!session) return;
    try {
      await setQuotationPayment(session.token, q.id, { status });
      void load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update payment");
    }
  }
  const [items, setItems] = useState<Quotation[]>([]);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState<Quotation | null>(null);

  const [form, setForm] = useState<CreateQuotationInput>(() => freshForm("VISIT"));
  const [autofilling, setAutofilling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  // Which load is the latest. Switching option while a load is in flight would otherwise let
  // the slower, older answer land last and put the other kind's rows under this one's label.
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    if (!session || !allowed) return;
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const res = await listQuotations(session.token, {
        ...(debounced ? { search: debounced } : {}),
        kind,
        perPage: 50,
      });
      if (seq !== loadSeq.current) return;
      // Kept to the open kind here too: a server from before Visit quotations ignores the
      // filter and sends every row, and those are all Part quotations.
      setItems(res.items.filter((q) => (q.kind ?? "PART") === kind));
    } catch (error) {
      if (seq !== loadSeq.current) return;
      setMessage(error instanceof Error ? error.message : "Failed to load quotations");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [session, allowed, debounced, kind]);

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

  /**
   * Load a quotation back into the form. A quotation raised before line items existed
   * carries its single priced row only in the flat fields, so fall back to those rather
   * than open an empty sheet on an old one. Same rule as the web reader.
   */
  function startEdit(q: Quotation) {
    setEditing(q);
    setMessage(null);
    setForm({
      // Shown and sent as raised; the server never changes a quotation's kind on an edit.
      kind: q.kind ?? "PART",
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
      const saved = editing
        ? await updateQuotation(session.token, editing.id, form)
        : await createQuotation(session.token, form);
      setForm(freshForm(kind));
      setEditing(null);
      setMode("list");
      setPrinting(saved); // open the print view straight away, same as the web
      // A server not yet updated for Visit quotations saves every new one as a Part one.
      if (!editing && (saved.kind ?? "PART") !== form.kind) {
        setMessage(
          `Saved as ${saved.quotationNo}, but the server recorded it as a Part quotation — it has not been updated for Visit quotations yet.`,
        );
      }
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
        subtitle={
          mode === "list"
            ? `${items.length} saved`
            : editing
              ? `Editing ${editing.quotationNo}`
              : kind === "VISIT"
                ? "New visit quotation"
                : "New part quotation"
        }
        back
        action={
          mode === "list" ? (
            <button
              type="button"
              className="mIconBtn"
              aria-label={kind === "VISIT" ? "New visit quotation" : "New part quotation"}
              onClick={() => {
                setMessage(null);
                setEditing(null);
                setForm(freshForm(kind));
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
                setEditing(null);
                setForm(freshForm(kind));
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
            <div className="mSegment" role="tablist" aria-label="Quotations" style={{ marginBottom: 12 }}>
              {KINDS.map((k) => (
                <button
                  key={k.kind}
                  type="button"
                  role="tab"
                  aria-selected={kind === k.kind}
                  className={`mSegment__btn${kind === k.kind ? " is-active" : ""}`}
                  onClick={() => {
                    if (k.kind === kind) return;
                    // Cleared first, so the other kind's rows never show under this label.
                    setItems([]);
                    setKind(k.kind);
                  }}
                >
                  {k.label}
                </button>
              ))}
            </div>
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
                    <div key={q.id}>
                      <button
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
                        {q.customerEmail ? (
                          <div className="mRow__meta" style={{ marginTop: 2 }}>
                            {q.customerEmail}
                          </div>
                        ) : null}
                        <div className="mRow__meta" style={{ marginTop: 2 }}>
                          {q.quotationDate} · Case {q.caseId || "-"} · WO {q.orderNumber || "-"}
                        </div>
                        {/* Sent when, and what came back. The ageing is what turns "we
                            quoted them" into "they have had it a week and said nothing". */}
                        {q.sentAt ? (
                          <div
                            className="mRow__meta"
                            style={{
                              marginTop: 2,
                              fontWeight: 700,
                              color: quotationStage(q).fg,
                            }}
                          >
                            {quotationStage(q).label} ·{" "}
                            {daysSince(q.sentAt) === 0
                              ? "sent today"
                              : `${daysSince(q.sentAt)}d ago`}
                            {q.sendCount && q.sendCount > 1 ? ` · ${q.sendCount}×` : ""}
                            {q.paymentSource === "AUTO" ? " · auto" : ""}
                          </div>
                        ) : (
                          <div className="mRow__meta" style={{ marginTop: 2, color: "#94a3b8" }}>
                            {quotationStage(q).label}
                          </div>
                        )}
                        {/* Payment-shaped but not conclusive: the one that needs eyes. */}
                        {q.sentAt && q.paymentStatus !== "PAID" && q.paymentSignal === "WEAK" ? (
                          <div
                            className="mRow__meta"
                            style={{ marginTop: 2, fontWeight: 700, color: "#b91c1c" }}
                          >
                            🔔 Customer replied — check payment
                          </div>
                        ) : null}
                      </button>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: 8,
                          flexWrap: "wrap",
                          padding: "0 14px 10px",
                        }}
                      >
                        {q.sentAt ? (
                          <select
                            className="mChip"
                            value={q.paymentStatus ?? "PENDING"}
                            onChange={(e) =>
                              void handlePayment(
                                q,
                                e.target.value as "PENDING" | "PAID" | "DECLINED",
                              )
                            }
                          >
                            <option value="PENDING">Awaiting payment</option>
                            <option value="PAID">Paid</option>
                            <option value="DECLINED">Declined</option>
                          </select>
                        ) : null}
                        {/* Straight to what the customer wrote. A link rather than a
                            button because it leaves this screen, and highlighted once a
                            reply has landed — that is when it needs reading. */}
                        {q.orderNumber ? (
                          <a
                            className={`mChip ${q.replySeenAt ? "mChip--danger" : ""}`}
                            href={`/m/emails?ticketId=${encodeURIComponent(q.orderNumber)}`}
                            style={{ textDecoration: "none" }}
                          >
                            {q.replySeenAt ? "✉ Read reply" : "✉ Mail"}
                          </a>
                        ) : null}
                        <button type="button" className="mChip" onClick={() => startSend(q)}>
                          {q.sentAt ? "Re-send" : "Send"}
                        </button>
                        <button
                          type="button"
                          className="mChip"
                          onClick={() => startEdit(q)}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
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
                {/* A Visit sheet heads its units with its own fixed line. */}
                {form.kind !== "VISIT" ? (
                  <Text
                    label="Service Description"
                    value={item.serviceDescription}
                    onChange={(v) => setLineItem(index, { serviceDescription: v })}
                  />
                ) : null}
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
              {saving ? "Saving…" : editing ? "Save changes" : "Save & Print"}
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

      {/* Send. A sheet rather than a one-tap action: the address may not be the one on the
          quotation, and the CC may need a change. It always leaves from the trade desk. */}
      {sending ? (
        <div className="mSheetBackdrop" onClick={() => !sendBusy && setSending(null)}>
          <div className="mSheet" onClick={(e) => e.stopPropagation()}>
            <div className="mSheet__grip" />
            <div className="mSheet__title">Send {sending.quotationNo}</div>
            <div className="mMuted" style={{ fontSize: 12.5, marginBottom: 12 }}>
              {sending.sentAt
                ? `Already sent ${daysSince(sending.sentAt)}d ago. This sends it again.`
                : `Goes out as the trade desk's ${(sending.kind ?? "PART") === "VISIT" ? "Visit" : "Part"} quotation mail, with the sheet attached as a PDF.`}
            </div>

            {/* Fixed: every quotation leaves from the trade desk, whatever the branch. */}
            <label className="mLabel">From</label>
            <div className="mInput" style={{ marginBottom: 10 }}>
              {sendDefaults?.from ?? "trade@renderways.in"}
            </div>
            {sendDefaults && !sendDefaults.from ? (
              <div role="alert" style={{ fontSize: 12.5, color: "#b91c1c", marginBottom: 10 }}>
                trade@renderways.in is not set up as a mailbox in Customer Emails, so this send
                will fail.
              </div>
            ) : null}
            {sendDefaults?.canSend === false ? (
              <div role="alert" style={{ fontSize: 12.5, color: "#b91c1c", marginBottom: 10 }}>
                {sendDefaults.blockedReason}
              </div>
            ) : null}

            <label className="mLabel">To</label>
            <input
              className="mInput"
              value={sendTo}
              onChange={(e) => setSendTo(e.target.value)}
              placeholder="customer@example.com"
              style={{ marginBottom: 14 }}
            />

            {/* The desk's two and the customer's branch, worked out by the server. */}
            <label className="mLabel">CC</label>
            <input
              aria-label="CC"
              className="mInput"
              value={sendCc}
              onChange={(e) => setSendCc(e.target.value)}
              disabled={!sendDefaults}
              placeholder={
                sendDefaults
                  ? "Nobody copied"
                  : sendDefaultsFailed
                    ? "Could not load — the server will copy its usual list"
                    : "Loading…"
              }
              style={{ marginBottom: 6 }}
            />
            <div className="mMuted" style={{ fontSize: 12, marginBottom: 14 }}>
              {sendDefaults ? (
                <>
                  Subject: {sendDefaults.subject}
                  <br />
                  Attached: {sendDefaults.attachmentName}
                </>
              ) : (
                " "
              )}
            </div>

            {sendError ? (
              <div role="alert" style={{ fontSize: 12.5, color: "#b91c1c", marginBottom: 10 }}>
                {sendError}
              </div>
            ) : null}

            <button
              type="button"
              className="mBtn"
              disabled={sendBusy || sendDefaults?.canSend === false}
              onClick={() => void handleSend()}
            >
              {sendBusy ? "Sending…" : "Send to customer"}
            </button>
            <button
              type="button"
              className="mBtn mBtn--ghost"
              style={{ marginTop: 8 }}
              disabled={sendBusy}
              onClick={() => setSending(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
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
