// Manual engineer-name aliases for the Engineer Productivity dashboard.
//
// The dashboard already merges pure casing differences automatically — e.g.
// "sriram" and "Sriram" collapse into one engineer without any entry here.
//
// This map is ONLY for genuinely different spellings that refer to the same
// person and cannot be detected safely on their own (e.g. "Lava Kumar" and
// "Lava", or an initial like "vk"). Each entry maps a raw variant to the
// canonical name that should be displayed and counted.
//
//   KEY:   the variant as it appears in the report — lower-cased and trimmed.
//   VALUE: the canonical engineer name to show.
//
// Only add pairs you are CERTAIN are the same engineer. Do not add e.g.
// "erode vijay" -> "Vijay" unless they truly are one person — a wrong entry
// silently merges two different engineers' numbers.
export const ENGINEER_NAME_ALIASES: Readonly<Record<string, string>> = {
  "lava kumar": "Lava",
};

/**
 * Resolve a raw engineer name to its canonical form: an explicit alias when one
 * exists, otherwise the trimmed name as-is. Casing is handled by the caller.
 */
export function canonicalEngineerName(rawName: string): string {
  const trimmed = rawName.trim();
  return ENGINEER_NAME_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}
