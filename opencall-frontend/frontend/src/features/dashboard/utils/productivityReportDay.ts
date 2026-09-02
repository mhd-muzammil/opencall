/**
 * Which single day the Engineer Productivity view is showing, as YYYY-MM-DD.
 *
 * Needed because distance is recorded PER DAY. The call counts on that page can
 * cover a month or an arbitrary range; kilometres cannot, so the KM column has
 * to know whether it is looking at one day or not, and which one.
 *
 * This exists as its own function because getting it wrong is invisible. The
 * first cut read `productivityFromDate`, which is only bound to the custom-range
 * inputs and stays "" for every other filter -- including "Specific Date", the
 * default. The page header said "02-09-2026" while every KM cell showed a dash,
 * and nothing anywhere said why.
 */

/** How the view is filtered. Only "Specific Date" carries a day of its own. */
export const SPECIFIC_DATE = "Specific Date";

export function productivityReportDay(input: {
  filterType: string;
  /** For "Specific Date", the day as DD-MM-YYYY. Empty for other filters. */
  selectedValue: string;
  /** The custom-range inputs. type="date", so already ISO. */
  fromDate?: string;
  toDate?: string;
}): string | null {
  const { filterType, selectedValue, fromDate, toDate } = input;

  if (filterType === SPECIFIC_DATE && selectedValue) {
    // DD-MM-YYYY to YYYY-MM-DD, the same flip app/page.tsx does when it fetches
    // a past day's report. If that one changes, this has to change with it.
    const parts = selectedValue.split("-");
    if (parts.length === 3 && parts[2]?.length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    // Already ISO, or something we do not recognise: hand it back rather than
    // mangle it. A malformed date reaches the roster call and comes back empty,
    // which shows a dash -- the same as no answer, and no worse.
    return selectedValue;
  }

  // A custom range of exactly one day is still one day.
  if (fromDate && fromDate === toDate) {
    return fromDate;
  }

  // A month, or a range wider than a day. There is no honest single figure.
  return null;
}
