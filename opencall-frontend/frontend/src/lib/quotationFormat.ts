// Fixed RENDERWAYS company details + helpers for the printable quotation. Kept in one
// place so the printable template and any future export use identical constants.

export const QUOTATION_COMPANY = {
  name: "RENDERWAYS TECHNOLOGY PVT LTD",
  addressLines: [
    "# 25, First Floor, Gandhi Street, Mettukuppam",
    "Maduravoyal, Chennai - 600095",
    "Tamil Nadu",
  ],
  gst: "33AALCR1788A1ZG",
  pan: "AALCR1788A",
  phone: "9543095480",
  email: "chennai@renderways.in",
  bank: {
    name: "Bank of Baroda, Maduravoyal",
    account: "43770200000450",
    ifsc: "BARB0MADTHI",
  },
} as const;

export const QUOTATION_TERMS: readonly string[] = [
  "You are requested to approve the above Service / Part estimate charges to enable us to take up the repair.",
  "The service charges are for troubleshooting, post making the payment the engineer shall visit, in case any parts required additional part estimate will be provided.",
  "Part estimate will be provided by us separately If Part required to complete the service.",
  "The necessary order for the parts will be done post we receive the payments.",
  "Estimate Quote is valid for 5 days from the Quoted date.",
  "Payment should be 100% in advance through online mode only. Please don't do any cash transactions.",
  "Upon making the payment towards service estimate charges as above please do share us the confirmation of the payment thru mail.",
  "The service estimate charges will be applicable for respective products should be paid in advance thru online mode only.",
  "Authorization by way of P.O is required if Quoted value is Rs.10000/- & above.",
  "Repaired units should be collected within 7 days of completion of repair.",
  "Part will be replaced within 4 – 5 Weeks from the date of Quote approval & Advance Payment made subject to part availability.",
  "Above-mentioned activity will be performed only during office hours (i.e. Mon to Fri 9.00 AM to 5.00 PM).",
  "During the course of the repair, additional parts may be required to service the unit. In such case an additional quote will be raised.",
  "Defective Parts that have been replaced with working Parts shall be returned to HP for disposal in accordance with e-waste Rules.",
  "Should you need any further clarification please feel free contact the undersigned.",
];

/** Formats a number as "1,23,456.78" (Indian grouping) with two decimals. */
export function formatMoney(value: number): string {
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 2026-05-04 → "04 May 2026" (matches the quotation date format). */
export function formatQuotationDate(iso: string): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const day = m[3];
  const monthName = months[Number(m[2]) - 1] ?? "";
  return `${day} ${monthName} ${m[1]}`;
}

// --- number → Indian-English words (for "Rupees … Only") ---

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  const t = Math.floor(n / 10);
  const o = n % 10;
  return `${TENS[t]}${o ? " " + ONES[o] : ""}`;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(" ");
}

/** 590 → "Five Hundred Ninety". Indian system (thousand / lakh / crore). */
function numberToWords(n: number): string {
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const hundred = n % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** 590 → "Rupees Five Hundred Ninety Only" (paise included when present). */
export function amountInWords(amount: number): string {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let text = `Rupees ${numberToWords(rupees)}`;
  if (paise > 0) {
    text += ` and ${numberToWords(paise)} Paise`;
  }
  return `${text} Only`;
}
