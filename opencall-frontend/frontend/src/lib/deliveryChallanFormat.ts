// Helpers shared by the delivery challan form and its printed sheet, so the two can never
// read the same field differently.

import type {
  BranchKey,
  ChallanBranch,
  DeliveryChallan,
  DeliveryChallanAutofill,
  DeliveryChallanInput,
  DeliveryChallanItem,
} from "./deliveryChallanApiClient";

/** "2026-10-07" → "07-10-2026", the way the challan prints its date. */
export function formatChallanDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * A one-per-line field as its lines: each trimmed, blank lines dropped. Case IDs, serials,
 * product numbers, product names and the letterhead's address are all stored this way.
 */
export function challanLines(text: string | null | undefined): string[] {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export const EMPTY_CHALLAN_ITEM: DeliveryChallanItem = {
  description: "",
  hsnSac: "",
  qty: "",
  rate: "",
  per: "",
};

/**
 * What the form holds: the request body, except that the branch may not be chosen yet.
 * A new challan starts with no branch on purpose — the branch is part of the number and
 * can never be changed afterwards, so it is picked, not defaulted.
 */
export type DeliveryChallanForm = Omit<DeliveryChallanInput, "branchKey"> & {
  branchKey: BranchKey | "";
};

export function emptyChallanForm(challanDate: string): DeliveryChallanForm {
  return {
    branchKey: "",
    challanDate,
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    customerAddress: "",
    caseIds: "",
    productSerials: "",
    productNumbers: "",
    productNames: "",
    refNoDate: "",
    modeTerms: "",
    otherReferences: "",
    // The goods table starts on one empty row.
    items: [{ ...EMPTY_CHALLAN_ITEM }],
  };
}

function toItem(item: Partial<DeliveryChallanItem> | null | undefined): DeliveryChallanItem {
  return {
    description: String(item?.description ?? ""),
    hsnSac: String(item?.hsnSac ?? ""),
    qty: String(item?.qty ?? ""),
    rate: String(item?.rate ?? ""),
    per: String(item?.per ?? ""),
  };
}

/** An existing challan loaded back into the form, for correcting it. */
export function challanFormFrom(c: DeliveryChallan): DeliveryChallanForm {
  const items = (c.items ?? []).map(toItem);
  return {
    branchKey: c.branchKey,
    challanDate: String(c.challanDate ?? "").slice(0, 10),
    customerName: c.customerName ?? "",
    customerPhone: c.customerPhone ?? "",
    customerEmail: c.customerEmail ?? "",
    customerAddress: c.customerAddress ?? "",
    caseIds: c.caseIds ?? "",
    productSerials: c.productSerials ?? "",
    productNumbers: c.productNumbers ?? "",
    productNames: c.productNames ?? "",
    refNoDate: c.refNoDate ?? "",
    modeTerms: c.modeTerms ?? "",
    otherReferences: c.otherReferences ?? "",
    items: items.length > 0 ? items : [{ ...EMPTY_CHALLAN_ITEM }],
  };
}

/** A goods row with nothing typed in it. Never sent, and replaced by auto-filled rows. */
export function isBlankChallanItem(item: DeliveryChallanItem): boolean {
  return [item.description, item.hsnSac, item.qty, item.rate, item.per].every(
    (value) => !String(value ?? "").trim(),
  );
}

/** Add one value to a one-per-line field as its new last line. A blank value adds nothing. */
export function appendLine(text: string, value: string | null | undefined): string {
  const line = String(value ?? "").trim();
  if (!line) return text;
  return [...challanLines(text), line].join("\n");
}

/**
 * Add one case to the challan.
 *
 * A challan can carry several replacements, so auto-fill ADDS rather than replaces: the
 * case's ID, serial, product number and product name each go on as a new line, and its
 * parts as new rows of goods (taking the place of the empty starting row, so the sheet
 * does not print a blank "1"). The customer is filled in only where the form has none yet
 * — the first case decides it, and anything typed by hand is never overwritten.
 */
export function applyChallanAutofill(
  form: DeliveryChallanForm,
  data: DeliveryChallanAutofill,
): DeliveryChallanForm {
  const keep = (current: string, incoming: string | null | undefined) =>
    current.trim() ? current : String(incoming ?? "").trim();
  const items = [
    ...form.items.filter((item) => !isBlankChallanItem(item)),
    ...(data.items ?? []).map(toItem).filter((item) => !isBlankChallanItem(item)),
  ];
  return {
    ...form,
    customerName: keep(form.customerName, data.customerName),
    customerPhone: keep(form.customerPhone, data.customerPhone),
    customerEmail: keep(form.customerEmail, data.customerEmail),
    customerAddress: keep(form.customerAddress, data.customerAddress),
    caseIds: appendLine(form.caseIds, data.caseId),
    productSerials: appendLine(form.productSerials, data.productSerial),
    productNumbers: appendLine(form.productNumbers, data.productNumber),
    productNames: appendLine(form.productNames, data.productName),
    items: items.length > 0 ? items : [{ ...EMPTY_CHALLAN_ITEM }],
  };
}

/**
 * The form as the request body: text trimmed, the one-per-line fields without blank lines,
 * and empty goods rows left out. Exactly the fields of the API contract, nothing more.
 */
export function challanRequestBody(
  form: DeliveryChallanForm,
  branchKey: BranchKey,
): DeliveryChallanInput {
  const lines = (value: string) => challanLines(value).join("\n");
  return {
    branchKey,
    challanDate: form.challanDate,
    customerName: form.customerName.trim(),
    customerPhone: form.customerPhone.trim(),
    customerEmail: form.customerEmail.trim(),
    customerAddress: form.customerAddress.trim(),
    caseIds: lines(form.caseIds),
    productSerials: lines(form.productSerials),
    productNumbers: lines(form.productNumbers),
    productNames: lines(form.productNames),
    refNoDate: form.refNoDate.trim(),
    modeTerms: form.modeTerms.trim(),
    otherReferences: form.otherReferences.trim(),
    items: form.items
      .filter((item) => !isBlankChallanItem(item))
      .map((item) => ({
        description: item.description.trim(),
        hsnSac: item.hsnSac.trim(),
        qty: item.qty.trim(),
        rate: item.rate.trim(),
        per: item.per.trim(),
      })),
  };
}

/**
 * The parts of a branch's letterhead still empty. A challan keeps a copy of the letterhead
 * as it is on the day it is saved, so one raised before these are filled in prints without
 * them for good.
 */
export function missingLetterhead(branch: ChallanBranch | null | undefined): string[] {
  if (!branch) return [];
  const fields: Array<[string, string]> = [
    ["company line", branch.companyLine],
    ["address", branch.addressLines],
    ["GSTIN/UIN", branch.gstin],
    ["contact", branch.contact],
    ["e-mail", branch.email],
  ];
  return fields.filter(([, value]) => !String(value ?? "").trim()).map(([name]) => name);
}
