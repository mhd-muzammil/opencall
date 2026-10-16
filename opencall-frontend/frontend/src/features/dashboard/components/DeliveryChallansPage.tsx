import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BRANCH_KEYS,
  BRANCH_LABELS,
  autofillDeliveryChallan,
  createDeliveryChallan,
  listChallanBranches,
  listDeliveryChallans,
  updateChallanBranch,
  updateDeliveryChallan,
  type BranchKey,
  type ChallanBranch,
  type ChallanBranchInput,
  type DeliveryChallan,
  type DeliveryChallanItem,
} from "../../../lib/deliveryChallanApiClient";
import {
  EMPTY_CHALLAN_ITEM,
  applyChallanAutofill,
  challanFormFrom,
  challanLines,
  challanRequestBody,
  emptyChallanForm,
  formatChallanDate,
  missingLetterhead,
  type DeliveryChallanForm,
} from "../../../lib/deliveryChallanFormat";
import { DeliveryChallanPrint } from "./DeliveryChallanPrint";

/** The list shows the newest this many; an older challan is found by searching for it. */
const PAGE_SIZE = 50;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function branchLabel(key: string, fallback?: string): string {
  return BRANCH_LABELS[key as BranchKey] ?? (fallback || key);
}

function branchDraft(branch: ChallanBranch): ChallanBranchInput {
  return {
    name: branch.name,
    companyLine: branch.companyLine,
    addressLines: branch.addressLines,
    gstin: branch.gstin,
    contact: branch.contact,
    email: branch.email,
  };
}

