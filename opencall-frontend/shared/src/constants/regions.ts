export const ASP_CODE_REGION_MAP: Record<string, string> = {
  ASPS01461: "CHENNAI",
  ASPS01463: "VELLORE",
  ASPS01465: "SALEM",
  ASPS01489: "KANCHIPURAM",
  ASPS01511: "HOSUR",
};

export function regionNameForAspCode(aspCode: string): string {
  return ASP_CODE_REGION_MAP[aspCode] ?? "Unknown Region";
}
