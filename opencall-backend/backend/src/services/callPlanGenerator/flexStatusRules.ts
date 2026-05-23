export const FLEX_STATUS_REQUEST_TO_CANCEL = "request to cancel";

function normalizeFlexStatus(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function isRequestToCancelFlexStatus(
  value: string | null | undefined,
): boolean {
  return normalizeFlexStatus(value) === FLEX_STATUS_REQUEST_TO_CANCEL;
}
