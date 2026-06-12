// Pure WO OTC code utilities extracted from app/page.tsx (Phase 3).
// Moved verbatim — no behavior changes.

export function normalizeWoOtcCode(value: string | number | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[–—−]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ");
}

export function getWoOtcCodePrefix(value: string | number | null | undefined): string {
  return normalizeWoOtcCode(value).match(/^[A-Z0-9]+/)?.[0] ?? "";
}
