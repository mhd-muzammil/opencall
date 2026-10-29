import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  approveQuotationDraft,
  autofillQuotation,
  createQuotation,
  updateQuotation,
  sendQuotation,
  setQuotationPayment,
  listQuotations,
  listQuotationDrafts,
  removeQuotationDraft,
  type CreateQuotationInput,
  type Quotation,
  type QuotationDraft,
  type QuotationDraftsReport,
  type QuotationKind,
  type QuotationLineItem,
} from "../../../lib/quotationApiClient";
import { formatMoney } from "../../../lib/quotationFormat";
import { quotationTotals } from "../../../lib/quotationTotals";
import { QuotationPrint } from "./QuotationPrint";
import { quotationStage, daysSince, OVERDUE_DAYS } from "../../../lib/quotationStage";

// What each box counts, and the money under it, live in one tested module — the counts have
// been wrong in every direction on this page and each time it was a person adding up rows by
// hand who found it.
import {
  TILE_LABELS,
  TILE_TESTS,
  tileCount,
  tileTotal,
  type TileKey,
} from "../../../lib/quotationTiles";
import { getCustomerEmails, type MailboxHealth } from "../../../lib/customerEmailApiClient";

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
  // A quotation always has at least one row; the form starts on it.
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

/**
 * Where the count boxes start. Quotations raised before this are the office's history: listed
 * under History, closed until opened, never counted in the boxes, still open to Edit, Send and
 * payment (the user, 29 Oct 2026).
 */
const FRESH_START = "2026-10-28T18:30:00.000Z"; // 29 Oct 2026, midnight in India
const FRESH_START_LABEL = "29 Oct 2026";