export function DeliveryChallansPage({
  token,
  canEditBranches,
}: Readonly<{
  token: string;
  /**
   * The letterheads print on every challan, so only a SUPER_ADMIN changes them; everyone
   * else who has the section can read them. The server refuses the save for anyone else
   * regardless — this only decides whether the form is offered.
   */
  canEditBranches: boolean;
}>) {
  const [mode, setMode] = useState<"list" | "create" | "edit" | "branches">("list");
  // The challan being corrected. Its number is shown on the form so it is obvious the
  // document is not being reissued under a new one.
  const [editing, setEditing] = useState<DeliveryChallan | null>(null);

  // List state
  const [rows, setRows] = useState<DeliveryChallan[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<BranchKey | "">("");
  const [loading, setLoading] = useState(false);
  /**
   * Why the list could not be read, as the server put it. A 503 here means the challan
   * tables are not set up on the server yet, and that is exactly what the message says —
   * shown in place of the rows rather than as an empty list nobody can explain.
   */
  const [listError, setListError] = useState<string | null>(null);
  const [printing, setPrinting] = useState<DeliveryChallan | null>(null);

  // Form state
  const [form, setForm] = useState<DeliveryChallanForm>(() => emptyChallanForm(todayIso()));
  // The case to look up. Kept apart from the challan's own Case IDs: each lookup ADDS a
  // case to the challan, so these are cleared for the next one once it has been added.
  const [lookupCaseId, setLookupCaseId] = useState("");
  const [lookupOrderNumber, setLookupOrderNumber] = useState("");
  const [autofilling, setAutofilling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Branch letterheads
  const [branches, setBranches] = useState<ChallanBranch[] | null>(null);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<BranchKey, ChallanBranchInput>>>({});
  const [savingBranch, setSavingBranch] = useState<BranchKey | null>(null);

  // Every keystroke in the search asks again, and answers can come back out of order; only
  // the latest request may fill the table, or it shows rows for a search no longer typed.
  const listRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++listRequest.current;
    setLoading(true);
    try {
      const res = await listDeliveryChallans(token, {
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(branchFilter ? { branch: branchFilter } : {}),
        pageSize: PAGE_SIZE,
      });
      if (request !== listRequest.current) return;
      setRows(res.items);
      setTotal(res.total);
      setListError(null);
    } catch (error) {
      if (request !== listRequest.current) return;
      setRows([]);
      setTotal(0);
      setListError(error instanceof Error ? error.message : "Failed to load delivery challans");
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }, [token, search, branchFilter]);

  useEffect(() => {
    if (mode === "list") void load();
  }, [mode, load]);

  const loadBranches = useCallback(async () => {
    try {
      const list = await listChallanBranches(token);
      setBranches(list);
      setBranchesError(null);
      setDrafts(Object.fromEntries(list.map((branch) => [branch.branchKey, branchDraft(branch)])));
    } catch (error) {
      setBranchesError(error instanceof Error ? error.message : "Failed to load branch details");
    }
  }, [token]);

  // The Branch details view reads them, and so does a new challan's form: it warns when
  // the chosen branch's letterhead is still empty.
  useEffect(() => {
    if (mode === "branches" || mode === "create") void loadBranches();
  }, [mode, loadBranches]);

  const set = (patch: Partial<DeliveryChallanForm>) => setForm((f) => ({ ...f, ...patch }));

  const setItem = (index: number, patch: Partial<DeliveryChallanItem>) =>
    setForm((f) => ({
      ...f,
      items: f.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));

  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, { ...EMPTY_CHALLAN_ITEM }] }));

  /** The goods table always keeps one row to type into. */
  const removeItem = (index: number) =>
    setForm((f) =>
      f.items.length <= 1 ? f : { ...f, items: f.items.filter((_, i) => i !== index) },
    );

  function startCreate() {
    setEditing(null);
    setForm(emptyChallanForm(todayIso()));
    setLookupCaseId("");
    setLookupOrderNumber("");
    setMessage(null);
    setMode("create");
  }

  function startEdit(c: DeliveryChallan) {
    setEditing(c);
    setForm(challanFormFrom(c));
    setLookupCaseId("");
    setLookupOrderNumber("");
    setMessage(null);
    setMode("edit");
  }

  function backToList() {
    setEditing(null);
    setForm(emptyChallanForm(todayIso()));
    setMessage(null);
    setMode("list");
  }

  async function handleAutofill() {
    const caseId = lookupCaseId.trim();
    const orderNumber = lookupOrderNumber.trim();
    if (!caseId && !orderNumber) {
      setMessage("Enter a Case ID or Order Number to auto-fill.");
      return;
    }
    setAutofilling(true);
    setMessage(null);
    try {
      const data = await autofillDeliveryChallan(token, { caseId, orderNumber });
      if (!data) {
        setMessage("No matching case found — you can fill the details manually.");
        return;
      }
      // Adding the same case twice would print its serial, product and parts twice.
      const found = data.caseId?.trim();
      if (found && challanLines(form.caseIds).includes(found)) {
        setMessage(`Case ${found} is already on this challan.`);
        return;
      }
      setForm((f) => applyChallanAutofill(f, data));
      setLookupCaseId("");
      setLookupOrderNumber("");
      const parts = (data.items ?? []).length;
      setMessage(
        `Added case ${found || orderNumber || caseId}` +
          (parts > 0 ? ` with ${parts} part${parts === 1 ? "" : "s"}` : "") +
          ". Review it, then add another case or save.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Auto-fill failed");
    } finally {
      setAutofilling(false);
    }
  }

  async function handleSave() {
    if (!form.branchKey) {
      setMessage("Choose the branch this challan is from.");
      return;
    }
    if (!form.challanDate) {
      setMessage("Choose the challan date.");
      return;
    }
    if (!form.customerName.trim()) {
      setMessage("Customer name is required.");
      return;
    }
    const body = challanRequestBody(form, form.branchKey);
    if (body.items.length === 0) {
      setMessage("Add at least one item under Description of Goods.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const saved = editing
        ? await updateDeliveryChallan(token, editing.id, body)
        : await createDeliveryChallan(token, body);
      setForm(emptyChallanForm(todayIso()));
      setEditing(null);
      // Back on the list, which reloads and so shows the new or corrected challan.
      setMode("list");
      setPrinting(saved); // open the print view straight away
    } catch (error) {
      // An edit that moves the date into another financial year is refused here, with
      // the server's own explanation.
      setMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const setDraft = (key: BranchKey, patch: Partial<ChallanBranchInput>) =>
    setDrafts((current) => {
      const draft = current[key];
      return draft ? { ...current, [key]: { ...draft, ...patch } } : current;
    });

  async function handleSaveBranch(key: BranchKey) {
    const draft = drafts[key];
    if (!draft) return;
    if (!draft.name.trim()) {
      setMessage("The branch name cannot be empty.");
      return;
    }
    setSavingBranch(key);
    setMessage(null);
    try {
      const saved = await updateChallanBranch(token, key, {
        name: draft.name.trim(),
        companyLine: draft.companyLine.trim(),
        addressLines: challanLines(draft.addressLines).join("\n"),
        gstin: draft.gstin.trim(),
        contact: draft.contact.trim(),
        email: draft.email.trim(),
      });
      setBranches((list) => (list ?? []).map((branch) => (branch.branchKey === key ? saved : branch)));
      setDrafts((current) => ({ ...current, [key]: branchDraft(saved) }));
      setMessage(
        `${branchLabel(key)} saved. New challans from ${branchLabel(key)} print these details; ` +
          "challans already raised keep the ones they were raised with.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the branch details");
    } finally {
      setSavingBranch(null);
    }
  }

  // Listed in the fixed branch order, whatever order the server sends them in.
  const orderedBranches = BRANCH_KEYS.map((key) =>
    (branches ?? []).find((branch) => branch.branchKey === key),
  ).filter((branch): branch is ChallanBranch => Boolean(branch));

  const chosenBranchMissing =
    mode === "create" && form.branchKey
      ? missingLetterhead((branches ?? []).find((branch) => branch.branchKey === form.branchKey))
      : [];

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
    // `minWidth: 0` for the reason QuotationsPage gives: `.panel` is a grid item, and
    // without it a wide table widens the whole page instead of scrolling inside itself.
    <section style={{ padding: "8px 4px", minWidth: 0, maxWidth: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>
          {mode === "branches" ? "Delivery Challan · Branch details" : "Delivery Challan"}
        </h2>
        {mode === "list" ? (
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => { setMessage(null); setMode("branches"); }} style={secondaryBtn}>
              Branch details
            </button>
            <button type="button" onClick={startCreate} style={primaryBtn}>
              + New Delivery Challan
            </button>
          </div>
        ) : (
          <button type="button" onClick={backToList} style={secondaryBtn}>
            ← Back to list
          </button>
        )}
      </div>

      {message && (
        <div style={{ fontSize: "12px", color: "#4f46e5", marginBottom: "12px" }}>{message}</div>
      )}

      {mode === "list" ? (
        <>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "14px" }}>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search DC No., customer, Case ID…"
              aria-label="Search delivery challans"
              style={{ ...field, maxWidth: "360px" }}
            />
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value as BranchKey | "")}
              aria-label="Filter by branch"
              style={{ ...field, width: "auto", minWidth: "160px" }}
            >
              <option value="">All branches</option>
              {BRANCH_KEYS.map((key) => (
                <option key={key} value={key}>{BRANCH_LABELS[key]}</option>
              ))}
            </select>
          </div>
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
                  <th style={th}>DC No.</th>
                  <th style={th}>Date</th>
                  <th style={th}>Branch</th>
                  <th style={th}>Customer</th>
                  <th style={th}>Case IDs</th>
                  <th style={{ ...th, ...stickyActions, background: "var(--th-bg, #f3f4f6)" }}>Challan</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ ...td, textAlign: "center", padding: "26px", color: "#6b7280" }}>Loading…</td></tr>
                ) : listError ? (
                  <tr>
                    <td
                      colSpan={6}
                      role="alert"
                      style={{ ...td, textAlign: "center", padding: "26px", color: "#b91c1c", whiteSpace: "normal" }}
                    >
                      {listError}
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ ...td, textAlign: "center", padding: "26px", color: "#6b7280" }}>
                      {search.trim() || branchFilter ? "No delivery challans match." : "No delivery challans yet."}
                    </td>
                  </tr>
                ) : (
                  rows.map((c) => (
                    <tr key={c.id} data-testid="dc-row">
                      <td style={{ ...td, fontWeight: 700 }}>
                        {c.dcSeq}{" "}
                        <span style={{ marginLeft: "4px", color: "#64748b", fontWeight: 500 }}>{c.finYear}</span>
                      </td>
                      <td style={td}>{formatChallanDate(c.challanDate)}</td>
                      <td style={td}>{branchLabel(c.branchKey, c.branchHeader?.name)}</td>
                      <td style={td}>{c.customerName || "-"}</td>
                      <td style={tdWide} title={challanLines(c.caseIds).join(", ") || undefined}>
                        {challanLines(c.caseIds).join(", ") || "-"}
                      </td>
                      <td style={{ ...td, ...stickyActions }}>
                        <button type="button" onClick={() => setPrinting(c)} style={linkBtn}>View / Print</button>
                        <span style={{ color: "#d1d5db", margin: "0 6px" }}>|</span>
                        <button type="button" onClick={() => startEdit(c)} style={linkBtn}>Edit</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!loading && !listError && total > rows.length ? (
            <div style={{ marginTop: "8px", fontSize: "12px", color: "#64748b" }}>
              Showing the newest {rows.length} of {total}. Search by DC No., customer or Case ID to
              find an older one.
            </div>
          ) : null}
        </>
      ) : mode === "branches" ? (
        <div style={{ maxWidth: "860px" }}>
          <p style={{ margin: "0 0 14px 0", fontSize: "13px", color: "#475569" }}>
            Each branch&apos;s letterhead prints at the top left of its challans. A challan keeps
            the details as they were on the day it was raised, so a change here applies to new
            challans only.
            {canEditBranches ? null : " Only a super admin can change these."}
          </p>
          {branchesError ? (
            <div role="alert" style={{ fontSize: "13px", color: "#b91c1c", marginBottom: "12px" }}>
              {branchesError}
            </div>
          ) : branches === null ? (
            <div style={{ fontSize: "13px", color: "#6b7280" }}>Loading…</div>
          ) : null}
          {orderedBranches.map((branch) => {
            const key = branch.branchKey;
            const name = branchLabel(key, branch.name);
            const draft = drafts[key];
            return (
              <div
                key={key}
                data-testid="dc-branch"
                style={{
                  marginBottom: "12px",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  border: "1px solid var(--border-color, #e2e8f0)",
                  background: "var(--panel-soft-bg, #fbfcfe)",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap", marginBottom: "8px" }}>
                  <strong style={{ fontSize: "14px" }}>{name}</strong>
                  <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                    {branch.updatedAt
                      ? `Last changed ${branch.updatedAt.slice(0, 10)}${branch.updatedBy ? ` by ${branch.updatedBy}` : ""}`
                      : "Not changed since it was set up"}
                  </span>
                </div>
                {canEditBranches && draft ? (
                  <>
                    <div style={grid2}>
                      <Text label="Branch name" ariaLabel={`${name} branch name`} value={draft.name} onChange={(v) => setDraft(key, { name: v })} />
                      <Text label="Company line" ariaLabel={`${name} company line`} value={draft.companyLine} onChange={(v) => setDraft(key, { companyLine: v })} />
                      <Text label="GSTIN/UIN" ariaLabel={`${name} GSTIN/UIN`} value={draft.gstin} onChange={(v) => setDraft(key, { gstin: v })} />
                      <Text label="Contact" ariaLabel={`${name} contact`} value={draft.contact} onChange={(v) => setDraft(key, { contact: v })} />
                      <Text label="E-Mail" ariaLabel={`${name} e-mail`} value={draft.email} onChange={(v) => setDraft(key, { email: v })} />
                    </div>
                    <div style={{ marginTop: "12px" }}>
                      <TextArea
                        label="Address (one line per line)"
                        ariaLabel={`${name} address`}
                        value={draft.addressLines}
                        onChange={(v) => setDraft(key, { addressLines: v })}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSaveBranch(key)}
                      disabled={savingBranch !== null}
                      style={{ ...primaryBtn, marginTop: "10px" }}
                    >
                      {savingBranch === key ? "Saving…" : `Save ${name}`}
                    </button>
                  </>
                ) : (
                  <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 14px", fontSize: "13px" }}>
                    <dt style={dt}>Company line</dt>
                    <dd style={dd}>{branch.companyLine || "—"}</dd>
                    <dt style={dt}>Address</dt>
                    <dd style={dd}>
                      {challanLines(branch.addressLines).length > 0
                        ? challanLines(branch.addressLines).map((line, index) => <div key={index}>{line}</div>)
                        : "—"}
                    </dd>
                    <dt style={dt}>GSTIN/UIN</dt>
                    <dd style={dd}>{branch.gstin || "—"}</dd>
                    <dt style={dt}>Contact</dt>
                    <dd style={dd}>{branch.contact || "—"}</dd>
                    <dt style={dt}>E-Mail</dt>
                    <dd style={dd}>{branch.email || "—"}</dd>
                  </dl>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ maxWidth: "860px" }}>
          {/* Which challan is being corrected. Shown because neither the number nor the
              branch changes on an edit — the customer's copy still carries them — and the
              server refuses a date outside the number's financial year. */}
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
              Editing <strong>DC No. {editing.dcSeq}</strong> ({editing.finYear},{" "}
              {branchLabel(editing.branchKey, editing.branchHeader?.name)}) — the number and branch
              stay the same, and the date must stay within {editing.finYear}.
              {editing.updatedAt ? (
                <span style={{ color: "#a16207" }}>
                  {" "}Last edited {editing.updatedAt.slice(0, 10)}
                  {editing.updatedBy ? ` by ${editing.updatedBy}` : ""}.
                </span>
              ) : null}
            </div>
          ) : null}

          <div style={grid2}>
            <div>
              <label style={label}>Branch *</label>
              <select
                aria-label="Branch"
                value={form.branchKey}
                // The branch is part of the number, so it is fixed once the challan exists.
                disabled={Boolean(editing)}
                onChange={(e) => set({ branchKey: e.target.value as BranchKey | "" })}
                style={field}
              >
                <option value="">Choose a branch…</option>
                {BRANCH_KEYS.map((key) => (
                  <option key={key} value={key}>{BRANCH_LABELS[key]}</option>
                ))}
              </select>
            </div>
            <Text label="Challan Date" value={form.challanDate} onChange={(v) => set({ challanDate: v })} type="date" />
          </div>

          {chosenBranchMissing.length > 0 ? (
            <div
              role="note"
              style={{
                marginTop: "12px",
                padding: "10px 14px",
                borderRadius: "8px",
                background: "#fffbeb",
                border: "1px solid #fde68a",
                fontSize: "12px",
                color: "#92400e",
              }}
            >
              {branchLabel(form.branchKey)}&apos;s letterhead has no {chosenBranchMissing.join(", ")} yet.
              A challan keeps the branch details as they are when it is saved
              {canEditBranches
                ? " — fill them in under Branch details first."
                : ", so ask a super admin to fill them in first."}
            </div>
          ) : null}

          {/* Auto-fill row. Each case looked up is ADDED to the challan. */}
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap", marginTop: "16px" }}>
            <div style={{ flex: "1 1 200px" }}>
              <label style={label}>Case ID</label>
              <input aria-label="Case ID" style={field} value={lookupCaseId} onChange={(e) => setLookupCaseId(e.target.value)} />
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <label style={label}>Order Number (WO)</label>
              <input aria-label="Order Number (WO)" style={field} value={lookupOrderNumber} onChange={(e) => setLookupOrderNumber(e.target.value)} />
            </div>
            <button type="button" onClick={() => void handleAutofill()} disabled={autofilling} style={secondaryBtn}>
              {autofilling ? "Filling…" : "Auto-fill from case"}
            </button>
          </div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "6px", marginBottom: "16px" }}>
            Each case adds its Case ID, serial, product number and product name as a new line
            below, and its parts as new rows of goods. The customer is filled in only where it is
            still empty.
          </div>

          <div style={grid2}>
            <Text label="Customer Name *" ariaLabel="Customer Name" value={form.customerName} onChange={(v) => set({ customerName: v })} />
            <Text label="Customer Phone" value={form.customerPhone} onChange={(v) => set({ customerPhone: v })} />
            <Text label="Customer Email" value={form.customerEmail} onChange={(v) => set({ customerEmail: v })} />
          </div>
          <div style={{ marginTop: "12px" }}>
            <TextArea label="Customer Address" value={form.customerAddress} onChange={(v) => set({ customerAddress: v })} />
          </div>

          <div style={grid2}>
            <Text label="Ref No. & Date" value={form.refNoDate} onChange={(v) => set({ refNoDate: v })} />
            <Text label="Mode/Terms of Payment" value={form.modeTerms} onChange={(v) => set({ modeTerms: v })} />
            <Text label="Other References" value={form.otherReferences} onChange={(v) => set({ otherReferences: v })} />
          </div>

          <div style={{ marginTop: "18px", display: "flex", alignItems: "center", gap: "10px", fontWeight: 700, fontSize: "13px" }}>
            <span>Cases and products</span>
            <span style={{ fontWeight: 500, color: "#94a3b8", fontSize: "12px" }}>
              one per line — several print side by side
            </span>
          </div>
          <div style={grid2}>
            <TextArea label="Case IDs" value={form.caseIds} onChange={(v) => set({ caseIds: v })} />
            <TextArea label="Product Serials" value={form.productSerials} onChange={(v) => set({ productSerials: v })} />
            <TextArea label="Product Numbers" value={form.productNumbers} onChange={(v) => set({ productNumbers: v })} />
            <TextArea label="Product Names" value={form.productNames} onChange={(v) => set({ productNames: v })} />
          </div>

          {/* The goods — one row each, added and removed freely. */}
          <div style={{ marginTop: "18px", display: "flex", alignItems: "center", gap: "10px", fontWeight: 700, fontSize: "13px" }}>
            <span>Goods</span>
            <span style={{ fontWeight: 500, color: "#94a3b8", fontSize: "12px" }}>
              {form.items.length} row{form.items.length === 1 ? "" : "s"}
            </span>
          </div>
          <div style={{ overflowX: "auto", minWidth: 0, maxWidth: "100%", marginTop: "8px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr>
                  <th style={{ ...itemTh, width: "36px" }}>#</th>
                  <th style={{ ...itemTh, minWidth: "220px" }}>Description of Goods</th>
                  <th style={{ ...itemTh, width: "110px" }}>HSN/SAC</th>
                  <th style={{ ...itemTh, width: "70px" }}>Qty</th>
                  <th style={{ ...itemTh, width: "90px" }}>Rate</th>
                  <th style={{ ...itemTh, width: "90px" }}>Per</th>
                  <th style={{ ...itemTh, width: "90px" }} />
                </tr>
              </thead>
              <tbody>
                {form.items.map((item, index) => (
                  <tr key={index}>
                    <td style={{ ...itemTd, color: "#64748b", fontWeight: 700 }}>{index + 1}</td>
                    <td style={itemTd}>
                      <input aria-label={`Item ${index + 1} Description of Goods`} style={field} value={item.description} onChange={(e) => setItem(index, { description: e.target.value })} />
                    </td>
                    <td style={itemTd}>
                      <input aria-label={`Item ${index + 1} HSN/SAC`} style={field} value={item.hsnSac} onChange={(e) => setItem(index, { hsnSac: e.target.value })} />
                    </td>
                    <td style={itemTd}>
                      <input aria-label={`Item ${index + 1} Qty`} style={field} value={item.qty} onChange={(e) => setItem(index, { qty: e.target.value })} />
                    </td>
                    <td style={itemTd}>
                      <input aria-label={`Item ${index + 1} Rate`} style={field} value={item.rate} onChange={(e) => setItem(index, { rate: e.target.value })} />
                    </td>
                    <td style={itemTd}>
                      <input aria-label={`Item ${index + 1} Per`} style={field} value={item.per} onChange={(e) => setItem(index, { per: e.target.value })} />
                    </td>
                    <td style={itemTd}>
                      {form.items.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          aria-label={`Remove item ${index + 1}`}
                          style={{
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
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={addItem}
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
            + Add row
          </button>

          <div style={{ marginTop: "20px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={() => void handleSave()} disabled={saving} style={primaryBtn}>
              {saving
                ? "Saving…"
                : editing
                  ? "Save changes"
                  : "Save & generate challan"}
            </button>
            <button type="button" onClick={backToList} style={secondaryBtn}>
              Cancel
            </button>
            {message && (
              <span style={{ fontSize: "12px", color: "#dc2626", fontWeight: 600 }}>{message}</span>
            )}
          </div>
        </div>
      )}

      {printing && <PrintOverlay c={printing} onClose={() => setPrinting(null)} />}
    </section>
  );
}

function Text({
  label: lbl, value, onChange, type = "text", ariaLabel,
}: Readonly<{ label: string; value: string; onChange: (v: string) => void; type?: string; ariaLabel?: string }>) {
  return (
    <div>
      <label style={{ fontSize: "12px", fontWeight: 600, marginBottom: "4px", display: "block" }}>{lbl}</label>
      <input
        type={type}
        value={value}
        aria-label={ariaLabel ?? lbl}
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

function TextArea({
  label: lbl, value, onChange, ariaLabel,
}: Readonly<{ label: string; value: string; onChange: (v: string) => void; ariaLabel?: string }>) {
  return (
    <div>
      <label style={{ fontSize: "12px", fontWeight: 600, marginBottom: "4px", display: "block" }}>{lbl}</label>
      <textarea
        value={value}
        aria-label={ariaLabel ?? lbl}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 10px",
          fontSize: "13px",
          borderRadius: "8px",
          border: "1px solid var(--border-color, #d1d5db)",
          background: "var(--input-bg, #f9fafb)",
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />
    </div>
  );
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Full-screen overlay hosting the printable sheet + a Print button — as Quotations does it. */
function PrintOverlay({ c, onClose }: Readonly<{ c: DeliveryChallan; onClose: () => void }>) {
  const ref = useRef<HTMLDivElement | null>(null);

  function doPrint() {
    // Print only the sheet: open its markup in a new window and print that.
    const sheet = ref.current?.querySelector(".deliveryChallanSheet");
    if (!sheet) { window.print(); return; }
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) { window.print(); return; }
    // The title becomes the saved PDF's file name.
    const title = `DC ${c.dcSeq} ${c.finYear} ${branchLabel(c.branchKey, c.branchHeader?.name)}`;
    w.document.write(
      `<!doctype html><html><head><title>${escapeHtml(title)}</title>` +
      // print-color-adjust keeps the yellow band yellow on paper.
      `<style>@page{size:A4;margin:0} body{margin:0} *{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>` +
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
        <DeliveryChallanPrint c={c} />
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
/** The Case IDs cell: a challan can carry several, so it is capped and clipped like an email. */
const tdWide: React.CSSProperties = {
  ...td,
  maxWidth: "240px",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const itemTh: React.CSSProperties = { padding: "6px 6px", fontWeight: 700, textAlign: "left", fontSize: "12px", whiteSpace: "nowrap" };
const itemTd: React.CSSProperties = { padding: "4px 6px", borderBottom: "1px solid #f0f1f4", verticalAlign: "middle" };
const dt: React.CSSProperties = { color: "#64748b", fontWeight: 600 };
const dd: React.CSSProperties = { margin: 0 };

/**
 * The actions column, pinned to the right edge — a row whose actions have scrolled out of
 * sight reads as a row with no actions (see QuotationsPage).
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
