import type { Quotation, QuotationLineItem } from "./quotationApiClient";

/**
 * The money on a quotation, in one place.
 *
 * The same three lines were being written in the create form, the mobile form and the
 * printed sheet. A quotation whose sheet disagrees with the form that produced it is a
 * document sent to a customer with the wrong number on it, so the arithmetic lives here
 * and is tested once.
 */

export interface QuotationTotals {
  /** Sum of the line items — what the sheet prints as "Total Amount". */
  subtotal: number;
  sgst: number;
  cgst: number;
  totalTax: number;
  /** Subtotal + both taxes. */
  total: number;
}

export function quotationTotals(
  items: readonly Pick<QuotationLineItem, "baseAmount">[],
  sgstPercent: number,
  cgstPercent: number,
): QuotationTotals {
  const subtotal = items.reduce((sum, item) => sum + (Number(item.baseAmount) || 0), 0);
  const sgst = (subtotal * sgstPercent) / 100;
  const cgst = (subtotal * cgstPercent) / 100;
  return { subtotal, sgst, cgst, totalTax: sgst + cgst, total: subtotal + sgst + cgst };
}

/**
 * The priced rows of a saved quotation.
 *
 * A quotation raised before line items existed — or one read by a build whose backfill has
 * not run yet — carries none, and its single item lives in the parent columns. Falling
 * back to those is what stops an old quotation re-printing as a blank sheet.
 */
export function resolveLineItems(quotation: Quotation): QuotationLineItem[] {
  if (quotation.lineItems && quotation.lineItems.length > 0) return quotation.lineItems;
  return [
    {
      serviceDescription: quotation.serviceDescription,
      productDescription: quotation.productDescription,
      modelNo: quotation.modelNo,
      serialNo: quotation.serialNo,
      baseAmount: quotation.baseAmount,
    },
  ];
}