/** Raised before the fresh start. Postgres writes the moment as "2026-10-24 10:05:12.1+05:30". */
function raisedBefore(q: Quotation): boolean {
  const time = Date.parse(q.createdAt.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
  return !Number.isNaN(time) && time < Date.parse(FRESH_START);
}

/**
 * When the report raised a waiting quotation, on the India clock the office reads, e.g.
 * "29 Oct, 3:45 pm". Postgres writes the moment as "2026-10-29 15:45:00.1+05:30".
 */
function formatRaisedAt(createdAt: string): string {
  const time = Date.parse(createdAt.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
  if (Number.isNaN(time)) return createdAt;
  return new Date(time).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Every page of a list, so the boxes count all of it rather than the newest page. */
async function listAll(
  token: string,
  params: Omit<Parameters<typeof listQuotations>[1], "page" | "perPage">,
): Promise<Quotation[]> {
  const rows: Quotation[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const res = await listQuotations(token, { ...params, page, perPage: 100 });
    rows.push(...res.items);
    if (page >= res.pages || res.items.length === 0) break;
  }
  return rows;
}

/** The two options of the section, in the order the office asked for them. */
const KIND_TABS: { kind: QuotationKind; label: string }[] = [
  { kind: "VISIT", label: "Visit Quotation" },
  { kind: "PART", label: "Part Quotation" },
];

type QuotationsPageProps = Readonly<{
  token: string;
  /**
   * Open Customer Emails on this quotation's work order.
   *
   * A callback rather than navigation from here: the reader is one panel inside the
   * workspace and does not own which panel is showing. Absent — on the phone, or wherever
   * there is no inbox to switch to — the link simply is not offered.
   */
  onOpenMail?: (ticketId: string) => void;
}>;

/**
 * The Quotations section: Visit Quotation and Part Quotation, each its own page inside the
 * one section, with its own list, numbers, form and sheet.
 *
 * A tab is mounted the first time it is opened and then kept, hidden while the other is on
 * screen, so a half-typed quotation or a search survives a look at the other tab.
 */
export function QuotationsPage({ token, onOpenMail }: QuotationsPageProps) {
  const [kind, setKind] = useState<QuotationKind>("VISIT");
  const [opened, setOpened] = useState<QuotationKind[]>(["VISIT"]);

  function openTab(next: QuotationKind) {
    setKind(next);
    setOpened((list) => (list.includes(next) ? list : [...list, next]));
  }

  return (
    // `.panel` is a CSS grid whose items default to `min-width: auto`, so without an
    // explicit `minWidth: 0` this section refuses to shrink below the table's intrinsic
    // width — the panel widens instead and the WHOLE PAGE scrolls sideways (taking the
    // page header with it) rather than the table's own scroll container. Same fix as
    // RenewalPipelinePage, which has the other wide table in the app.
    <section style={{ padding: "8px 4px", minWidth: 0, maxWidth: "100%" }}>
      <div
        role="tablist"
        aria-label="Quotations"
        style={{ display: "flex", gap: 4, borderBottom: "1px solid #e5e7eb", marginBottom: 16 }}
      >
        {KIND_TABS.map((tab) => {
          const open = kind === tab.kind;
          return (
            <button
              key={tab.kind}
              type="button"
              role="tab"
              aria-selected={open}
              onClick={() => openTab(tab.kind)}
              style={{
                // First, so the weight and size below are not reset by it.
                font: "inherit",
                padding: "8px 14px",
                marginBottom: -1,
                border: "none",
                borderBottom: `2px solid ${open ? "#4f46e5" : "transparent"}`,
                background: "none",
                color: open ? "#4f46e5" : "#6b7280",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {KIND_TABS.map((tab) =>
        opened.includes(tab.kind) ? (
          <div key={tab.kind} role="tabpanel" aria-label={tab.label} hidden={kind !== tab.kind}>
            <QuotationsOfKind kind={tab.kind} token={token} {...(onOpenMail ? { onOpenMail } : {})} />
          </div>
        ) : null,
      )}
    </section>
  );
}

/** One kind's page: its list, its tiles, its form. */
function QuotationsOfKind({
  kind,
  token,
  onOpenMail,
}: QuotationsPageProps & Readonly<{ kind: QuotationKind }>) {
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

  // List state: the page's own quotations (the boxes count these), and its History.
  const [items, setItems] = useState<Quotation[]>([]);
  const [history, setHistory] = useState<Quotation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [search, setSearch] = useState("");
  // The quotations the OpenCall report raised, waiting for approval (the Waiting Approval
  // box). Kept apart from `items`: they are not quotations until approved, so none of the
  // other boxes counts them.
  const [drafts, setDrafts] = useState<QuotationDraft[]>([]);
  const [draftsTotal, setDraftsTotal] = useState(0);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  // How the Records page's count at this status splits — the work orders it shows that are
  // not waiting here, and why — so the box's number can be checked against the page.
  const [draftsReport, setDraftsReport] = useState<QuotationDraftsReport | null>(null);
  // The waiting quotation the form is open to approve, if that is what it is open for.
  const [approving, setApproving] = useState<QuotationDraft | null>(null);
  // Which load is the newest. Every keystroke in the search loads again, and an earlier,
  // wider search can answer last; only the newest one's waiting list is shown.
  const loadSeq = useRef(0);
  /**
   * The header box someone has clicked, if any. A number nobody can open is a number they
   * have to take on trust; clicking it shows the rows it counted.
   */
  const [tileFilter, setTileFilter] = useState<TileKey | "WAITING" | null>(null);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState<Quotation | null>(null);

  // Form state
  const [form, setForm] = useState<CreateQuotationInput>(() => freshForm(kind));
  const [autofilling, setAutofilling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Asked alongside the quotations but answered on its own: a server without the waiting
    // list (not deployed yet, or its table not created) costs the Waiting Approval box a
    // number, never the rest of the page.
    const seq = ++loadSeq.current;
    const waiting = listQuotationDrafts(token, { kind, search }).then(
      (res) => {
        if (seq !== loadSeq.current) return;
        setDrafts(res.items);
        setDraftsTotal(res.total);
        setDraftsReport(res.report ?? null);
        setDraftsError(null);
      },
      (error: unknown) => {
        if (seq !== loadSeq.current) return;
        setDrafts([]);
        setDraftsTotal(0);
        setDraftsReport(null);
        setDraftsError(error instanceof Error ? error.message : "Could not load them");
      },
    );
    try {
      const [current, earlier] = await Promise.all([
        listAll(token, { search, kind, createdFrom: FRESH_START }),
        listAll(token, { search, kind, createdBefore: FRESH_START }),
      ]);
      // Kept to this tab's kind, and to each side of the fresh start, here too: a server
      // from before these filters ignores them and sends every row to both lists.
      const ofKind = (q: Quotation) => (q.kind ?? "PART") === kind;
      setItems(current.filter((q) => ofKind(q) && !raisedBefore(q)));
      setHistory(earlier.filter((q) => ofKind(q) && raisedBefore(q)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load quotations");
    } finally {
      await waiting;
      setLoading(false);
    }
  }, [token, search, kind]);

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
      // A waiting quotation is for its own work order, so it is looked up by that alone: by
      // case, the newest row could be a sibling work order on the same case.
      const data = await autofillQuotation(
        token,
        approving
          ? { orderNumber: form.orderNumber }
          : { caseId: form.caseId, orderNumber: form.orderNumber },
      );
      if (!data) {
        setMessage("No matching case found — you can fill the details manually.");
        return;
      }
      set({
        caseId: data.caseId || form.caseId,
        orderNumber: approving ? form.orderNumber : data.orderNumber || form.orderNumber,
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

  /**
   * Open the form on a waiting quotation: what the report knew is filled in, the amount is
   * left to the person approving, and the number is given only when they approve.
   */
  function startApprove(draft: QuotationDraft) {
    setEditing(null);
    setApproving(draft);
    setMessage(null);
    setForm({
      ...freshForm(kind),
      caseId: draft.caseId,
      orderNumber: draft.ticketId,
      customerName: draft.customerName,
      customerAddress: draft.customerAddress,
      customerCity: draft.customerCity,
      customerState: draft.customerState,
      customerPincode: draft.customerPincode,
      customerPhone: draft.customerPhone,
      customerEmail: draft.customerEmail,
      lineItems: [
        {
          ...EMPTY_LINE_ITEM,
          productDescription: draft.productDescription,
          modelNo: draft.modelNo,
          serialNo: draft.serialNo,
        },
      ],
    });
    setMode("create");
  }

  /** Take a waiting quotation off the list for good — no report raises it again. */
  async function handleRemoveDraft(draft: QuotationDraft) {
    if (
      !window.confirm(
        `Remove the waiting ${title.toLowerCase()} for ${draft.ticketId}? It will not come back.`,
      )
    ) {
      return;
    }
    setMessage(null);
    try {
      await removeQuotationDraft(token, draft.id);
      setMessage(`Removed the waiting ${title.toLowerCase()} for ${draft.ticketId}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove it");
    }
    void load();
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
        : approving
          ? await approveQuotationDraft(token, approving.id, form)
          : await createQuotation(token, form);
      setForm(freshForm(kind));
      setEditing(null);
      setApproving(null);
      setMode("list");
      // Reload so the list shows the corrected figures rather than the ones it fetched
      // before the edit; creating (or approving) does not need this because the list
      // refetches anyway.
      if (editing) void load();
      setPrinting(saved); // open the print view straight away
      if (approving) {
        setMessage(`Approved — ${saved.quotationNo} raised for ${approving.ticketId}.`);
      } else if (!editing && (saved.kind ?? "PART") !== form.kind) {
        // A server not yet updated for Visit quotations saves every new one as a Part one.
        // Say so, rather than let a QEN number pass for a Visit quotation.
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

  const field: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    fontSize: "13px",
    borderRadius: "8px",
    border: "1px solid var(--border-color, #d1d5db)",
    background: "var(--input-bg, #f9fafb)",
  };
  const label: React.CSSProperties = { fontSize: "12px", fontWeight: 600, marginBottom: "4px", display: "block" };
  const title = kind === "VISIT" ? "Visit Quotation" : "Part Quotation";

  // The same table twice: the page's own quotations, narrowed by the box clicked, and below
  // them the History, closed until someone opens it.
  const sections: Array<{ key: "current" | "history"; rows: Quotation[]; test: (q: Quotation) => boolean; emptyText: string }> = [
    {
      key: "current",
      rows: items,
      // The Waiting Approval box shows its own table in this one's place (below).
      test: (q) => !tileFilter || tileFilter === "WAITING" || TILE_TESTS[tileFilter](q),
      emptyText:
        history.length > 0
          ? `No ${title.toLowerCase()}s since ${FRESH_START_LABEL}. The older ones are under History below.`
          : "No quotations yet.",
    },
    ...(history.length > 0
      ? [{ key: "history" as const, rows: history, test: () => true, emptyText: "" }]
      : []),
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>{title}s</h2>
        {mode === "list" ? (
          <button type="button" onClick={() => { setEditing(null); setApproving(null); setForm(freshForm(kind)); setMode("create"); setMessage(null); }} style={primaryBtn}>
            + New {title}
          </button>
        ) : (
          <button type="button" onClick={() => { setEditing(null); setApproving(null); setForm(freshForm(kind)); setMode("list"); setMessage(null); }} style={secondaryBtn}>
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
            // Seven boxes, read left to right, one question each. The one they replace
            // asked several at once — "check payment" held sent and unsent, answered and
            // unanswered together, so a number that large told nobody what to do next.
            //
            // The money is summed over the box's OWN test rather than a rule of its own.
            // Written separately, "₹83,789 outstanding" once described seven more
            // quotations than the 40 the box beside it was counting, and there was no way
            // to tell from the screen which of the two was lying.
            const paidValue = tileTotal(items, "PAID");
            const owedValue = tileTotal(items, "NOT_PAID");

            const created = tileCount(items, "CREATED");
            const sent = tileCount(items, "SENT");
            const replied = tileCount(items, "REPLIED");
            const noReply = tileCount(items, "NO_REPLY");
            const paid = tileCount(items, "PAID");
            const notPaid = tileCount(items, "NOT_PAID");
            const rejected = tileCount(items, "REJECTED");

            const tiles: Array<{
              key: TileKey | "WAITING";
              label: string;
              value: string;
              hint: string;
              fg: string;
            }> = [
              // Before the funnel, not part of it: what the report raised and nobody has
              // approved yet. These are not quotations — no number, no amount — so the
              // arithmetic of the seven boxes after it never includes them.
              {
                key: "WAITING",
                label: "Waiting Approval",
                value: draftsError ? "—" : String(draftsTotal),
                hint: draftsError
                  ? "could not load"
                  : draftsReport && !search.trim()
                    ? reportSplit(draftsReport)
                    : "from the report",
                fg: draftsTotal > 0 ? "#b45309" : "#94a3b8",
              },
              { key: "CREATED", label: "Created", value: String(created), hint: "not mailed yet", fg: "#475569" },
              { key: "SENT", label: "Sent", value: String(sent), hint: "the customer has it", fg: "#1d4ed8" },
              { key: "REPLIED", label: "Replied", value: String(replied), hint: "of the sent, answered", fg: replied > 0 ? "#b91c1c" : "#94a3b8" },
              { key: "NO_REPLY", label: "No reply", value: String(noReply), hint: "of the sent, nothing heard", fg: noReply > 0 ? "#9a3412" : "#94a3b8" },
              { key: "PAID", label: "Paid", value: String(paid), hint: `₹${formatMoney(paidValue)} collected`, fg: "#166534" },
              { key: "NOT_PAID", label: "Not paid", value: String(notPaid), hint: `₹${formatMoney(owedValue)} outstanding`, fg: notPaid > 0 ? "#b91c1c" : "#94a3b8" },
              { key: "REJECTED", label: "Rejected", value: String(rejected), hint: "customer said no", fg: "#64748b" },
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
                  // Clicking narrows the list to exactly the rows this counted, and clicking
                  // the same one again clears it — the way out has to be where the way in
                  // was, or a filtered list looks like a broken one.
                  <button
                    key={tile.label}
                    type="button"
                    onClick={() =>
                      setTileFilter((current) => (current === tile.key ? null : tile.key))
                    }
                    title={
                      tileFilter === tile.key
                        ? "Showing these — click to show all again"
                        : `Show only these ${tile.label.toLowerCase()} quotations`
                    }
                    style={{
                      textAlign: "left",
                      cursor: "pointer",
                      padding: "10px 14px",
                      borderRadius: "10px",
                      border: `1px solid ${tileFilter === tile.key ? tile.fg : "var(--border-color, #e5e7eb)"}`,
                      boxShadow: tileFilter === tile.key ? `inset 0 0 0 1px ${tile.fg}` : "none",
                      background: tileFilter === tile.key ? "#f8fafc" : "var(--card-bg, #ffffff)",
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
                  </button>
                ))}
              </div>
            );
          })()}

          {tileFilter ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "12px",
                padding: "8px 14px",
                borderRadius: "8px",
                background: "#eef2ff",
                border: "1px solid #c7d2fe",
                fontSize: "13px",
                color: "#3730a3",
              }}
            >
              <span>
                Showing{" "}
                <strong>{tileFilter === "WAITING" ? "waiting approval" : TILE_LABELS[tileFilter]}</strong>{" "}
                only.
              </span>
              <button
                type="button"
                onClick={() => setTileFilter(null)}
                style={{
                  marginLeft: "auto",
                  background: "none",
                  border: "none",
                  color: "#4338ca",
                  fontWeight: 700,
                  cursor: "pointer",
                  textDecoration: "underline",
                  fontSize: "12px",
                }}
              >
                Show all
              </button>
            </div>
          ) : null}

          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quotation no, customer, Case ID, WO…"
            style={{ ...field, maxWidth: "360px", marginBottom: "14px" }}
          />
          {sections.map((section) => (
            <Fragment key={section.key}>
              {section.key === "history" ? (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "20px 0 10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    aria-expanded={showHistory}
                    onClick={() => setShowHistory((open) => !open)}
                    style={secondaryBtn}
                  >
                    {showHistory ? "▾" : "▸"} History ({history.length})
                  </button>
                  <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                    Raised before {FRESH_START_LABEL} · not counted in the boxes above
                  </span>
                </div>
              ) : null}
              {section.key === "current" && tileFilter === "WAITING" ? (
                <WaitingTable
                  drafts={drafts}
                  total={draftsTotal}
                  error={draftsError}
                  loading={loading}
                  kind={kind}
                  report={search.trim() ? null : draftsReport}
                  onApprove={startApprove}
                  onRemove={(draft) => void handleRemoveDraft(draft)}
                />
              ) : section.key === "current" || showHistory ? (
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
                ) : section.rows.length === 0 ? (
                  <tr><td colSpan={9} style={{ ...td, textAlign: "center", padding: "26px", color: "#6b7280" }}>{section.emptyText}</td></tr>
                ) : (
                  section.rows.filter(section.test).map((q) => {
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
                          {/* Straight to what the customer actually wrote. Offered only
                              when there is a work order to filter the inbox by, and
                              highlighted once a reply has landed — that is the moment
                              somebody needs to read it rather than guess at the badge. */}
                          {onOpenMail && q.orderNumber ? (
                            <>
                              <span style={{ color: "#d1d5db", margin: "0 6px" }}>|</span>
                              <button
                                type="button"
                                onClick={() => onOpenMail(q.orderNumber)}
                                title={
                                  q.replySeenAt
                                    ? `Customer replied ${q.replySeenAt.slice(0, 10)} — read it`
                                    : "Open this work order's mail"
                                }
                                style={{
                                  ...linkBtn,
                                  color: q.replySeenAt ? "#b91c1c" : linkBtn.color,
                                  fontWeight: q.replySeenAt ? 800 : linkBtn.fontWeight,
                                }}
                              >
                                {q.replySeenAt ? "✉ Read reply" : "✉ Mail"}
                              </button>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
              ) : null}
            </Fragment>
          ))}
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

          {/* What is being approved, and that nothing is numbered until it is. */}
          {approving ? (
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
              Approving the waiting {title.toLowerCase()} for{" "}
              <strong>{approving.ticketId}</strong>
              {approving.flexStatus ? ` (Flex Status: ${approving.flexStatus})` : ""}.
              {/* The part is what a Part quotation prices, and the list that showed it is off
                  screen while the form is open. */}
              {approving.kind === "PART" && approving.part ? (
                <>
                  {" "}Part: <strong>{approving.part}</strong>.
                </>
              ) : null}{" "}
              Enter the amount and check the details — the quotation number is given when you
              approve.
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
              {/* Fixed while approving: the quotation is raised for the waiting one's own work
                  order, whatever is typed here (the server holds it to that too). */}
              <input
                style={approving ? { ...field, background: "#f1f5f9" } : field}
                value={form.orderNumber}
                readOnly={Boolean(approving)}
                onChange={(e) => set({ orderNumber: e.target.value })}
              />
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
                {/* A Visit sheet heads its units with its own fixed line, so a Visit row
                    has no description of the service to type. */}
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
                  : approving
                    ? "Approve & generate quotation"
                    : "Save & generate quotation"}
            </button>
            <button type="button" onClick={() => { setApproving(null); setMode("list"); setMessage(null); }} style={secondaryBtn}>
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
    </div>
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

/** The Waiting Approval box's line under its number, e.g. "of 43 on the report · 4 already quoted". */
function reportSplit(report: QuotationDraftsReport): string {
  const count = (reason: QuotationDraftsReport["notWaiting"][number]["reason"]) =>
    report.notWaiting.filter((entry) => entry.reason === reason).length;
  const quoted = count("QUOTED");
  const removed = count("REMOVED");
  const notRaised = count("NOT_RAISED");
  return [
    `of ${report.onReport} on the report`,
    quoted ? `${quoted} already quoted` : "",
    removed ? `${removed} removed` : "",
    notRaised ? `${notRaised} not raised yet` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The quotations the report raised, waiting for approval: which work order each is for, and
 * the two things to do with it. Approve opens the form with the amount left to fill in;
 * Remove takes it off the list for good.
 *
 * Above them, the work orders the Records page shows at the same status that are not
 * waiting here, and why — so the page's count and this list add up, one work order at a time.
 */
function WaitingTable({
  drafts,
  total,
  error,
  loading,
  kind,
  report,
  onApprove,
  onRemove,
}: Readonly<{
  drafts: QuotationDraft[];
  total: number;
  error: string | null;
  loading: boolean;
  kind: QuotationKind;
  /** Null while searching: the search narrows the list, not the report. */
  report: QuotationDraftsReport | null;
  onApprove: (draft: QuotationDraft) => void;
  onRemove: (draft: QuotationDraft) => void;
}>) {
  // The part the case needs is what a Part quotation prices, so it is shown on that page.
  const showPart = kind === "PART";
  const columns = showPart ? 9 : 8;
  const clipped: React.CSSProperties = { ...td, maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis" };
  const note = (text: string) => (
    <tr>
      <td colSpan={columns} style={{ ...td, textAlign: "center", padding: "26px", color: "#6b7280" }}>
        {text}
      </td>
    </tr>
  );
  const status = kind === "VISIT" ? "Visit Estimate" : "Visit Quote To Customer";
  const listed = (reason: QuotationDraftsReport["notWaiting"][number]["reason"]) =>
    (report?.notWaiting ?? []).filter((entry) => entry.reason === reason);
  const quoted = listed("QUOTED");
  const removed = listed("REMOVED");
  const notRaised = listed("NOT_RAISED");
  return (
    <>
      {report && !loading && !error ? (
        <div
          style={{
            marginBottom: "10px",
            padding: "8px 14px",
            borderRadius: "8px",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            fontSize: "12px",
            color: "#92400e",
            display: "grid",
            gap: "4px",
          }}
        >
          <div>
            The Records page shows <strong>{report.onReport}</strong> at Flex Status {status}{" "}
            (01-Trade): <strong>{total}</strong> waiting below
            {report.notWaiting.length > 0 ? `, ${report.notWaiting.length} not:` : "."}
          </div>
          {quoted.length > 0 ? (
            <div>
              Already quoted ({quoted.length}):{" "}
              {quoted.map((entry) => `${entry.ticketId} (${entry.quotationNos.join(", ")})`).join(" · ")}
            </div>
          ) : null}
          {removed.length > 0 ? (
            <div>
              Removed ({removed.length}): {removed.map((entry) => entry.ticketId).join(" · ")}
            </div>
          ) : null}
          {notRaised.length > 0 ? (
            <div>
              Not raised yet — the next report refresh raises them ({notRaised.length}):{" "}
              {notRaised.map((entry) => entry.ticketId).join(" · ")}
            </div>
          ) : null}
        </div>
      ) : null}
      {total > drafts.length ? (
        <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "8px" }}>
          Showing the newest {drafts.length} of {total}.
        </div>
      ) : null}
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
              <th style={th}>WO</th>
              <th style={th}>Case ID</th>
              <th style={th}>Customer</th>
              <th style={th}>Product</th>
              <th style={th}>Serial No</th>
              {showPart ? <th style={th}>Part</th> : null}
              <th style={th}>Location</th>
              <th style={th}>Raised</th>
              <th style={{ ...th, ...stickyActions, background: "var(--th-bg, #f3f4f6)" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? note("Loading…")
              : error
                ? note(`Could not load the waiting quotations: ${error}`)
                : drafts.length === 0
                  ? note("Nothing waiting for approval.")
                  : drafts.map((draft) => (
                      <tr key={draft.id}>
                        <td style={{ ...td, fontWeight: 600 }}>{draft.ticketId}</td>
                        <td style={td}>{draft.caseId || "-"}</td>
                        <td style={td}>{draft.customerName || "-"}</td>
                        <td style={clipped} title={draft.productDescription || undefined}>
                          {draft.productDescription || "-"}
                        </td>
                        <td style={td}>{draft.serialNo || "-"}</td>
                        {showPart ? (
                          <td style={clipped} title={draft.part || undefined}>
                            {draft.part || "-"}
                          </td>
                        ) : null}
                        <td style={td}>{draft.workLocation || "-"}</td>
                        <td style={td}>{formatRaisedAt(draft.createdAt)}</td>
                        <td style={{ ...td, ...stickyActions }}>
                          <button type="button" onClick={() => onApprove(draft)} style={linkBtn}>
                            Approve
                          </button>
                          <span style={{ color: "#d1d5db", margin: "0 6px" }}>|</span>
                          <button
                            type="button"
                            onClick={() => onRemove(draft)}
                            style={{ ...linkBtn, color: "#b91c1c" }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
          </tbody>
        </table>
      </div>
    </>
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
